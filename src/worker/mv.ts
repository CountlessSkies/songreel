// MV: luu tru, khoa va day tung buoc. Moi MV moi chay pipeline ke chuyen trong mvStory.ts (moi muc deu dung,
// chi khac model quay video). Ghep video lam tren trinh duyet.
// Chay tung buoc trong advanceMv(), duoc goi tu GET /api/mv/:id va tu cron, giong pipeline bai hat.
// MV cu (mode 'hybrid'/'full', pipeline da go) chi con xem lai duoc.
import {type MvMode, type MvRatio, type MvScene, type MvTier, type MvView} from '../shared/mv';
import {advanceStory, initStory, STORY_ACTIVE, storyView, type StoryStage} from './mvStory';
import {getRow, type Env} from './pipeline';

/** Tu luc tao toi storyboard, va tu luc duyet toi xong clip. Thoi gian cho khach duyet khong tinh. */
const FRAMES_TIMEOUT_MS = 40 * 60_000;
const CLIPS_TIMEOUT_MS = 60 * 60_000;
const MAX_PHOTOS = 3;

type Stage = StoryStage | 'ready' | 'failed';
/** Cac buoc con chay (cron/GET day tiep). 'review' dung cho khach duyet. */
const ACTIVE: Stage[] = [...STORY_ACTIVE];
const ACTIVE_SQL = ACTIVE.map(s => `'${s}'`).join(',');
const LOCK_MS: Partial<Record<Stage, number>> = {timing: 150_000, script: 420_000};

type Row = {
  id: string;
  order_id: string;
  created_at: number;
  updated_at: number;
  mode: MvMode;
  ratio: MvRatio;
  take: number;
  duration: number;
  stage: Stage;
  photos: number;
  scenes: string;
  cost_usd: number;
  llm_tokens: number;
  error: string | null;
  busy_until: number | null;
  story: string | null;
  approved_at: number | null;
};

export type MvInput = {
  orderId: string;
  tier: MvTier;
  ratio: MvRatio;
  take: number;
  duration: number;
  photos: {bytes: ArrayBuffer; type: string}[];
};

export async function createMv(env: Env, i: MvInput): Promise<string> {
  const order = await getRow(env, i.orderId);
  if (!order || order.stage !== 'ready' || !order.lyrics) throw new Error('Bài hát chưa xong.');
  const takes = order.takes ? JSON.parse(order.takes) : [];
  if (!takes[i.take]) throw new Error('Không có bản nhạc này.');
  if (!(i.duration >= 30 && i.duration <= 600)) throw new Error('Độ dài bài không hợp lệ.');
  if (i.photos.length > MAX_PHOTOS) throw new Error(`Tối đa ${MAX_PHOTOS} ảnh.`);

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  for (let n = 0; n < i.photos.length; n++) {
    await env.BLOBS.put(`mvphoto/${id}/${n}`, i.photos[n].bytes, {metadata: {contentType: i.photos[n].type}, expirationTtl: 7 * 86400});
  }
  // Chia canh o buoc 'timing', sau khi do moc loi
  const story = JSON.stringify(await initStory(env, i.photos, i.tier));
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO mvs (id, order_id, created_at, updated_at, mode, ratio, take, duration, stage, photos, scenes, story)
     VALUES (?, ?, ?, ?, 'story', ?, ?, ?, 'timing', ?, '[]', ?)`,
  )
    .bind(id, i.orderId, now, now, i.ratio, i.take, i.duration, i.photos.length, story)
    .run();
  return id;
}

export const getMvRow = (env: Env, id: string) => env.DB.prepare('SELECT * FROM mvs WHERE id = ?').bind(id).first<Row>();

async function lock(env: Env, id: string, ms: number) {
  const now = Date.now();
  const r = await env.DB.prepare(
    `UPDATE mvs SET busy_until = ? WHERE id = ? AND mode = 'story' AND stage IN (${ACTIVE_SQL}) AND (busy_until IS NULL OR busy_until < ?)`,
  )
    .bind(now + ms, id, now)
    .run();
  return r.meta.changes === 1;
}

async function save(env: Env, id: string, f: Partial<Row>) {
  const keys = Object.keys(f);
  const sql = `UPDATE mvs SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ?, busy_until = NULL WHERE id = ?`;
  await env.DB.prepare(sql)
    .bind(...keys.map(k => (f as any)[k]), Date.now(), id)
    .run();
}

const unlock = (env: Env, id: string) => env.DB.prepare('UPDATE mvs SET busy_until = NULL WHERE id = ?').bind(id).run().then(() => {});

async function putUrl(env: Env, key: string, url: string, fallbackType: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Tải file kết quả lỗi ${r.status}`);
  const type = r.headers.get('content-type')?.split(';')[0] || fallbackType;
  await env.BLOBS.put(key, await r.arrayBuffer(), {metadata: {contentType: type}});
}

export async function advanceMv(env: Env, id: string): Promise<void> {
  const row = await getMvRow(env, id);
  if (!row || row.mode !== 'story' || !ACTIVE.includes(row.stage)) return;
  if (!(await lock(env, id, LOCK_MS[row.stage] ?? 60_000))) return;
  try {
    const elapsed = Date.now() - (row.stage === 'clips' ? (row.approved_at ?? row.created_at) : row.created_at);
    if (row.stage === 'clips' && elapsed > CLIPS_TIMEOUT_MS) throw new Error('Quay clip quá 60 phút chưa xong.');
    if (row.stage !== 'clips' && elapsed > FRAMES_TIMEOUT_MS) throw new Error('Dựng storyboard quá 40 phút chưa xong.');
    await advanceStory(env, row, {
      save: f => save(env, id, f as Partial<Row>),
      unlock: () => unlock(env, id),
      putUrl: (key, url, type) => putUrl(env, key, url, type),
    });
  } catch (e) {
    await save(env, id, {stage: 'failed', error: e instanceof Error ? e.message : String(e)});
  }
}

// ── View ────────────────────────────────────────────────────────────────────
export function toMvView(row: Row): MvView {
  const base = {
    id: row.id,
    orderId: row.order_id,
    mode: row.mode,
    ratio: row.ratio,
    take: row.take,
    status: row.stage === 'ready' ? 'ready' : row.stage === 'failed' ? 'failed' : row.stage === 'review' ? 'review' : 'running',
    costUsd: row.cost_usd,
    error: row.error,
  } as const;
  if (row.mode === 'story') return {...base, ...storyView(row)};
  // MV cu: chi tra anh/clip da dung de xem lai va xuat video
  const scenes: MvScene[] = JSON.parse(row.scenes);
  return {
    ...base,
    tier: null,
    status: row.stage === 'ready' ? 'ready' : 'failed',
    scenes: scenes.map(s => ({
      idx: s.idx, start: s.start, end: s.end, section: s.section, lines: s.lines, kind: s.kind, clipSec: s.clipSec,
      imageUrl: s.imageUrl, clipUrl: s.clipUrl, status: s.status,
    })),
  };
}

/** Khach duyet storyboard: chuyen sang quay clip. */
export async function approveMv(env: Env, id: string): Promise<boolean> {
  const now = Date.now();
  const r = await env.DB.prepare(`UPDATE mvs SET stage = 'clips', approved_at = ?, updated_at = ?, busy_until = NULL WHERE id = ? AND stage = 'review'`)
    .bind(now, now, id)
    .run();
  return r.meta.changes === 1;
}

export async function sweepMv(env: Env) {
  const {results} = await env.DB.prepare(
    `SELECT id FROM mvs WHERE mode = 'story' AND stage IN (${ACTIVE_SQL}) AND (busy_until IS NULL OR busy_until < ?) ORDER BY updated_at LIMIT 5`,
  )
    .bind(Date.now())
    .all<{id: string}>();
  await Promise.all(results.map(r => advanceMv(env, r.id)));
}

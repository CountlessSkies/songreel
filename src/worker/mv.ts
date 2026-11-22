// Pipeline MV. Kieu 'hybrid'/'full' (Amateur): Director (LLM chia canh, viet prompt) -> anh nhan vat goc -> anh tung canh
// (Nano Banana 2.1, lay anh goc lam reference) -> clip Seedance 2.0 mini cho canh "clip".
// Kieu 'story' (Pro/Cinematic): xem mvStory.ts. Ghep video lam tren trinh duyet.
// Chay tung buoc trong advanceMv(), duoc goi tu GET /api/mv/:id va tu cron, giong pipeline bai hat.
import {RELS, type Answers, type LyricSection} from '../shared/catalog';
import {planScenes, type MvMode, type MvRatio, type MvScene, type MvView} from '../shared/mv';
import {advanceStory, initStory, STORY_ACTIVE, storyView, type StoryStage} from './mvStory';
import {getRow, type Brief, type Env} from './pipeline';
import {MV_DIRECTOR_SYSTEM, mvDirectorUser} from './prompts';
import {chatText, costOf, isFailure, isSuccess, keepRaw, outputsOf, queryTask, submitClip, submitImage, uploadMedia} from './runninghub';

const DIRECTOR_MODEL = 'openai/gpt-6.1-sol';
const MAX_INFLIGHT = 8; // so task RunningHub chay cung luc cho 1 MV
const MV_TIMEOUT_MS = 45 * 60_000;
/** Kieu story: tu luc tao toi storyboard, va tu luc duyet toi xong clip. Thoi gian cho khach duyet khong tinh. */
const STORY_FRAMES_TIMEOUT_MS = 40 * 60_000;
const STORY_CLIPS_TIMEOUT_MS = 60 * 60_000;
const MAX_TRIES = 2;
const MAX_PHOTOS = 3;

type Stage = 'plan' | 'anchor' | 'scenes' | StoryStage | 'ready' | 'failed';
/** Cac buoc con chay (cron/GET day tiep). 'review' dung cho khach duyet. */
const ACTIVE: Stage[] = ['plan', 'anchor', 'scenes', ...STORY_ACTIVE];
const ACTIVE_SQL = ACTIVE.map(s => `'${s}'`).join(',');

/** Trang thai 1 canh phia server. Prompt va link RunningHub khong tra ra client. */
type SceneRow = MvScene & {
  image?: string;
  motion?: string;
  imgTask?: string | null;
  clipTask?: string | null;
  rhImage?: string | null;
  tries: number;
  clipTries: number;
};

type Bible = {character: string; setting: string; style: string};

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
  bible: string | null;
  anchor_task: string | null;
  anchor_url: string | null;
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
  mode: MvMode;
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
  const isStory = i.mode === 'story';
  // Kieu story chia canh sau khi do moc loi (buoc 'timing'); kieu cu chia ngay theo moc uoc luong
  const lyrics: LyricSection[] = JSON.parse(order.lyrics).sections;
  const scenes: SceneRow[] = isStory
    ? []
    : planScenes(lyrics, i.duration, i.mode).map(p => ({...p, imageUrl: null, clipUrl: null, status: 'pending', tries: 0, clipTries: 0}));
  const story = isStory ? JSON.stringify(await initStory(env, i.photos)) : null;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO mvs (id, order_id, created_at, updated_at, mode, ratio, take, duration, stage, photos, scenes, story)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, i.orderId, now, now, i.mode, i.ratio, i.take, i.duration, isStory ? 'timing' : 'plan', i.photos.length, JSON.stringify(scenes), story)
    .run();
  return id;
}

export const getMvRow = (env: Env, id: string) => env.DB.prepare('SELECT * FROM mvs WHERE id = ?').bind(id).first<Row>();

async function lock(env: Env, id: string, ms: number) {
  const now = Date.now();
  const r = await env.DB.prepare(
    `UPDATE mvs SET busy_until = ? WHERE id = ? AND stage IN (${ACTIVE_SQL}) AND (busy_until IS NULL OR busy_until < ?)`,
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

const LOCK_MS: Partial<Record<Stage, number>> = {plan: 150_000, timing: 150_000, script: 420_000};

export async function advanceMv(env: Env, id: string): Promise<void> {
  const row = await getMvRow(env, id);
  if (!row || !ACTIVE.includes(row.stage)) return;
  if (!(await lock(env, id, LOCK_MS[row.stage] ?? 60_000))) return;
  try {
    if (row.mode === 'story') {
      const elapsed = Date.now() - (row.stage === 'clips' ? (row.approved_at ?? row.created_at) : row.created_at);
      if (row.stage === 'clips' && elapsed > STORY_CLIPS_TIMEOUT_MS) throw new Error('Quay clip quá 60 phút chưa xong.');
      if (row.stage !== 'clips' && elapsed > STORY_FRAMES_TIMEOUT_MS) throw new Error('Dựng storyboard quá 40 phút chưa xong.');
      await advanceStory(env, row, {
        save: f => save(env, id, f as Partial<Row>),
        unlock: () => unlock(env, id),
        putUrl: (key, url, type) => putUrl(env, key, url, type),
      });
      return;
    }
    if (Date.now() - row.created_at > MV_TIMEOUT_MS) throw new Error('Dựng MV quá 45 phút chưa xong.');
    if (row.stage === 'plan') await stepPlan(env, row);
    else if (row.stage === 'anchor') await stepAnchor(env, row);
    else await stepScenes(env, row);
  } catch (e) {
    await save(env, id, {stage: 'failed', error: e instanceof Error ? e.message : String(e)});
  }
}

// ── Director ────────────────────────────────────────────────────────────────
function parseJson(text: string): any {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('AI không trả JSON');
  let body = text.slice(start).replace(/```\s*$/, '');
  for (let i = 0; i < 6; i++) {
    try {
      return JSON.parse(body);
    } catch {
      const end = body.lastIndexOf('}', body.length - 2);
      if (end < 0) break;
      body = body.slice(0, end + 1);
    }
  }
  throw new Error('JSON kịch bản MV không hợp lệ');
}

async function stepPlan(env: Env, row: Row) {
  const order = (await getRow(env, row.order_id))!;
  const brief: Brief = JSON.parse(order.brief);
  const answers: Answers = JSON.parse(order.answers);
  const scenes: SceneRow[] = JSON.parse(row.scenes);
  const out = await chatText(env.RUNNINGHUB_API_KEY, {
    model: DIRECTOR_MODEL,
    system: MV_DIRECTOR_SYSTEM,
    user: mvDirectorUser({
      relation: RELS[answers.rel] ?? 'người thân',
      brief,
      ratio: row.ratio,
      hasPhotos: row.photos > 0,
      scenes: scenes.map(s => ({idx: s.idx, section: s.section, lines: s.lines, kind: s.kind, seconds: s.clipSec})),
    }),
    maxTokens: 8000,
  });
  const plan = parseJson(out.text);
  const bible: Bible = {
    character: String(plan.character ?? '').slice(0, 600),
    setting: String(plan.setting ?? '').slice(0, 600),
    style: String(plan.style ?? '').slice(0, 400),
  };
  if (!bible.character) throw new Error('Kịch bản MV thiếu mô tả nhân vật');
  const byIdx = new Map<number, {image?: string; motion?: string}>();
  for (const s of Array.isArray(plan.scenes) ? plan.scenes : []) byIdx.set(Number(s.idx), s);
  for (const s of scenes) {
    const p = byIdx.get(s.idx);
    s.image = String(p?.image ?? '').slice(0, 1200) || `${bible.character} in ${bible.setting}, a quiet moment: ${s.lines.join(' ') || s.section}.`;
    s.motion = String(p?.motion ?? '').slice(0, 600) || 'Slow push-in, gentle breeze, soft light flicker, the subject breathes and smiles slightly.';
  }
  await save(env, row.id, {
    stage: 'anchor',
    bible: JSON.stringify(bible),
    scenes: JSON.stringify(scenes),
    llm_tokens: row.llm_tokens + out.usage.input + out.usage.output,
  });
}

// ── Anh nhan vat goc ────────────────────────────────────────────────────────
/** Anh khach upload len RunningHub truoc (luat cua RunningHub: khong dua base64/duong dan file vao imageUrls). */
async function photoRefs(env: Env, row: Row): Promise<string[]> {
  const refs: string[] = [];
  for (let n = 0; n < row.photos; n++) {
    const {value, metadata} = await env.BLOBS.getWithMetadata<{contentType?: string}>(`mvphoto/${row.id}/${n}`, 'arrayBuffer');
    if (value) refs.push(await uploadMedia(env.RUNNINGHUB_API_KEY, value, metadata?.contentType ?? 'image/jpeg', `photo${n}.jpg`));
  }
  return refs;
}

async function stepAnchor(env: Env, row: Row) {
  const bible: Bible = JSON.parse(row.bible!);
  if (!row.anchor_task) {
    const refs = await photoRefs(env, row);
    const prompt =
      (refs.length ? 'Use the person in the reference photos; keep their face, age and features exactly. ' : '') +
      `Character reference, medium shot, facing the camera with a calm natural expression: ${bible.character}. ` +
      `Background: ${bible.setting}. ${bible.style}. Photoreal, natural skin texture. No text, no watermark.`;
    const task = await submitImage(env.RUNNINGHUB_API_KEY, {prompt, refs, aspectRatio: row.ratio});
    await save(env, row.id, {anchor_task: task});
    return;
  }
  const res = await queryTask(env.RUNNINGHUB_API_KEY, row.anchor_task);
  await keepRaw(env.BLOBS, res);
  if (isFailure(res.status)) {
    throw new Error(`Không tạo được ảnh nhân vật: ${res.errorMessage || res.errorCode || res.status}${row.photos ? ' (thử ảnh khác)' : ''}`);
  }
  if (!isSuccess(res.status)) return unlock(env, row.id);
  const url = imageOf(res);
  if (!url) throw new Error('RunningHub không trả ảnh nhân vật');
  await putUrl(env, `mvimg/${row.id}/a`, url, 'image/jpeg');
  await save(env, row.id, {stage: 'scenes', anchor_url: url, cost_usd: row.cost_usd + costOf(res)});
}

// ── Anh + clip tung canh ────────────────────────────────────────────────────
async function stepScenes(env: Env, row: Row) {
  const bible: Bible = JSON.parse(row.bible!);
  const scenes: SceneRow[] = JSON.parse(row.scenes);
  const key = env.RUNNINGHUB_API_KEY;
  let cost = row.cost_usd;

  // 1. Hoi cac task dang chay
  await Promise.all(
    scenes.map(async s => {
      if (s.status === 'image' && s.imgTask) {
        const res = await queryTask(key, s.imgTask).catch(() => null);
        if (!res || (!isSuccess(res.status) && !isFailure(res.status))) return;
        await keepRaw(env.BLOBS, res);
        s.imgTask = null;
        const url = isSuccess(res.status) ? imageOf(res) : null;
        if (url) {
          cost += costOf(res);
          await putUrl(env, `mvimg/${row.id}/${s.idx}`, url, 'image/jpeg');
          s.rhImage = url;
          s.imageUrl = `/api/media/mvimg/${row.id}/${s.idx}`;
          s.status = s.kind === 'clip' ? 'clip' : 'done';
        } else if (++s.tries < MAX_TRIES) {
          s.status = 'pending';
        } else {
          // Ve hong 2 lan: dung anh nhan vat goc cho canh nay
          s.rhImage = row.anchor_url;
          s.imageUrl = `/api/media/mvimg/${row.id}/a`;
          s.status = s.kind === 'clip' ? 'clip' : 'done';
        }
      } else if (s.status === 'clip' && s.clipTask) {
        const res = await queryTask(key, s.clipTask).catch(() => null);
        if (!res || (!isSuccess(res.status) && !isFailure(res.status))) return;
        await keepRaw(env.BLOBS, res);
        s.clipTask = null;
        const url = isSuccess(res.status) ? outputsOf(res, 'video')[0]?.url : null;
        if (url) {
          cost += costOf(res);
          await putUrl(env, `mvclip/${row.id}/${s.idx}`, url, 'video/mp4');
          s.clipUrl = `/api/media/mvclip/${row.id}/${s.idx}`;
          s.status = 'done';
        } else if (++s.clipTries >= MAX_TRIES) {
          // Quay hong 2 lan: canh nay thanh anh tinh
          s.kind = 'still';
          s.clipSec = 0;
          s.status = 'done';
        }
      }
    }),
  );

  // 2. Gui task moi, uu tien clip (lau hon) roi den anh
  let inflight = scenes.filter(s => s.imgTask || s.clipTask).length;
  for (const s of scenes) {
    if (inflight >= MAX_INFLIGHT) break;
    if (s.status !== 'clip' || s.clipTask || !s.rhImage) continue;
    try {
      s.clipTask = await submitClip(key, {image: s.rhImage, prompt: s.motion!, seconds: s.clipSec, ratio: row.ratio});
      inflight++;
    } catch {
      if (++s.clipTries >= MAX_TRIES) Object.assign(s, {kind: 'still', clipSec: 0, status: 'done'});
    }
  }
  for (const s of scenes) {
    if (inflight >= MAX_INFLIGHT) break;
    if (s.status !== 'pending') continue;
    const prompt =
      `${s.image}\nThe main character is the same person as in the reference image (${bible.character}); keep face, hair, age and outfit identical. ` +
      `Setting: ${bible.setting}. Look: ${bible.style}. ${row.ratio === '9:16' ? 'Vertical' : 'Horizontal'} frame. No text, no watermark.`;
    try {
      s.imgTask = await submitImage(key, {prompt, refs: [row.anchor_url!], aspectRatio: row.ratio});
      s.status = 'image';
      inflight++;
    } catch {
      if (++s.tries >= MAX_TRIES) {
        Object.assign(s, {rhImage: row.anchor_url, imageUrl: `/api/media/mvimg/${row.id}/a`, status: s.kind === 'clip' ? 'clip' : 'done'});
      }
    }
  }

  const done = scenes.every(s => s.status === 'done');
  await save(env, row.id, {scenes: JSON.stringify(scenes), cost_usd: cost, ...(done ? {stage: 'ready' as Stage} : {})});
}

const imageOf = (res: Parameters<typeof outputsOf>[0]) => outputsOf(res, 'image')[0]?.url ?? null;
const unlock = (env: Env, id: string) => env.DB.prepare('UPDATE mvs SET busy_until = NULL WHERE id = ?').bind(id).run().then(() => {});

async function putUrl(env: Env, key: string, url: string, fallbackType: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Tải file kết quả lỗi ${r.status}`);
  const type = r.headers.get('content-type')?.split(';')[0] || fallbackType;
  await env.BLOBS.put(key, await r.arrayBuffer(), {metadata: {contentType: type}});
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
  const scenes: SceneRow[] = JSON.parse(row.scenes);
  return {
    ...base,
    scenes: scenes.map(s => ({
      idx: s.idx, start: s.start, end: s.end, section: s.section, lines: s.lines, kind: s.kind, clipSec: s.clipSec,
      imageUrl: s.imageUrl, clipUrl: s.clipUrl, status: s.status,
    })),
  };
}

/** Khach duyet storyboard (kieu story): chuyen sang quay clip. */
export async function approveMv(env: Env, id: string): Promise<boolean> {
  const now = Date.now();
  const r = await env.DB.prepare(`UPDATE mvs SET stage = 'clips', approved_at = ?, updated_at = ?, busy_until = NULL WHERE id = ? AND stage = 'review'`)
    .bind(now, now, id)
    .run();
  return r.meta.changes === 1;
}

export async function sweepMv(env: Env) {
  const {results} = await env.DB.prepare(
    `SELECT id FROM mvs WHERE stage IN (${ACTIVE_SQL}) AND (busy_until IS NULL OR busy_until < ?) ORDER BY updated_at LIMIT 5`,
  )
    .bind(Date.now())
    .all<{id: string}>();
  await Promise.all(results.map(r => advanceMv(env, r.id)));
}

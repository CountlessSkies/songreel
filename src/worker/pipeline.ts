// Pipeline tao bai: Brief -> Lyricist (+ Critic, toi da 2 vong sua) -> Music Director -> Producer (Suno) -> luu ket qua.
// Moi buoc nang (goi LLM, hoi Suno) chay trong advance(): duoc goi tu GET /api/orders/:id va tu cron.
import {
  DECADES, GENRES, INSTRUMENTS, MOODS, OCCASIONS, PRON, TEMPOS, VOCAL_STYLE, WRITERS,
  type AcousticView, type AgentKey, type Answers, type LyricSection, type OrderView, type Take, type WriterKey,
} from '../shared/catalog';
import {critique, type Critique} from './critic';
import {LYRICIST_SYSTEM, lyricistUser} from './prompts';
import {chatText, costOf, isFailure, isSuccess, keepRaw, outputsOf, queryTask, submitSunoCustom} from './runninghub';

export type Env = {
  DB: D1Database;
  BLOBS: KVNamespace;
  ASSETS: Fetcher;
  RUNNINGHUB_API_KEY: string;
  POC_PASSCODE?: string;
  /** Whisper de do moc loi cho MV Pro. Khong co thi dung moc uoc luong. */
  OPENAI_API_KEY?: string;
};

export type Brief = {
  name: string;
  you: string;
  me: string;
  occLabel: string;
  genreLabel: string;
  sender: string;
  dedication: string;
  memories: string[];
  voice: 'male' | 'female' | 'duet';
};

type Stage = 'lyrics' | 'producer' | 'ready' | 'failed';

type Row = {
  id: string;
  created_at: number;
  updated_at: number;
  stage: Stage;
  writer: WriterKey;
  answers: string;
  brief: string;
  round: number;
  lyrics: string | null;
  critic: string | null;
  feedback: string | null;
  title: string | null;
  tags: string | null;
  rh_task_id: string | null;
  submitted_at: number | null;
  takes: string | null;
  cost_usd: number;
  llm_tokens: number;
  error: string | null;
  busy_until: number | null;
  acoustic: string | null;
};

/** Trang thai ban acoustic luu trong cot orders.acoustic. */
type Acoustic = {status: AcousticView['status']; task: string; submittedAt: number; take?: Take; error?: string};

const MAX_ROUNDS = 3; // 1 lan viet + toi da 2 lan sua
const SUNO_TIMEOUT_MS = 15 * 60_000;

// ── Brief ───────────────────────────────────────────────────────────────────
const BLOCK = [/\bgiết\b/, /khủng bố/, /ma túy/, /khiêu dâm/, /lừa đảo/, /lời bài hát của/, /cover bài/];

export function validateAnswers(a: Partial<Answers>): string | null {
  if (!a.writer || !(a.writer in WRITERS)) return 'Chọn model viết lời.';
  if (!a.rel || !(a.rel in PRON)) return 'Chọn người nhận.';
  if (!a.name || a.name.trim().length < 2 || a.name.trim().length > 40) return 'Tên người nhận 2–40 ký tự.';
  if (!a.occ || !(a.occ in OCCASIONS)) return 'Chọn dịp tặng.';
  if (!a.genre || !(a.genre in GENRES)) return 'Chọn thể loại.';
  if (!a.voice || !['male', 'female', 'duet', 'auto'].includes(a.voice)) return 'Chọn giọng hát.';
  if (!a.memories || a.memories.trim().length < 20) return 'Kể ít nhất 20 ký tự kỷ niệm.';
  if (a.memories.length > 1500) return 'Kỷ niệm tối đa 1500 ký tự.';
  if (!a.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email.trim())) return 'Email không hợp lệ.';
  return null;
}

export function makeBrief(a: Answers): Brief {
  const memories = a.memories
    .split(/\n+|(?<=[.!?])\s+/)
    .map(x => x.trim().replace(/\d{6,}/g, ''))
    .filter(x => x.length > 3);
  if (a.qualities.trim()) memories.push(`Tính cách: ${a.qualities.trim()}`);
  const text = `${a.name} ${memories.join(' ')} ${a.dedication}`.toLowerCase();
  if (BLOCK.some(r => r.test(text))) throw new Error('Nội dung chưa phù hợp chính sách nội dung.');
  const voice =
    a.voice === 'auto' ? (['vo', 'nguoi_yeu_nu', 'me', 'con_gai'].includes(a.rel) ? 'male' : 'female') : a.voice;
  const [you, me] = PRON[a.rel] ?? PRON.khac;
  return {
    name: a.name.trim(),
    you,
    me,
    occLabel: OCCASIONS[a.occ],
    genreLabel: GENRES[a.genre][0],
    sender: a.sender.trim(),
    dedication: a.dedication.trim(),
    memories,
    voice: voice as Brief['voice'],
  };
}

// ── Lyricist ────────────────────────────────────────────────────────────────
const KINDS = new Set(['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'outro']);

/** Lay object JSON dau tien. Neu model tra thua/thieu dau ngoac o cuoi thi cat dan cho toi khi parse duoc. */
function parseLyricsJson(text: string): {title: string; sections: LyricSection[]} {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('AI không trả JSON');
  let body = text.slice(start).replace(/```\s*$/, '');
  let obj: any = null;
  for (let i = 0; i < 6 && obj === null; i++) {
    try {
      obj = JSON.parse(body);
    } catch {
      const end = body.lastIndexOf('}', body.length - 2);
      if (end < 0) break;
      body = body.slice(0, end + 1);
    }
  }
  if (!obj || !Array.isArray(obj.sections)) throw new Error('JSON lời bài không hợp lệ');
  const sections: LyricSection[] = obj.sections
    .map((s: any) => ({
      name: String(s.name ?? ''),
      kind: (KINDS.has(String(s.kind)) ? String(s.kind) : 'verse') as LyricSection['kind'],
      lines: (Array.isArray(s.lines) ? s.lines : []).map((l: any) => String(l).replace(/[—–]/g, ',').trim()).filter(Boolean),
    }))
    .filter((s: LyricSection) => s.lines.length > 0);
  return {title: String(obj.title ?? '').slice(0, 80), sections};
}

// ── Music Director ──────────────────────────────────────────────────────────
const ACOUSTIC_STYLE = 'Vietnamese acoustic unplugged version, fingerstyle acoustic guitar, soft felt piano, intimate, no drums, Vietnamese vocals';

function direct(a: Answers, voice: Brief['voice'], isAcoustic = false) {
  const [, bpm, style] = GENRES[a.genre];
  const tempo = Math.round(bpm * TEMPOS[a.tempo][1]);
  // Ban acoustic: giu nhip va tam trang cua ban chinh, doi phoi khi sang guitar/piano moc
  const parts = isAcoustic
    ? [ACOUSTIC_STYLE, MOODS[a.mood][1], VOCAL_STYLE[voice], `${tempo} BPM`]
    : [style, MOODS[a.mood][1], DECADES[a.decade][1], VOCAL_STYLE[voice], INSTRUMENTS[a.inst][1], `${tempo} BPM`];
  return {
    tags: parts.filter(Boolean).join(', '),
    vocalGender: voice === 'male' ? ('m' as const) : voice === 'female' ? ('f' as const) : undefined,
  };
}

const TAG: Record<LyricSection['kind'], string> = {
  intro: 'Intro', verse: 'Verse', prechorus: 'Pre-Chorus', chorus: 'Chorus', bridge: 'Bridge', outro: 'Outro',
};

function tagLyrics(sections: LyricSection[]) {
  let verse = 0;
  return sections
    .map(s => {
      const tag = s.kind === 'verse' ? `Verse ${++verse}` : TAG[s.kind];
      return `[${tag}]\n${s.lines.join('\n')}`;
    })
    .join('\n\n');
}

// ── State ───────────────────────────────────────────────────────────────────
export async function createOrder(env: Env, a: Answers): Promise<string> {
  const brief = makeBrief(a);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO orders (id, created_at, updated_at, stage, writer, answers, brief, round, cost_usd, llm_tokens)
     VALUES (?, ?, ?, 'lyrics', ?, ?, ?, 0, 0, 0)`,
  )
    .bind(id, now, now, a.writer, JSON.stringify(a), JSON.stringify(brief))
    .run();
  return id;
}

export const getRow = (env: Env, id: string) => env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<Row>();

/** Giu khoa de 2 request khong cung goi LLM/Suno cho mot don. */
async function lock(env: Env, id: string, ms: number) {
  const now = Date.now();
  const r = await env.DB.prepare(
    `UPDATE orders SET busy_until = ? WHERE id = ? AND stage IN ('lyrics','producer') AND (busy_until IS NULL OR busy_until < ?)`,
  )
    .bind(now + ms, id, now)
    .run();
  return r.meta.changes === 1;
}

async function save(env: Env, id: string, f: Partial<Row>) {
  const keys = Object.keys(f);
  const sql = `UPDATE orders SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ?, busy_until = NULL WHERE id = ?`;
  await env.DB.prepare(sql)
    .bind(...keys.map(k => (f as any)[k]), Date.now(), id)
    .run();
}

/** Chay buoc tiep theo cua don neu can. An toan khi goi nhieu lan. */
export async function advance(env: Env, id: string): Promise<void> {
  const row = await getRow(env, id);
  if (!row || (row.stage !== 'lyrics' && row.stage !== 'producer')) return;
  if (!(await lock(env, id, row.stage === 'lyrics' ? 180_000 : 90_000))) return;
  try {
    if (row.stage === 'lyrics') await stepLyrics(env, row);
    else await stepProducer(env, row);
  } catch (e) {
    await save(env, id, {stage: 'failed', error: e instanceof Error ? e.message : String(e)});
  }
}

async function stepLyrics(env: Env, row: Row) {
  const a: Answers = JSON.parse(row.answers);
  const brief: Brief = JSON.parse(row.brief);
  const prev: LyricSection[] | undefined = row.lyrics ? JSON.parse(row.lyrics).sections : undefined;
  const round = row.round + 1;

  let parsed: {title: string; sections: LyricSection[]};
  let tokens = row.llm_tokens;
  try {
    const out = await chatText(env.RUNNINGHUB_API_KEY, {
      model: WRITERS[row.writer].model,
      system: LYRICIST_SYSTEM,
      user: lyricistUser(brief, row.feedback ?? undefined, row.feedback ? prev : undefined),
    });
    tokens += out.usage.input + out.usage.output;
    parsed = parseLyricsJson(out.text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (round >= MAX_ROUNDS) throw new Error(`Viết lời thất bại sau ${round} lần: ${msg}`);
    await save(env, row.id, {round, feedback: msg, llm_tokens: tokens});
    return;
  }

  const c: Critique = critique(parsed.sections, brief.name);
  const lyricsJson = JSON.stringify(parsed);
  const criticJson = JSON.stringify({score: c.score, issues: c.issues, notes: c.notes});
  if (c.issues.length && round < MAX_ROUNDS) {
    await save(env, row.id, {
      round, lyrics: lyricsJson, critic: criticJson, title: parsed.title, llm_tokens: tokens,
      feedback: [...c.issues, ...c.notes].join('; '),
    });
    return;
  }

  // Loi dat (hoac het luot sua): chon phong cach va gui Suno
  const d = direct(a, brief.voice);
  const title = parsed.title || `Bài hát cho ${brief.name}`;
  const taskId = await submitSunoCustom(env.RUNNINGHUB_API_KEY, {
    title,
    lyrics: tagLyrics(parsed.sections),
    tags: d.tags,
    negativeTags: 'english lyrics, spoken word',
    vocalGender: d.vocalGender,
  });
  await save(env, row.id, {
    stage: 'producer', round, lyrics: lyricsJson, critic: criticJson, title, tags: d.tags, llm_tokens: tokens,
    feedback: null, rh_task_id: taskId, submitted_at: Date.now(),
  });
}

async function stepProducer(env: Env, row: Row) {
  const res = await queryTask(env.RUNNINGHUB_API_KEY, row.rh_task_id!);
  await keepRaw(env.BLOBS, res);
  if (isFailure(res.status)) throw new Error(`Suno lỗi: ${res.errorMessage || res.errorCode || res.status}`);
  if (!isSuccess(res.status)) {
    if (Date.now() - (row.submitted_at ?? row.updated_at) > SUNO_TIMEOUT_MS) throw new Error('Suno quá 15 phút chưa xong');
    await env.DB.prepare('UPDATE orders SET busy_until = NULL WHERE id = ?').bind(row.id).run();
    return;
  }
  // Link RunningHub chi song 24h: tai ve KV ngay
  const audios = outputsOf(res, 'audio');
  const covers = outputsOf(res, 'image');
  if (!audios.length) throw new Error('Suno không trả file nhạc');
  const takes: Take[] = [];
  for (let i = 0; i < audios.length; i++) {
    const audioKey = `audio/${row.id}/${i}`;
    await putUrl(env, audioKey, audios[i].url, audios[i].mime);
    let coverUrl: string | null = null;
    if (covers[i]) {
      const coverKey = `cover/${row.id}/${i}`;
      await putUrl(env, coverKey, covers[i].url, covers[i].mime);
      coverUrl = `/api/media/${coverKey}`;
    }
    takes.push({audioUrl: `/api/media/${audioKey}`, coverUrl, durationSec: null});
  }
  await save(env, row.id, {stage: 'ready', takes: JSON.stringify(takes), cost_usd: row.cost_usd + costOf(res)});
}

// ── Ban acoustic (mua kem) ──────────────────────────────────────────────────
/** Gui Suno thu ban acoustic cho don da xong. Moi don chi thu 1 lan (thu lai neu lan truoc loi). */
export async function startAcoustic(env: Env, id: string): Promise<void> {
  const row = await getRow(env, id);
  if (!row || row.stage !== 'ready' || !row.lyrics) throw new Error('Bài hát chưa xong.');
  if (row.acoustic && (JSON.parse(row.acoustic) as Acoustic).status !== 'failed') return;
  const a: Answers = JSON.parse(row.answers);
  const brief: Brief = JSON.parse(row.brief);
  const d = direct(a, brief.voice, true);
  const task = await submitSunoCustom(env.RUNNINGHUB_API_KEY, {
    title: `${row.title ?? `Bài hát cho ${brief.name}`} (Acoustic)`,
    lyrics: tagLyrics(JSON.parse(row.lyrics).sections),
    tags: d.tags,
    negativeTags: 'english lyrics, spoken word, drums, edm, heavy bass',
    vocalGender: d.vocalGender,
  });
  const acoustic: Acoustic = {status: 'running', task, submittedAt: Date.now()};
  await env.DB.prepare('UPDATE orders SET acoustic = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(acoustic), Date.now(), id).run();
}

/** Hoi Suno ban acoustic dang thu. Dung chung khoa busy_until (don da o stage 'ready' nen khong tranh voi pipeline chinh). */
export async function advanceAcoustic(env: Env, id: string): Promise<void> {
  const row = await getRow(env, id);
  if (!row?.acoustic || row.stage !== 'ready') return;
  const ac: Acoustic = JSON.parse(row.acoustic);
  if (ac.status !== 'running') return;
  const now = Date.now();
  const locked = await env.DB.prepare('UPDATE orders SET busy_until = ? WHERE id = ? AND (busy_until IS NULL OR busy_until < ?)')
    .bind(now + 90_000, id, now)
    .run();
  if (locked.meta.changes !== 1) return;
  const finish = async (next: Acoustic, cost = 0) => {
    await env.DB.prepare('UPDATE orders SET acoustic = ?, cost_usd = cost_usd + ?, updated_at = ?, busy_until = NULL WHERE id = ?')
      .bind(JSON.stringify(next), cost, Date.now(), id)
      .run();
  };
  try {
    const res = await queryTask(env.RUNNINGHUB_API_KEY, ac.task);
    await keepRaw(env.BLOBS, res);
    if (isFailure(res.status)) {
      await finish({...ac, status: 'failed', error: `Suno lỗi: ${res.errorMessage || res.errorCode || res.status}`});
      return;
    }
    if (!isSuccess(res.status)) {
      if (now - ac.submittedAt > SUNO_TIMEOUT_MS) await finish({...ac, status: 'failed', error: 'Suno quá 15 phút chưa xong'});
      else await env.DB.prepare('UPDATE orders SET busy_until = NULL WHERE id = ?').bind(id).run();
      return;
    }
    // Suno luon ra 2 ban: chi giu ban dau
    const [audio] = outputsOf(res, 'audio');
    if (!audio) {
      await finish({...ac, status: 'failed', error: 'Suno không trả file nhạc'});
      return;
    }
    const audioKey = `audio/${id}/acoustic`;
    await putUrl(env, audioKey, audio.url, audio.mime);
    const [cover] = outputsOf(res, 'image');
    let coverUrl: string | null = null;
    if (cover) {
      await putUrl(env, `cover/${id}/acoustic`, cover.url, cover.mime);
      coverUrl = `/api/media/cover/${id}/acoustic`;
    }
    const take: Take = {audioUrl: `/api/media/${audioKey}`, coverUrl, durationSec: null};
    await finish({...ac, status: 'ready', take}, costOf(res));
  } catch (e) {
    await finish({...ac, status: 'failed', error: e instanceof Error ? e.message : String(e)});
  }
}

function acousticView(raw: string | null): AcousticView | null {
  if (!raw) return null;
  const ac: Acoustic = JSON.parse(raw);
  return {status: ac.status, take: ac.take ?? null, error: ac.error ?? null};
}

async function putUrl(env: Env, key: string, url: string, contentType: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Tải file kết quả lỗi ${r.status}`);
  const buf = await r.arrayBuffer();
  await env.BLOBS.put(key, buf, {metadata: {contentType}});
}

// ── View cho client ─────────────────────────────────────────────────────────
export function toView(row: Row): OrderView {
  const brief: Brief = JSON.parse(row.brief);
  let stage: AgentKey = 'lyricist';
  if (row.stage === 'lyrics') stage = row.round === 0 ? 'lyricist' : 'critic';
  else if (row.stage === 'producer') stage = 'producer';
  else if (row.stage === 'ready') stage = 'qc';
  else if (row.stage === 'failed') stage = row.rh_task_id ? 'producer' : row.lyrics ? 'critic' : 'lyricist';
  const lyrics = row.lyrics ? (JSON.parse(row.lyrics).sections as LyricSection[]) : null;
  return {
    id: row.id,
    writer: row.writer,
    round: row.round,
    critic: row.critic ? JSON.parse(row.critic) : null,
    status: row.stage === 'ready' ? 'ready' : row.stage === 'failed' ? 'failed' : 'running',
    stage,
    error: row.error,
    title: row.title,
    recipient: brief.name,
    lyrics: row.stage === 'ready' ? lyrics : null,
    takes: row.takes ? JSON.parse(row.takes) : [],
    acoustic: acousticView(row.acoustic),
    createdAt: row.created_at,
  };
}

/** Cron: day cac don dang do (khach da dong tab). */
export async function sweep(env: Env) {
  const {results} = await env.DB.prepare(
    `SELECT id FROM orders WHERE stage IN ('lyrics','producer') AND (busy_until IS NULL OR busy_until < ?) ORDER BY updated_at LIMIT 10`,
  )
    .bind(Date.now())
    .all<{id: string}>();
  await Promise.all(results.map(r => advance(env, r.id)));
  const {results: acoustic} = await env.DB.prepare(
    `SELECT id FROM orders WHERE stage = 'ready' AND json_extract(acoustic, '$.status') = 'running'
     AND (busy_until IS NULL OR busy_until < ?) LIMIT 10`,
  )
    .bind(Date.now())
    .all<{id: string}>();
  await Promise.all(acoustic.map(r => advanceAcoustic(env, r.id)));
}

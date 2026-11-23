// MV ke chuyen (muc Pro/Cinematic), theo ref/CAM_Creative_Pipeline_MV_Online.md cua director, chay het tren RunningHub:
//   timing  : Whisper (OpenAI) nghe ban thu + can vao loi -> moc tung cau -> chia shot 4-15s
//   script  : GPT viet logline, nhan vat, boi canh va shot list (khung dau, khung cuoi, chuyen dong)
//   sheets  : Seedream 5.5 ve character sheet (lay anh khach lam tham chieu) va location sheet
//   frames  : Seedream 5.5 ve khung dau + khung cuoi tung shot tu cac sheet
//   review  : dung lai cho khach duyet storyboard (xem tren nhac nhu animatic). Chua ton tien video.
//   clips   : quay tung shot tu khung dau toi khung cuoi; model theo muc MV (Amateur: Veo 3.1 fast, Pro/Cinematic: Seedance 2.0 mini)
// Bo qua so voi tai lieu (lam sau): chon take va can cue tu dong, ghep tren server (Creatomate).
import {RELS, type Answers, type LyricSection} from '../shared/catalog';
import {clipCostUsd, clipSecondsFor, MV_TIERS, type MvRatio, type MvScene, type MvTier, type MvView} from '../shared/mv';
import {alignLyrics, estimateLines, planShots, type LyricLine} from './align';
import {transcribeWords} from './openai';
import {getRow as getOrder, type Brief, type Env} from './pipeline';
import {MV_STORY_SYSTEM, mvStoryUser} from './prompts';
import {
  BALANCE_MESSAGE, chatText, costOf, isBalanceError, isFailure, isSuccess, keepRaw, outputsOf, queryTask, rethrowBalance, RhError,
  submitSeedream, submitVideo, uploadMedia,
  type RhResult,
} from './runninghub';

const DIRECTOR_MODEL = 'openai/gpt-6.1-sol';
const MAX_INFLIGHT = 8;
const MAX_TRIES = 2;
const MAX_CHARACTERS = 4;
const MAX_LOCATIONS = 5;
/** Link RunningHub song 24h: qua 20h thi upload lai tu KV truoc khi dung lam khung clip. */
const RH_URL_FRESH_MS = 20 * 3600_000;
const SILENT = 'Silent, natural performance with a relaxed mouth. No singing or spoken dialogue.';

export type StoryStage = 'timing' | 'script' | 'sheets' | 'frames' | 'review' | 'clips';
export const STORY_ACTIVE: StoryStage[] = ['timing', 'script', 'sheets', 'frames', 'clips'];

/** Anh tham chieu dang/da ve tren RunningHub. `key` la khoa KV khi da tai ve. */
type Sheet = {task?: string | null; url?: string | null; key?: string | null; tries: number};
type Character = Sheet & {id: string; name: string; look: string; wardrobe: string};
type Location = Sheet & {id: string; description: string; light: string};

export type Story = {
  /** Muc MV khach chon: quyet dinh model quay video. */
  tier: MvTier;
  timing: 'measured' | 'estimated';
  timingNote?: string;
  logline?: string;
  finalImage?: string;
  style?: string;
  characters: Character[];
  locations: Location[];
  /** Anh khach da upload len RunningHub (song 24h), dung cho character sheet. */
  photoUrls: string[];
  /** So lan viet kich ban da loi va loi gan nhat. */
  scriptTries?: number;
  scriptError?: string;
};

export type StoryScene = MvScene & {
  measured: boolean;
  chr: string[];
  loc: string | null;
  startPrompt: string;
  endPrompt: string;
  motion: string;
  imgTask?: string | null;
  endTask?: string | null;
  clipTask?: string | null;
  rhImage?: string | null;
  rhEnd?: string | null;
  /** Luc lay duoc link RunningHub cua khung dau/cuoi. */
  rhAt?: number;
  tries: number;
  endTries: number;
  clipTries: number;
  /** Ly do canh bi thanh anh tinh (loi tu RunningHub khi quay clip). */
  clipError?: string;
};

/** Phan cua 1 dong mvs ma pipeline nay can. */
export type StoryRow = {
  id: string;
  order_id: string;
  ratio: MvRatio;
  take: number;
  duration: number;
  photos: number;
  stage: string;
  scenes: string;
  story: string | null;
  cost_usd: number;
  llm_tokens: number;
};

/** Ham luu/mo khoa/tai file do mv.ts cung cap (tranh import vong). */
export type StoryCtx = {
  save: (f: Record<string, unknown>) => Promise<void>;
  unlock: () => Promise<void>;
  putUrl: (key: string, url: string, fallbackType: string) => Promise<void>;
};

const size = (r: MvRatio) => (r === '9:16' ? {width: 720, height: 1280} : {width: 1280, height: 720});
const img = (id: string, name: string) => `/api/media/mvimg/${id}/${name}`;

/** Khoi tao luc tao MV: upload anh khach len RunningHub de lam tham chieu (luat cua RunningHub: khong gui base64). */
export async function initStory(env: Env, photos: {bytes: ArrayBuffer; type: string}[], tier: MvTier): Promise<Story> {
  const photoUrls: string[] = [];
  for (const [i, p] of photos.entries()) photoUrls.push(await uploadMedia(env.RUNNINGHUB_API_KEY, p.bytes, p.type, `photo${i}.jpg`));
  return {tier, timing: 'estimated', characters: [], locations: [], photoUrls};
}

const videoOf = (story: Story | null) => MV_TIERS[story?.tier ?? 'pro'].video;

const SCRIPT_TRIES = 3;

export async function advanceStory(env: Env, row: StoryRow, ctx: StoryCtx) {
  if (row.stage === 'timing') return stepTiming(env, row, ctx);
  if (row.stage === 'script') {
    // LLM hay loi tam thoi (524, JSON cut): thu lai toi da 3 lan roi moi bao hong
    try {
      return await stepScript(env, row, ctx);
    } catch (e) {
      if (isBalanceError(e)) throw new Error(BALANCE_MESSAGE);
      const story: Story = JSON.parse(row.story!);
      story.scriptTries = (story.scriptTries ?? 0) + 1;
      story.scriptError = e instanceof Error ? e.message : String(e);
      if (story.scriptTries >= SCRIPT_TRIES) throw new Error(`Viết kịch bản lỗi ${SCRIPT_TRIES} lần: ${story.scriptError}`);
      await ctx.save({story: JSON.stringify(story)});
      return;
    }
  }
  if (row.stage === 'sheets') return stepSheets(env, row, ctx);
  if (row.stage === 'frames') return stepFrames(env, row, ctx);
  if (row.stage === 'clips') return stepClips(env, row, ctx);
}

// ── 1. Moc loi va chia shot ─────────────────────────────────────────────────
async function stepTiming(env: Env, row: StoryRow, ctx: StoryCtx) {
  const order = (await getOrder(env, row.order_id))!;
  const sections: LyricSection[] = JSON.parse(order.lyrics!).sections;
  const lines: LyricLine[] = sections.flatMap(s => s.lines.map(text => ({section: s.name, text, chorus: s.kind === 'chorus'})));
  const story: Story = JSON.parse(row.story!);

  let timed = null;
  if (env.OPENAI_API_KEY) {
    try {
      const {value, metadata} = await env.BLOBS.getWithMetadata<{contentType?: string}>(`audio/${row.order_id}/${row.take}`, 'arrayBuffer');
      if (!value) throw new Error('không tìm thấy file nhạc');
      const words = await transcribeWords(env.OPENAI_API_KEY, value, metadata?.contentType ?? 'audio/mpeg', lines.map(l => l.text).join('\n'));
      timed = alignLyrics(lines, words, row.duration);
      if (!timed) story.timingNote = 'Whisper nghe không khớp lời, dùng mốc ước lượng';
    } catch (e) {
      story.timingNote = `Không đo được mốc lời: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else story.timingNote = 'Chưa có OPENAI_API_KEY, dùng mốc ước lượng';
  story.timing = timed ? 'measured' : 'estimated';
  const used = timed ?? estimateLines(lines, row.duration);
  const measuredText = new Set(used.filter(l => l.measured).map(l => `${l.start}|${l.text}`));

  const scenes: StoryScene[] = planShots(used, row.duration).map((s, idx) => {
    const len = s.end - s.start;
    return {
      idx, start: s.start, end: s.end, section: s.section, lines: s.lines, lineTimes: s.lineTimes,
      kind: 'clip', clipSec: clipSecondsFor(videoOf(story), len),
      imageUrl: null, clipUrl: null, endImageUrl: null, status: 'pending',
      measured: s.lineTimes.every(([a], k) => measuredText.has(`${a}|${s.lines[k]}`)),
      chr: [], loc: null, startPrompt: '', endPrompt: '', motion: '', tries: 0, endTries: 0, clipTries: 0,
    };
  });
  await ctx.save({stage: 'script', scenes: JSON.stringify(scenes), story: JSON.stringify(story)});
}

// ── 2. Kich ban + shot list ─────────────────────────────────────────────────
function parseJson(text: string): any {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('AI không trả JSON');
  let body = text.slice(start).replace(/```\s*$/, '');
  for (let i = 0; i < 8; i++) {
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

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

/** Cat van ban dai o cuoi cau gan nhat (de logline khong bi cut giua chu). */
function sentences(v: unknown, n: number) {
  const s = String(v ?? '').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return end > n * 0.4 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

async function stepScript(env: Env, row: StoryRow, ctx: StoryCtx) {
  const order = (await getOrder(env, row.order_id))!;
  const brief: Brief = JSON.parse(order.brief);
  const answers: Answers = JSON.parse(order.answers);
  const scenes: StoryScene[] = JSON.parse(row.scenes);
  const story: Story = JSON.parse(row.story!);
  const out = await chatText(env.RUNNINGHUB_API_KEY, {
    model: DIRECTOR_MODEL,
    system: MV_STORY_SYSTEM,
    user: mvStoryUser({
      relation: RELS[answers.rel] ?? 'người thân',
      brief,
      title: order.title ?? `Bài hát cho ${brief.name}`,
      ratio: row.ratio,
      photos: story.photoUrls.length,
      shots: scenes.map(s => ({idx: s.idx, start: s.start, end: s.end, section: s.section, lines: s.lines, measured: s.measured})),
    }),
    maxTokens: 16000,
  });
  const plan = parseJson(out.text);

  const characters: Character[] = (Array.isArray(plan.characters) ? plan.characters : []).slice(0, MAX_CHARACTERS).map((c: any, i: number) => ({
    id: i === 0 ? 'CHR_1' : clip(c.id, 12) || `CHR_${i + 1}`,
    name: clip(c.name, 40) || (i === 0 ? brief.name : `Nhân vật ${i + 1}`),
    look: clip(c.look, 400),
    wardrobe: clip(c.wardrobe, 200),
    tries: 0,
  }));
  if (!characters.length) characters.push({id: 'CHR_1', name: brief.name, look: 'an ordinary Vietnamese person', wardrobe: 'simple everyday clothes', tries: 0});
  const locations: Location[] = (Array.isArray(plan.locations) ? plan.locations : []).slice(0, MAX_LOCATIONS).map((l: any, i: number) => ({
    id: clip(l.id, 12) || `LOC_${i + 1}`,
    description: clip(l.description, 500),
    light: clip(l.light, 160),
    tries: 0,
  }));
  if (!locations.length) locations.push({id: 'LOC_1', description: 'a warm Vietnamese family home, wooden furniture, plants by the window', light: 'soft morning light from the window', tries: 0});

  const chrIds = new Set(characters.map(c => c.id));
  const byIdx = new Map<number, any>();
  for (const s of Array.isArray(plan.shots) ? plan.shots : []) byIdx.set(Number(s.idx), s);
  for (const s of scenes) {
    const p = byIdx.get(s.idx) ?? {};
    const lyric = s.lines.join(' / ');
    s.chr = (Array.isArray(p.chr) ? p.chr : []).map(String).filter((c: string) => chrIds.has(c));
    s.loc = locations.some(l => l.id === p.loc) ? String(p.loc) : locations[0].id;
    s.action = clip(p.action, 240) || lyric || s.section;
    s.startPrompt = clip(p.start, 900) || `${characters[0].look} in the location, a quiet moment that illustrates: ${lyric || s.section}. Medium shot, eye level.`;
    s.endPrompt = clip(p.end, 500);
    s.motion = clip(p.motion, 700) || `The subject breathes and glances softly, slow push-in. ${SILENT}`;
    if (!s.motion.includes('No singing')) s.motion = `${s.motion} ${SILENT}`;
  }
  Object.assign(story, {
    logline: sentences(plan.logline, 320),
    finalImage: sentences(plan.final_image, 240),
    style: clip(plan.style, 300) || 'photoreal, warm natural light, cinematic, natural skin, subtle film grain',
    characters,
    locations,
  });
  await ctx.save({
    stage: 'sheets',
    scenes: JSON.stringify(scenes),
    story: JSON.stringify(story),
    llm_tokens: row.llm_tokens + out.usage.input + out.usage.output,
  });
}

// ── 3. Character sheet + location sheet ─────────────────────────────────────
function characterPrompt(c: Character, style: string, hasPhoto: boolean) {
  return (
    (hasPhoto ? `Use the attached portrait(s) as the identity reference for ${c.name}. ` : '') +
    `CHARACTER SHEET: front portrait, three-quarter portrait and full-body view of the same person side by side: ${c.look}. ` +
    `Wearing ${c.wardrobe}. Keep facial proportions, hairline, age appearance and accessories consistent across the three views. ` +
    `Neutral expression, even soft light, plain light grey background. ${style}. No text, no labels.`
  );
}

function locationPrompt(l: Location, style: string, ratio: MvRatio) {
  return (
    `LOCATION: ${l.description}. Light: ${l.light}. Wide establishing view that shows the layout clearly, no people. ` +
    `${style}. ${ratio === '9:16' ? 'Vertical' : 'Horizontal'} cinematic frame. No text, no signs with words.`
  );
}

/** Hoi 1 task anh; tra url neu xong, null neu dang chay, 'failed' neu loi. */
async function pollImage(env: Env, task: string): Promise<{url: string; mime: string; res: RhResult} | null | 'failed'> {
  const res = await queryTask(env.RUNNINGHUB_API_KEY, task);
  await keepRaw(env.BLOBS, res);
  if (isFailure(res.status)) return 'failed';
  if (!isSuccess(res.status)) return null;
  const [o] = outputsOf(res, 'image');
  return o ? {...o, res} : 'failed';
}

async function stepSheets(env: Env, row: StoryRow, ctx: StoryCtx) {
  const story: Story = JSON.parse(row.story!);
  const key = env.RUNNINGHUB_API_KEY;
  let cost = row.cost_usd;
  const all: (Sheet & {kind: 'c' | 'l'; n: number; prompt: string; refs: string[]; w: number; h: number})[] = [
    ...story.characters.map((c, n) => Object.assign(c, {kind: 'c' as const, n, prompt: characterPrompt(c, story.style!, n === 0 && story.photoUrls.length > 0), refs: n === 0 ? story.photoUrls : [], w: 1280, h: 720})),
    ...story.locations.map((l, n) => Object.assign(l, {kind: 'l' as const, n, prompt: locationPrompt(l, story.style!, row.ratio), refs: [], ...{w: size(row.ratio).width, h: size(row.ratio).height}})),
  ];
  for (const s of all) {
    if (s.task) {
      const r = await pollImage(env, s.task).catch(() => null);
      if (r === 'failed') {
        s.task = null;
        s.tries++;
      } else if (r) {
        s.task = null;
        s.url = r.url;
        s.key = `${s.kind}${s.n}`;
        cost += costOf(r.res);
        await ctx.putUrl(`mvimg/${row.id}/${s.key}`, r.url, r.mime);
      }
    }
    if (!s.task && !s.url && s.tries < MAX_TRIES) {
      try {
        s.task = await submitSeedream(key, {prompt: s.prompt, refs: s.refs, width: s.w, height: s.h});
      } catch (e) {
        rethrowBalance(e);
        s.tries++;
        if (e instanceof RhError && !e.transient) s.tries = MAX_TRIES;
      }
    }
  }
  // Bo cac truong tam truoc khi luu
  const strip = <T extends object>(x: T) => {
    const {kind, n, prompt, refs, w, h, ...rest} = x as any;
    return rest as T;
  };
  story.characters = story.characters.map(strip);
  story.locations = story.locations.map(strip);
  const done = all.every(s => s.url || (!s.task && s.tries >= MAX_TRIES));
  if (done && !story.characters.some(c => c.url) && !story.photoUrls.length && !story.locations.some(l => l.url)) {
    throw new Error('Không vẽ được ảnh nhân vật và bối cảnh');
  }
  await ctx.save({story: JSON.stringify(story), cost_usd: cost, ...(done ? {stage: 'frames'} : {})});
}

// ── 4. Khung dau + khung cuoi tung shot ─────────────────────────────────────
function refsFor(s: StoryScene, story: Story) {
  const chars = s.chr.map(id => story.characters.find(c => c.id === id)).filter((c): c is Character => !!c);
  const refs: string[] = [];
  const names: string[] = [];
  for (const c of chars) {
    const ref = c.url ?? (c.id === 'CHR_1' ? story.photoUrls[0] : undefined);
    if (ref) {
      refs.push(ref);
      names.push(`${c.name} (${c.wardrobe})`);
    }
  }
  const loc = story.locations.find(l => l.id === s.loc);
  return {refs, names, loc, locUrl: loc?.url ?? null, chars};
}

function startPrompt(s: StoryScene, story: Story, ratio: MvRatio) {
  const {refs, names, locUrl, chars} = refsFor(s, story);
  const who = names.map((n, i) => `image ${i + 1} is the identity and wardrobe reference for ${n}`).join('; ');
  const where = locUrl ? `image ${refs.length + 1} is the layout and lighting reference for the location` : '';
  const looks = chars.map(c => `${c.name}: ${c.look}`).join('. ');
  return (
    `Create the OPENING frame of a music video shot. ${[who, where].filter(Boolean).join('; ')}${who || where ? '. ' : ''}` +
    `${s.startPrompt} ${looks ? `Characters: ${looks}. ` : ''}${story.style}. ` +
    `${ratio === '9:16' ? 'Vertical' : 'Horizontal'} cinematic frame. Output a single photoreal frame. No text, no watermark.`
  );
}

function endPrompt(s: StoryScene, story: Story) {
  return (
    `Image 1 is the opening frame of this shot. Keep the exact same location, camera framing, wardrobe, props and light as image 1` +
    `${refsFor(s, story).refs.length ? '; the other images are identity references for the same people' : ''}. ` +
    `A few seconds later: ${s.endPrompt || s.action}. Output a single photoreal frame. No text, no watermark.`
  );
}

async function stepFrames(env: Env, row: StoryRow, ctx: StoryCtx) {
  const story: Story = JSON.parse(row.story!);
  const scenes: StoryScene[] = JSON.parse(row.scenes);
  const key = env.RUNNINGHUB_API_KEY;
  const {width, height} = size(row.ratio);
  let cost = row.cost_usd;

  // Anh du phong khi ve hong 2 lan: location sheet, roi character sheet
  const fallback = (s: StoryScene) => {
    const {loc, chars} = refsFor(s, story);
    if (loc?.url && loc.key) return {rh: loc.url, view: img(row.id, loc.key)};
    const c = (chars[0] ?? story.characters[0]) as Character | undefined;
    if (c?.url && c.key) return {rh: c.url, view: img(row.id, c.key)};
    return null;
  };

  await Promise.all(
    scenes.map(async s => {
      if (s.imgTask) {
        const r = await pollImage(env, s.imgTask).catch(() => null);
        if (r === 'failed') {
          s.imgTask = null;
          if (++s.tries >= MAX_TRIES) {
            const fb = fallback(s);
            if (fb) Object.assign(s, {rhImage: fb.rh, imageUrl: fb.view, rhAt: Date.now(), endTries: MAX_TRIES});
            else s.status = 'failed';
          }
        } else if (r) {
          s.imgTask = null;
          cost += costOf(r.res);
          await ctx.putUrl(`mvimg/${row.id}/${s.idx}`, r.url, r.mime);
          Object.assign(s, {rhImage: r.url, rhAt: Date.now(), imageUrl: img(row.id, String(s.idx))});
        }
      }
      if (s.endTask) {
        const r = await pollImage(env, s.endTask).catch(() => null);
        if (r === 'failed') {
          s.endTask = null;
          s.endTries++;
        } else if (r) {
          s.endTask = null;
          cost += costOf(r.res);
          await ctx.putUrl(`mvimg/${row.id}/${s.idx}e`, r.url, r.mime);
          Object.assign(s, {rhEnd: r.url, endImageUrl: img(row.id, `${s.idx}e`)});
        }
      }
    }),
  );

  let inflight = scenes.filter(s => s.imgTask || s.endTask).length;
  const submitOne = async (s: StoryScene, which: 'start' | 'end') => {
    try {
      if (which === 'start') {
        const {refs, locUrl} = refsFor(s, story);
        s.imgTask = await submitSeedream(key, {prompt: startPrompt(s, story, row.ratio), refs: locUrl ? [...refs, locUrl] : refs, width, height});
        s.status = 'image';
      } else {
        s.endTask = await submitSeedream(key, {prompt: endPrompt(s, story), refs: [s.rhImage!, ...refsFor(s, story).refs], width, height});
      }
      inflight++;
    } catch (e) {
      rethrowBalance(e);
      const hard = e instanceof RhError && !e.transient;
      if (which === 'start') s.tries = hard ? MAX_TRIES : s.tries + 1;
      else s.endTries = hard ? MAX_TRIES : s.endTries + 1;
    }
  };
  for (const s of scenes) {
    if (inflight >= MAX_INFLIGHT) break;
    if (s.rhImage && !s.rhEnd && !s.endTask && s.endTries < MAX_TRIES) await submitOne(s, 'end');
  }
  for (const s of scenes) {
    if (inflight >= MAX_INFLIGHT) break;
    if (!s.rhImage && !s.imgTask && s.tries < MAX_TRIES && s.status !== 'failed') await submitOne(s, 'start');
  }
  for (const s of scenes) {
    if (s.status === 'failed') continue;
    if (s.rhImage && !s.endTask && (s.rhEnd || s.endTries >= MAX_TRIES)) s.status = 'framed';
  }
  if (scenes.every(s => s.status === 'failed')) throw new Error('Không vẽ được khung hình nào');
  const done = scenes.every(s => s.status === 'framed' || s.status === 'failed');
  await ctx.save({scenes: JSON.stringify(scenes), cost_usd: cost, ...(done ? {stage: 'review'} : {})});
}

// ── 5. Quay clip (sau khi khach duyet) ──────────────────────────────────────
/** Link khung dau/cuoi con dung duoc khong; qua 20h thi upload lai tu KV. */
async function freshFrames(env: Env, row: StoryRow, s: StoryScene) {
  if (s.rhAt && Date.now() - s.rhAt < RH_URL_FRESH_MS) return;
  const up = async (path: string | null | undefined, name: string) => {
    if (!path) return null;
    const kvKey = path.replace('/api/media/', '');
    const {value, metadata} = await env.BLOBS.getWithMetadata<{contentType?: string}>(kvKey, 'arrayBuffer');
    return value ? uploadMedia(env.RUNNINGHUB_API_KEY, value, metadata?.contentType ?? 'image/jpeg', name) : null;
  };
  s.rhImage = (await up(s.imageUrl, `f${s.idx}.jpg`)) ?? s.rhImage;
  s.rhEnd = s.endImageUrl ? ((await up(s.endImageUrl, `e${s.idx}.jpg`)) ?? s.rhEnd) : s.rhEnd;
  s.rhAt = Date.now();
}

async function stepClips(env: Env, row: StoryRow, ctx: StoryCtx) {
  const scenes: StoryScene[] = JSON.parse(row.scenes);
  const video = videoOf(row.story ? JSON.parse(row.story) : null);
  const key = env.RUNNINGHUB_API_KEY;
  let cost = row.cost_usd;
  const giveUp = (s: StoryScene, why?: string) =>
    Object.assign(s, {kind: 'still', clipSec: 0, status: 'done', clipTask: null, ...(why ? {clipError: why.slice(0, 300)} : {})});

  await Promise.all(
    scenes.map(async s => {
      if (s.status !== 'clip' || !s.clipTask) return;
      const res = await queryTask(key, s.clipTask).catch(() => null);
      if (!res) return;
      await keepRaw(env.BLOBS, res);
      if (isFailure(res.status)) {
        s.clipTask = null;
        if (++s.clipTries >= MAX_TRIES) giveUp(s, res.errorMessage || res.errorCode || res.status);
        else s.status = 'framed';
        return;
      }
      if (!isSuccess(res.status)) return;
      const [v] = outputsOf(res, 'video');
      s.clipTask = null;
      if (!v) {
        if (++s.clipTries >= MAX_TRIES) giveUp(s);
        else s.status = 'framed';
        return;
      }
      cost += costOf(res);
      await ctx.putUrl(`mvclip/${row.id}/${s.idx}`, v.url, v.mime);
      Object.assign(s, {clipUrl: `/api/media/mvclip/${row.id}/${s.idx}`, status: 'done'});
    }),
  );

  let inflight = scenes.filter(s => s.clipTask).length;
  for (const s of scenes) {
    if (inflight >= MAX_INFLIGHT) break;
    if (s.status !== 'framed' || s.clipTask) continue;
    try {
      await freshFrames(env, row, s);
      s.clipTask = await submitVideo(key, video, {image: s.rhImage!, lastFrame: s.rhEnd ?? undefined, prompt: s.motion, seconds: s.clipSec, ratio: row.ratio});
      s.status = 'clip';
      inflight++;
    } catch (e) {
      rethrowBalance(e);
      if ((e instanceof RhError && !e.transient) || ++s.clipTries >= MAX_TRIES) giveUp(s, e instanceof Error ? e.message : String(e));
    }
  }
  // Canh ve hong ca khung dau: bo qua (ghep video se de man den ngan) -> danh dau xong
  for (const s of scenes) if (s.status === 'failed') giveUp(s);
  const done = scenes.every(s => s.status === 'done');
  await ctx.save({scenes: JSON.stringify(scenes), cost_usd: cost, ...(done ? {stage: 'ready'} : {})});
}

// ── View ────────────────────────────────────────────────────────────────────
export function storyView(row: StoryRow): Pick<MvView, 'sheets' | 'logline' | 'timing' | 'clipCostUsd' | 'tier'> & {scenes: MvScene[]} {
  const story: Story | null = row.story ? JSON.parse(row.story) : null;
  const scenes: StoryScene[] = JSON.parse(row.scenes);
  const sheets = story
    ? [
        ...story.characters.filter(c => c.key).map(c => ({label: `Nhân vật · ${c.name}`, url: img(row.id, c.key!)})),
        ...story.locations.filter(l => l.key).map((l, i) => ({label: `Bối cảnh ${i + 1}`, url: img(row.id, l.key!)})),
      ]
    : [];
  return {
    sheets,
    logline: story?.logline ?? null,
    timing: story ? story.timing : null,
    tier: story?.tier ?? null,
    clipCostUsd: clipCostUsd(videoOf(story), scenes),
    scenes: scenes.map(s => ({
      idx: s.idx, start: s.start, end: s.end, section: s.section, lines: s.lines, kind: s.kind, clipSec: s.clipSec,
      imageUrl: s.imageUrl, clipUrl: s.clipUrl, status: s.status, endImageUrl: s.endImageUrl ?? null, action: s.action, lineTimes: s.lineTimes,
    })),
  };
}

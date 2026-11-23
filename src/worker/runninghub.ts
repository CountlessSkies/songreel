// Client RunningHub theo developer-kit cua RunningHub (llms.txt, rh-api-contract.md):
// upload file truoc -> submit lay taskId -> POST /query toi trang thai cuoi -> doc results[].url.
// Endpoint va tham so lay tu model-registry.public.json, khong tu dat. LLM di qua llm.runninghub.ai (ngoai pham vi kit).
const TASK_BASE = 'https://www.runninghub.ai/openapi/v2';
const LLM_BASE = 'https://llm.runninghub.ai/v1';
const RAW_TTL_SEC = 30 * 86400;

export type RhStatus = 'CREATE' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCEL';
export type RhResult = {
  taskId?: string;
  status: RhStatus;
  errorCode?: string;
  errorMessage?: string;
  results?: {url?: string; outputUrl?: string; outputType?: string; text?: string}[] | null;
  usage?: {thirdPartyConsumeMoney?: string | null} | null;
};

export const isSuccess = (s: RhStatus | undefined) => s === 'SUCCESS';
/** FAILED va CANCEL deu la ket thuc that bai. */
export const isFailure = (s: RhStatus | undefined) => s === 'FAILED' || s === 'CANCEL';

/** Loi tu RunningHub. `transient` = loi mang, 429, 5xx: duoc thu lai. Con lai (sai tham so, het tien, vi pham) thi khong. */
export class RhError extends Error {
  constructor(message: string, readonly transient: boolean) {
    super(message);
  }
}

/** Vi RunningHub het tien: phai dung ca MV (bao ro rang), khong lui ve anh tinh. */
export const isBalanceError = (e: unknown) => e instanceof Error && /insufficient balance|recharge|余额不足/i.test(e.message);

export const BALANCE_MESSAGE = 'Ví RunningHub hết tiền, cần nạp thêm rồi dựng lại MV.';

/** Nem lai loi het tien de dung pipeline; loi khac thi bo qua cho ham goi xu ly. */
export function rethrowBalance(e: unknown) {
  if (isBalanceError(e)) throw new Error(BALANCE_MESSAGE);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Gui request, thu lai toi da 3 lan voi loi tam thoi (mang, 429, 5xx), gian cach 1s, 2s. */
async function send(url: string, init: RequestInit): Promise<any> {
  let last: RhError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1000 * 2 ** (attempt - 1));
    let r: Response;
    try {
      r = await fetch(url, init);
    } catch (e) {
      last = new RhError(`Không kết nối được RunningHub: ${e instanceof Error ? e.message : String(e)}`, true);
      continue;
    }
    const text = await r.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      /* body loi khong phai JSON */
    }
    if (r.ok) return data;
    const transient = r.status === 429 || r.status >= 500;
    last = new RhError(data.errorMessage || data.message || `RunningHub ${r.status}`, transient);
    if (!transient) break;
  }
  throw last!;
}

const json = (apiKey: string, body: unknown): RequestInit => ({
  method: 'POST',
  headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
  body: JSON.stringify(body),
});

/** Gui task cho 1 endpoint trong registry. Tra taskId (chap nhan ca task_id). */
export async function submit(apiKey: string, endpoint: string, payload: Record<string, unknown>): Promise<string> {
  const res = await send(`${TASK_BASE}/${endpoint}`, json(apiKey, payload));
  const id = res.taskId || res.task_id;
  if (!id) throw new RhError(res.errorMessage || `RunningHub không trả taskId (${res.errorCode || 'không rõ'})`, false);
  return String(id);
}

/** Hoi trang thai task. Loi tam thoi cung tra ve trang thai 'RUNNING' de lan hoi sau thu lai. */
export async function queryTask(apiKey: string, taskId: string): Promise<RhResult> {
  try {
    return (await send(`${TASK_BASE}/query`, json(apiKey, {taskId}))) as RhResult;
  } catch (e) {
    if (e instanceof RhError && e.transient) return {taskId, status: 'RUNNING'};
    throw e;
  }
}

/** Upload file len RunningHub, tra download_url de dua vao imageUrl/imageUrls/videoUrl... */
export async function uploadMedia(apiKey: string, bytes: ArrayBuffer, mime: string, name: string): Promise<string> {
  const fd = new FormData();
  fd.set('file', new Blob([bytes], {type: mime}), name);
  const res = await send(`${TASK_BASE}/media/upload/binary`, {method: 'POST', headers: {Authorization: `Bearer ${apiKey}`}, body: fd});
  const url = res?.data?.download_url;
  if (res?.code !== 0 || !url) throw new RhError(`Upload lên RunningHub lỗi: ${res?.msg || res?.message || JSON.stringify(res).slice(0, 120)}`, false);
  return String(url);
}

/** Luu response cuoi cung (de tra loi sau) vao KV 30 ngay. */
export async function keepRaw(kv: KVNamespace, res: RhResult) {
  if (res.taskId && (isSuccess(res.status) || isFailure(res.status))) {
    await kv.put(`rhraw/${res.taskId}`, JSON.stringify(res), {expirationTtl: RAW_TTL_SEC});
  }
}

// ── Doc ket qua ─────────────────────────────────────────────────────────────
type Kind = 'image' | 'video' | 'audio';
const EXT: Record<Kind, string[]> = {image: ['jpg', 'jpeg', 'png', 'webp'], video: ['mp4', 'mov'], audio: ['mp3', 'm4a', 'wav']};
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
};
const extOfUrl = (url: string) => url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';

/** Cac file ket qua cung loai. outputType co the la duoi file (mp3, jpg) hoac ten loai (image, video). */
export function outputsOf(res: RhResult, kind: Kind): {url: string; mime: string}[] {
  return (res.results ?? []).flatMap(r => {
    const url = r.url || r.outputUrl;
    if (!url) return [];
    const t = (r.outputType ?? '').toLowerCase();
    const ext = EXT[kind].includes(t) ? t : extOfUrl(url);
    if (t !== kind && !EXT[kind].includes(t) && !EXT[kind].includes(ext)) return [];
    return [{url, mime: MIME[ext] ?? MIME[EXT[kind][0]]}];
  });
}

export const costOf = (res: RhResult) => Number(res.usage?.thirdPartyConsumeMoney ?? 0) || 0;

// ── Model dung trong app (schema: model-registry.public.json) ───────────────
export type SunoInput = {
  title: string;
  lyrics: string;
  tags: string;
  negativeTags?: string;
  vocalGender?: 'm' | 'f';
};

/** rhart-audio/suno-v6/custom: tu dua loi + style. Ra 2 ban + 2 anh bia. Cac truong LIST la chuoi theo registry. */
export function submitSunoCustom(apiKey: string, s: SunoInput): Promise<string> {
  return submit(apiKey, 'rhart-audio/suno-v6/custom', {
    make_instrumental: 'false',
    prompt: s.lyrics,
    title: s.title.slice(0, 80),
    tags: s.tags.slice(0, 1000),
    ...(s.negativeTags ? {negativeTags: s.negativeTags} : {}),
    ...(s.vocalGender ? {vocalGender: s.vocalGender} : {}),
    autoLyrics: 'false',
    audioFormat: 'mp3',
  });
}

/** seedream-v5.5: anh theo kich thuoc pixel (khong co aspectRatio). Co anh tham chieu thi image-to-image (da thu 2 anh). */
export function submitSeedream(apiKey: string, o: {prompt: string; refs?: string[]; width: number; height: number}): Promise<string> {
  const base = {prompt: o.prompt, width: o.width, height: o.height, outputFormat: 'jpeg', watermark: 'false'};
  return o.refs?.length
    ? submit(apiKey, 'seedream-v5.5/image-to-image', {...base, imageUrls: o.refs})
    : submit(apiKey, 'seedream-v5.5/text-to-image', base);
}

/** Cac do dai clip ma Seedance 2.0 mini nhan (LIST trong registry). */
export const CLIP_SECONDS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export type ClipInput = {image: string; lastFrame?: string; prompt: string; seconds: number; ratio: '9:16' | '16:9'};

/** Quay 1 clip tu khung dau (va khung cuoi) bang model cua muc MV. */
export function submitVideo(apiKey: string, model: 'veo-fast' | 'seedance-mini', o: ClipInput): Promise<string> {
  return model === 'veo-fast' ? submitVeoFast(apiKey, o) : submitSeedanceMini(apiKey, o);
}

/**
 * rhart-video-v3.1-fast/start-end-to-video (registry: "google/veo3.1-fast/start-end-to-video"): 720p, clip luon 8s,
 * tinh tien theo luot. Anh nhan JPG/PNG (Seedream xuat jpeg). Model tu tao tieng; ghep video tren trinh duyet da tat tieng clip.
 */
function submitVeoFast(apiKey: string, o: ClipInput): Promise<string> {
  return submit(apiKey, 'rhart-video-v3.1-fast/start-end-to-video', {
    prompt: o.prompt,
    firstFrameUrl: o.image,
    ...(o.lastFrame ? {lastFrameUrl: o.lastFrame} : {}),
    aspectRatio: o.ratio,
    duration: '8',
    resolution: '720p',
  });
}

/**
 * rhart-video/sparkvideo-2.0-mini/image-to-video (registry: "seedance-2.0-mini"), 720p, khong tieng, 4-15s.
 * Co `lastFrame` thi dung che do khung dau + khung cuoi.
 */
function submitSeedanceMini(apiKey: string, o: ClipInput): Promise<string> {
  const sec = CLIP_SECONDS.find(s => s >= Math.round(o.seconds)) ?? CLIP_SECONDS[CLIP_SECONDS.length - 1];
  return submit(apiKey, 'rhart-video/sparkvideo-2.0-mini/image-to-video', {
    prompt: o.prompt,
    resolution: '720p',
    duration: String(sec),
    firstFrameUrl: o.image,
    ...(o.lastFrame ? {lastFrameUrl: o.lastFrame} : {}),
    generateAudio: false,
    ratio: o.ratio,
    realPersonMode: true,
    returnLastFrame: false,
    seed: -1,
  });
}

// ── LLM proxy ───────────────────────────────────────────────────────────────
export type LlmUsage = {input: number; output: number};

/**
 * Goi LLM qua proxy cua RunningHub, nhan ket qua dang stream (SSE).
 * Proxy nam sau Cloudflare: neu cho tra loi tron goi qua 100s se bi loi 524 (kich ban MV dai, model suy nghi lau),
 * con stream thi proxy tra byte dau ngay nen khong bi cat.
 */
export async function chatText(
  apiKey: string,
  o: {model: string; system: string; user: string; maxTokens?: number},
): Promise<{text: string; usage: LlmUsage}> {
  const r = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({
      model: o.model,
      max_tokens: o.maxTokens ?? 6000,
      stream: true,
      stream_options: {include_usage: true},
      messages: [
        {role: 'system', content: o.system},
        {role: 'user', content: o.user},
      ],
    }),
  });
  if (!r.ok || !r.body) {
    const data: any = await r.json().catch(() => ({}));
    throw new Error(data.error?.message || data.message || `RunningHub LLM ${r.status}`);
  }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let text = '';
  let finish = '';
  const usage: LlmUsage = {input: 0, output: 0};
  const handle = (line: string) => {
    const s = line.trim();
    if (!s.startsWith('data:')) return;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let chunk: any;
    try {
      chunk = JSON.parse(payload);
    } catch {
      return;
    }
    if (chunk.error) throw new Error(chunk.error.message || 'RunningHub LLM lỗi giữa chừng');
    const c = chunk.choices?.[0];
    if (c?.delta?.content) text += c.delta.content;
    if (c?.finish_reason) finish = c.finish_reason;
    if (chunk.usage) {
      usage.input = Number(chunk.usage.prompt_tokens) || usage.input;
      usage.output = Number(chunk.usage.completion_tokens) || usage.output;
    }
  };
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    lines.forEach(handle);
  }
  if (buf) handle(buf);
  text = text.trim();
  if (!text) throw new Error(finish === 'length' ? 'AI hết token trước khi trả lời' : 'AI không trả lời');
  return {text, usage};
}

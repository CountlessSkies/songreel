// Client RunningHub: task API (Suno) va LLM proxy (Claude / Gemini / GPT). Dua tren roomcraft-ai src/worker/runninghub.ts.
const TASK_BASE = 'https://www.runninghub.ai/openapi/v2';
const LLM_BASE = 'https://llm.runninghub.ai/v1';

export type RhStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
export type RhResult = {
  taskId?: string;
  status: RhStatus;
  errorCode?: string;
  errorMessage?: string;
  results?: {url: string; outputType: string}[] | null;
  usage?: {thirdPartyConsumeMoney?: string | null} | null;
};

async function rh(apiKey: string, path: string, body: unknown): Promise<RhResult> {
  const r = await fetch(`${TASK_BASE}${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* body loi khong phai JSON */
  }
  if (!r.ok) throw new Error(data.errorMessage || data.message || `RunningHub ${r.status}`);
  return data as RhResult;
}

export type SunoInput = {
  title: string;
  lyrics: string;
  tags: string;
  negativeTags?: string;
  vocalGender?: 'm' | 'f';
};

/** Suno v6 custom mode: tu dua loi + style. Ra 2 ban + 2 anh bia. */
export async function submitSunoCustom(apiKey: string, s: SunoInput): Promise<string> {
  const res = await rh(apiKey, '/rhart-audio/suno-v6/custom', {
    make_instrumental: 'false',
    prompt: s.lyrics,
    title: s.title.slice(0, 80),
    tags: s.tags.slice(0, 1000),
    ...(s.negativeTags ? {negativeTags: s.negativeTags} : {}),
    ...(s.vocalGender ? {vocalGender: s.vocalGender} : {}),
    autoLyrics: 'false',
    audioFormat: 'mp3',
  });
  if (!res.taskId) throw new Error(res.errorMessage || 'RunningHub không trả taskId');
  return res.taskId;
}

/** Nano Banana 2.1 official ($0.03/anh). Co anh reference thi goi image-to-image (toi da 14 anh). */
export async function submitImage(apiKey: string, o: {prompt: string; refs?: string[]; aspectRatio: string}): Promise<string> {
  const base = '/rhart-image-n-nb21-official';
  const res = o.refs?.length
    ? await rh(apiKey, `${base}/image-to-image`, {imageUrls: o.refs, prompt: o.prompt, resolution: '1k', aspectRatio: o.aspectRatio})
    : await rh(apiKey, `${base}/text-to-image`, {prompt: o.prompt, resolution: '1k', aspectRatio: o.aspectRatio});
  if (!res.taskId) throw new Error(res.errorMessage || 'RunningHub không trả taskId');
  return res.taskId;
}

/** Seedance 2.0 mini image-to-video, 720p, tinh tien theo giay ($0.1/s). Co nguoi that thi bat buoc realPersonMode. */
export async function submitClip(apiKey: string, o: {image: string; prompt: string; seconds: number; ratio: string}): Promise<string> {
  const res = await rh(apiKey, '/bytedance/seedance-2.0-global-mini/image-to-video', {
    prompt: o.prompt,
    resolution: '720p',
    duration: String(Math.min(15, Math.max(4, Math.round(o.seconds)))),
    firstFrameUrl: o.image,
    generateAudio: false,
    ratio: o.ratio,
    realPersonMode: true,
    returnLastFrame: false,
    seed: -1,
  });
  if (!res.taskId) throw new Error(res.errorMessage || 'RunningHub không trả taskId');
  return res.taskId;
}

export const queryTask = (apiKey: string, taskId: string) => rh(apiKey, '/query', {taskId});

export type LlmUsage = {input: number; output: number};

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
      messages: [
        {role: 'system', content: o.system},
        {role: 'user', content: o.user},
      ],
    }),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || data.message || `RunningHub LLM ${r.status}`);
  const text = String(data.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new Error('AI không trả lời');
  return {
    text,
    usage: {input: Number(data.usage?.prompt_tokens) || 0, output: Number(data.usage?.completion_tokens) || 0},
  };
}

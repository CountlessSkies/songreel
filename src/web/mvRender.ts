// Ve MV len canvas theo thoi gian bai hat: anh co Ken Burns, clip, chuyen canh mo dan, the tieu de va chu karaoke.
// Dung chung cho xem truoc va xuat video (canvas.captureStream + MediaRecorder), nen xem the nao xuat ra the ay.
import type {MvScene} from '../shared/mv';

export const FADE_SEC = 0.6;
export const TITLE_SEC = 3.5;

/**
 * Anh va clip cua cac canh. Clip duoc tai tron ve may (blob) roi moi gan vao the <video>:
 * trinh duyet khong tu tai truoc cac the video an, nen neu de no tu tai thi canh nao clip chua kip ve se hien anh tinh.
 */
export type Media = {
  imgs: Map<string, HTMLImageElement>;
  vids: Map<string, HTMLVideoElement>;
  /** Trang thai tai tung clip (theo URL goc). */
  clipState: Map<string, 'queued' | 'loading' | 'ready' | 'error'>;
  queue: string[];
  active: number;
};

const CLIP_FETCH_CONCURRENCY = 3;
const CLIP_FETCH_TRIES = 3;

export function createMedia(): Media {
  return {imgs: new Map(), vids: new Map(), clipState: new Map(), queue: [], active: 0};
}

async function fetchClip(m: Media, url: string) {
  const v = m.vids.get(url)!;
  for (let k = 0; k < CLIP_FETCH_TRIES; k++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      v.src = URL.createObjectURL(await r.blob());
      v.load();
      m.clipState.set(url, 'ready');
      return;
    } catch {
      await new Promise(res => setTimeout(res, 1000 * (k + 1)));
    }
  }
  m.clipState.set(url, 'error');
}

/** Tai lan luot theo thu tu canh, toi da 3 clip cung luc. */
function pump(m: Media) {
  while (m.active < CLIP_FETCH_CONCURRENCY && m.queue.length) {
    const url = m.queue.shift()!;
    m.active++;
    m.clipState.set(url, 'loading');
    void fetchClip(m, url).finally(() => {
      m.active--;
      pump(m);
    });
  }
}

/** Tai truoc anh va clip cua cac canh da xong. */
export function syncMedia(m: Media, scenes: MvScene[]) {
  for (const s of scenes) {
    for (const url of [s.imageUrl, s.endImageUrl]) {
      if (!url || m.imgs.has(url)) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      m.imgs.set(url, img);
    }
    if (s.clipUrl && s.status === 'done' && !m.vids.has(s.clipUrl)) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      m.vids.set(s.clipUrl, v);
      m.clipState.set(s.clipUrl, 'queued');
      m.queue.push(s.clipUrl);
    }
  }
  pump(m);
}

/** So clip da tai xong / tong so clip (loi tai cung tinh la xong de khong cho mai). */
export function clipProgress(m: Media, scenes: MvScene[]) {
  const urls = scenes.filter(s => s.clipUrl && s.status === 'done').map(s => s.clipUrl!);
  const ready = urls.filter(u => {
    const st = m.clipState.get(u);
    return st === 'error' || st === 'ready';
  }).length;
  const failed = urls.filter(u => m.clipState.get(u) === 'error').length;
  return {ready, total: urls.length, failed};
}

/** Da tai xong het anh va clip (de cho truoc khi xuat). */
export function mediaReady(m: Media, scenes: MvScene[]) {
  const p = clipProgress(m, scenes);
  return (
    p.ready === p.total &&
    scenes.every(s => (!s.imageUrl || m.imgs.get(s.imageUrl)?.complete) && (!s.endImageUrl || m.imgs.get(s.endImageUrl)?.complete))
  );
}

type Src = HTMLImageElement | HTMLVideoElement;
const sizeOf = (s: Src) => (s instanceof HTMLVideoElement ? [s.videoWidth, s.videoHeight] : [s.naturalWidth, s.naturalHeight]);

/** Ve phu kin khung (object-fit: cover) voi zoom va dich chuyen. */
function cover(ctx: CanvasRenderingContext2D, src: Src, W: number, H: number, zoom = 1, dx = 0, dy = 0) {
  const [w, h] = sizeOf(src);
  if (!w || !h) return false;
  const s = Math.max(W / w, H / h) * zoom;
  ctx.drawImage(src, (W - w * s) / 2 + dx * W, (H - h * s) / 2 + dy * H, w * s, h * s);
  return true;
}

export type DrawOpts = {
  scenes: MvScene[];
  t: number;
  isPlaying: boolean;
  recipient: string;
  title: string;
};

export function drawFrame(ctx: CanvasRenderingContext2D, m: Media, o: DrawOpts) {
  const {width: W, height: H} = ctx.canvas;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const {scenes, t} = o;
  if (!scenes.length) return;

  let i = scenes.findIndex(s => t >= s.start && t < s.end);
  if (i < 0) i = t < scenes[0].start ? 0 : scenes.length - 1;
  const cur = scenes[i];
  const local = t - cur.start;
  const live = new Set<HTMLVideoElement>();

  if (i > 0 && local < FADE_SEC) drawScene(ctx, m, scenes[i - 1], t, 1, o.isPlaying, live);
  drawScene(ctx, m, cur, t, i > 0 ? Math.min(1, local / FADE_SEC) : 1, o.isPlaying, live);
  for (const v of m.vids.values()) if (!live.has(v) && !v.paused) v.pause();

  ctx.globalAlpha = 1;
  if (t < TITLE_SEC) drawTitle(ctx, o, t);
  const line = lineAt(cur, t);
  if (line) drawSub(ctx, line, Math.min(1, (t - lineStart(cur, t)) / 0.35));
  drawBrand(ctx);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  m: Media,
  s: MvScene,
  t: number,
  alpha: number,
  isPlaying: boolean,
  live: Set<HTMLVideoElement>,
) {
  const {width: W, height: H} = ctx.canvas;
  const local = t - s.start;
  const vid = s.clipUrl && s.status === 'done' ? m.vids.get(s.clipUrl) : undefined;
  const clipLen = vid && vid.duration ? Math.min(vid.duration, s.clipSec || vid.duration) : 0;
  const img = s.imageUrl ? m.imgs.get(s.imageUrl) : undefined;

  // Anh tinh: Ken Burns cham suot canh
  const p = Math.max(0, Math.min(1, local / Math.max(1, s.end - s.start)));
  const drawStill = (a: number) => {
    if (!img?.complete || a <= 0) return;
    ctx.globalAlpha = a;
    cover(ctx, img, W, H, 1.04 + 0.1 * p, -0.02 * p, -0.03 * p);
  };
  // Sau khi clip chay het: dung yen o khung cuoi (khong zoom de khop hinh cuoi cua clip)
  const endImg = s.endImageUrl ? m.imgs.get(s.endImageUrl) : undefined;
  const drawHold = (a: number) => {
    if (!endImg?.complete || a <= 0) return drawStill(a);
    ctx.globalAlpha = a;
    cover(ctx, endImg, W, H);
  };

  // Clip da tai ve (blob) nhung trinh duyet chua giai ma (the video an, tab an): bam phat de no giai ma, tam ve anh
  if (vid && vid.readyState < 2 && isPlaying && vid.paused && (!vid.duration || local < vid.duration)) {
    live.add(vid);
    if (Math.abs(vid.currentTime - local) > 0.35) vid.currentTime = Math.max(0, local);
    void vid.play().catch(() => {});
  }
  if (vid && vid.readyState >= 2 && local < clipLen) {
    live.add(vid);
    if (Math.abs(vid.currentTime - local) > 0.35) vid.currentTime = Math.max(0, local);
    if (isPlaying && vid.paused) void vid.play().catch(() => {});
    if (!isPlaying && !vid.paused) vid.pause();
    ctx.globalAlpha = alpha;
    cover(ctx, vid, W, H);
    // Clip het truoc canh: mo dan sang khung cuoi (chinh la hinh ket cua clip) hoac anh tinh
    const tail = clipLen - local;
    if (tail < FADE_SEC && clipLen < s.end - s.start - 0.2) drawHold(alpha * (1 - tail / FADE_SEC));
    return;
  }
  if (vid && clipLen && local >= clipLen) drawHold(alpha);
  else drawStill(alpha);
}

/** Cau dang hat trong canh. Co moc do (lineTimes) thi theo moc, khong thi chia deu canh. */
function lineIndex(s: MvScene, t: number) {
  if (s.lineTimes?.length === s.lines.length) {
    let k = 0;
    for (let i = 0; i < s.lineTimes.length; i++) if (t >= s.lineTimes[i][0]) k = i;
    return k;
  }
  const per = (s.end - s.start) / s.lines.length;
  return Math.min(s.lines.length - 1, Math.max(0, Math.floor((t - s.start) / per)));
}

function lineStart(s: MvScene, t: number) {
  if (!s.lines.length) return s.start;
  const k = lineIndex(s, t);
  return s.lineTimes?.length === s.lines.length ? s.lineTimes[k][0] : s.start + k * ((s.end - s.start) / s.lines.length);
}

export function lineAt(s: MvScene, t: number) {
  if (!s.lines.length) return null;
  // Co moc do: chi hien chu trong luc hat (cong 1.2s cho de doc), khong hien khi nhac dao
  if (s.lineTimes?.length === s.lines.length) {
    const k = lineIndex(s, t);
    const [a, b] = s.lineTimes[k];
    if (t < a - 0.15 || t > b + 1.2) return null;
    return s.lines[k];
  }
  return s.lines[lineIndex(s, t)];
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawSub(ctx: CanvasRenderingContext2D, text: string, a: number) {
  const {width: W, height: H} = ctx.canvas;
  const size = Math.round(Math.min(W, H) * 0.052);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `700 ${size}px 'Be Vietnam Pro', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = size * 0.5;
  ctx.shadowOffsetY = size * 0.08;
  const lines = wrap(ctx, text, W * 0.84);
  const lh = size * 1.3;
  const base = H * (H > W ? 0.86 : 0.88) - (lines.length - 1) * lh;
  lines.forEach((l, k) => ctx.fillText(l, W / 2, base + k * lh + (1 - a) * size * 0.3));
  ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, o: DrawOpts, t: number) {
  const {width: W, height: H} = ctx.canvas;
  const a = Math.min(1, t / 0.5, (TITLE_SEC - t) / 0.6);
  const u = Math.min(W, H);
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = u * 0.02;
  ctx.font = `600 ${Math.round(u * 0.032)}px 'Be Vietnam Pro', system-ui, sans-serif`;
  ctx.fillText('DÀNH TẶNG', W / 2, H / 2 - u * 0.11);
  ctx.font = `${Math.round(u * 0.1)}px 'Pacifico', cursive`;
  ctx.fillText(o.recipient, W / 2, H / 2 + u * 0.02);
  ctx.font = `500 ${Math.round(u * 0.035)}px 'Be Vietnam Pro', system-ui, sans-serif`;
  for (const [k, l] of wrap(ctx, o.title, W * 0.8).entries()) ctx.fillText(l, W / 2, H / 2 + u * 0.1 + k * u * 0.045);
  ctx.restore();
}

function drawBrand(ctx: CanvasRenderingContext2D) {
  const {width: W, height: H} = ctx.canvas;
  const u = Math.min(W, H);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.font = `${Math.round(u * 0.035)}px 'Pacifico', cursive`;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = u * 0.015;
  ctx.textAlign = 'left';
  ctx.fillText('Sol Songs', u * 0.04, u * 0.07);
  ctx.restore();
}

/** Dinh dang ghi ma trinh duyet ho tro, uu tien MP4. */
export function pickMime() {
  const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

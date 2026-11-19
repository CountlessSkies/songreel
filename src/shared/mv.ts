import type {LyricSection} from './catalog';

/** Hai kieu MV tam. Gia ban la gia de xuat cho PoC, chua chot. */
export type MvMode = 'hybrid' | 'full';
export type MvRatio = '9:16' | '16:9';

export const MV_MODES: Record<MvMode, {label: string; price: number; description: string}> = {
  hybrid: {
    label: 'Lai ảnh + clip',
    price: 299_000,
    description: 'Điệp khúc là video chuyển động, các đoạn khác là ảnh có máy quay lướt nhẹ.',
  },
  full: {
    label: 'Toàn clip',
    price: 699_000,
    description: 'Mọi cảnh đều là video chuyển động, giống MV thật.',
  },
};

/** Gia RunningHub do that ngay 2026-11-19 (USD). */
export const MV_COST = {
  image: 0.03, // Nano Banana 2.1 official, 1k
  clipPerSec: 0.1, // Seedance 2.0 mini i2v 720p
};

/** Clip Seedance 2.0 dai 4-15s. Kieu lai chi mua 6s dau canh, phan con lai la anh co Ken Burns. */
export const CLIP_MIN = 4;
export const CLIP_MAX = 15;
export const HYBRID_CLIP = 6;

export type SceneKind = 'clip' | 'still';
export type SceneStatus = 'pending' | 'image' | 'clip' | 'done' | 'failed';

export type MvScene = {
  idx: number;
  start: number;
  end: number;
  section: string;
  lines: string[];
  kind: SceneKind;
  /** So giay clip phai mua (0 voi canh anh). */
  clipSec: number;
  imageUrl: string | null;
  clipUrl: string | null;
  status: SceneStatus;
};

export type MvView = {
  id: string;
  orderId: string;
  mode: MvMode;
  ratio: MvRatio;
  take: number;
  status: 'running' | 'ready' | 'failed';
  scenes: MvScene[];
  costUsd: number;
  error: string | null;
};

/**
 * Chia bai thanh canh. Suno khong tra moc thoi gian tung cau nen uoc luong:
 * giong hat chiem khoang 8%..94% bai, cac cau chia deu theo so chu. Moi cau 1 canh (~6-10s),
 * them 1 canh mo dau va 1 canh ket. Toan clip: canh nao dai hon 15s thi tach doi.
 */
export function planScenes(lyrics: LyricSection[], durationSec: number, mode: MvMode): Omit<MvScene, 'imageUrl' | 'clipUrl' | 'status'>[] {
  const lines = lyrics.flatMap(s => s.lines.map(text => ({text, section: s.name, chorus: s.kind === 'chorus'})));
  const vStart = durationSec * 0.08;
  const vEnd = durationSec * 0.94;
  const weights = lines.map(l => Math.max(3, l.text.split(/\s+/).length));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = vStart;
  const timed = lines.map((l, i) => {
    const dur = ((vEnd - vStart) * weights[i]) / total;
    const r = {...l, start: t, end: t + dur};
    t += dur;
    return r;
  });

  type Raw = {start: number; end: number; section: string; lines: string[]; chorus: boolean};
  const raw: Raw[] = [{start: 0, end: vStart, section: 'Mở đầu', lines: [], chorus: false}];
  for (const a of timed) raw.push({start: a.start, end: a.end, section: a.section, lines: [a.text], chorus: a.chorus});
  raw.push({start: vEnd, end: durationSec, section: 'Kết', lines: [], chorus: false});

  const out: Raw[] = [];
  for (const r of raw) {
    const len = r.end - r.start;
    if (mode === 'full' && len > CLIP_MAX) {
      const n = Math.ceil(len / CLIP_MAX);
      for (let k = 0; k < n; k++) {
        out.push({...r, start: r.start + (len * k) / n, end: r.start + (len * (k + 1)) / n, lines: k === 0 ? r.lines : []});
      }
    } else out.push(r);
  }
  return out.map((r, idx) => {
    const kind: SceneKind = mode === 'full' || r.chorus ? 'clip' : 'still';
    const cap = mode === 'full' ? CLIP_MAX : HYBRID_CLIP;
    const clipSec = kind === 'clip' ? Math.min(cap, Math.max(CLIP_MIN, Math.round(r.end - r.start))) : 0;
    return {idx, start: r.start, end: r.end, section: r.section, lines: r.lines, kind, clipSec};
  });
}

export function estimateCostUsd(scenes: {clipSec: number}[]) {
  return scenes.reduce((sum, s) => sum + MV_COST.image + s.clipSec * MV_COST.clipPerSec, 0);
}

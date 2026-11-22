import type {LyricSection} from './catalog';

/**
 * Kieu dung MV. Moi MV moi deu la 'story': pipeline ke chuyen cua director (ref/CAM_Creative_Pipeline_MV_Online.md):
 * moc loi Whisper, kich ban + shot list, character/location sheet, khung dau + khung cuoi tung canh,
 * duyet storyboard roi moi quay clip. 'hybrid' va 'full' la pipeline cu da go, chi con de xem lai MV cu.
 */
export type MvMode = 'hybrid' | 'full' | 'story';
export type MvRatio = '9:16' | '16:9';

/** Ba muc MV ban cho khach, theo ref/solsongs-v1.6.1.html. Cung pipeline ke chuyen, khac model quay video. */
export type MvTier = 'amateur' | 'pro' | 'cinematic';

/** Model quay video. Endpoint lay tu model-registry.public.json cua RunningHub. */
export type VideoModel = 'veo-fast' | 'seedance-mini';

export const MV_TIERS: Record<MvTier, {label: string; price: number; video: VideoModel; description: string}> = {
  amateur: {
    label: 'Amateur',
    price: 299_000,
    video: 'veo-fast',
    description: 'MV kể chuyện theo lời, nhân vật và bối cảnh nhất quán, duyệt storyboard trước khi quay. Video Veo 3.1 fast, mỗi cảnh 8 giây.',
  },
  pro: {
    label: 'Pro',
    price: 1_000_000,
    video: 'seedance-mini',
    description: 'MV kể chuyện như Amateur, video Seedance 2.0 quay trọn từng cảnh theo đúng độ dài câu hát.',
  },
  cinematic: {
    label: 'Cinematic',
    price: 2_500_000,
    video: 'seedance-mini',
    description: 'MV kể chuyện như Pro. Bản thử nghiệm: hiện dựng giống mức Pro.',
  },
};

export const isMvTier = (v: string | null): v is MvTier => !!v && v in MV_TIERS;

/** Gia RunningHub (USD), do that 2026-11-22/23 hoac theo bang gia tham khao cua developer kit. */
export const MV_COST = {
  image: 0.04, // Seedream 5.5 + phi anh tham chieu, do that
  sheets: 4, // uoc tinh so anh character/location sheet
  seedancePerSec: 0.1, // Seedance 2.0 mini 720p, do that $0.60 cho 6s
  veoPerClip: 0.21, // Veo 3.1 fast start-end, bang gia tham khao 1.5 te/luot (clip 8s)
};

/** Clip Seedance 2.0 mini dai 4-15s; Veo 3.1 fast luon 8s. */
export const CLIP_MIN = 4;
export const CLIP_MAX = 15;
export const VEO_SECONDS = 8;

export type SceneKind = 'clip' | 'still';
/** 'framed': da co khung dau (va khung cuoi), cho duyet storyboard roi moi quay clip. */
export type SceneStatus = 'pending' | 'image' | 'framed' | 'clip' | 'done' | 'failed';

export type MvScene = {
  idx: number;
  start: number;
  end: number;
  section: string;
  lines: string[];
  kind: SceneKind;
  /** So giay clip quay (0 voi canh anh). */
  clipSec: number;
  imageUrl: string | null;
  clipUrl: string | null;
  status: SceneStatus;
  /** Khung cuoi cua canh: clip ket thuc o day, canh dai hon clip thi dung o khung nay. */
  endImageUrl?: string | null;
  /** Chi dao dien xuat bang tieng Viet cho storyboard. */
  action?: string;
  /** Moc [bat dau, ket thuc] tung cau trong canh (do bang Whisper). Khong co thi chia deu canh. */
  lineTimes?: [number, number][];
};

export type MvView = {
  id: string;
  orderId: string;
  mode: MvMode;
  /** Muc MV khach chon (MV cu truoc khi co muc thi null). */
  tier: MvTier | null;
  ratio: MvRatio;
  take: number;
  /** 'review': storyboard xong, cho khach duyet roi moi quay clip. */
  status: 'running' | 'review' | 'ready' | 'failed';
  scenes: MvScene[];
  costUsd: number;
  error: string | null;
  /** Anh nhan vat va boi canh dung lam tham chieu. */
  sheets?: {label: string; url: string}[];
  /** Cau tom tat cau chuyen. */
  logline?: string | null;
  /** Moc loi do tu giong hat hay uoc luong. */
  timing?: 'measured' | 'estimated' | null;
  /** Chi phi quay clip uoc tinh (USD), hien o buoc duyet. */
  clipCostUsd?: number;
};

/** So giay clip cua 1 canh theo model video. */
export function clipSecondsFor(video: VideoModel, sceneSec: number) {
  if (video === 'veo-fast') return VEO_SECONDS;
  return Math.min(CLIP_MAX, Math.max(CLIP_MIN, Math.ceil(sceneSec)));
}

/** Chi phi quay clip (USD) cho cac canh. */
export function clipCostUsd(video: VideoModel, scenes: {kind: SceneKind; clipSec: number}[]) {
  const clips = scenes.filter(s => s.kind === 'clip');
  return video === 'veo-fast' ? clips.length * MV_COST.veoPerClip : clips.reduce((sum, s) => sum + s.clipSec * MV_COST.seedancePerSec, 0);
}

/** Chi phi AI uoc tinh (USD): 2 khung moi canh + cac sheet + clip. */
export function estimateCostUsd(scenes: {kind: SceneKind; clipSec: number}[], tier: MvTier) {
  return clipCostUsd(MV_TIERS[tier].video, scenes) + (scenes.length * 2 + MV_COST.sheets) * MV_COST.image;
}

/**
 * Canh du kien truoc khi dung (xem truoc o Xuong MV va che do gia lap). Moc loi uoc luong:
 * giong hat chiem khoang 8%..94% bai, cac cau chia theo so chu, them canh mo dau va ket, canh dai hon 15s thi tach.
 * Ban that chia lai theo moc do bang Whisper (src/worker/align.ts).
 */
export function planScenes(lyrics: LyricSection[], durationSec: number, tier: MvTier): Omit<MvScene, 'imageUrl' | 'clipUrl' | 'status'>[] {
  const lines = lyrics.flatMap(s => s.lines.map(text => ({text, section: s.name})));
  const vStart = durationSec * 0.08;
  const vEnd = durationSec * 0.94;
  const weights = lines.map(l => Math.max(3, l.text.split(/\s+/).length));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = vStart;
  type Raw = {start: number; end: number; section: string; lines: string[]};
  const raw: Raw[] = [{start: 0, end: vStart, section: 'Mở đầu', lines: []}];
  lines.forEach((l, i) => {
    const dur = ((vEnd - vStart) * weights[i]) / total;
    raw.push({start: t, end: t + dur, section: l.section, lines: [l.text]});
    t += dur;
  });
  raw.push({start: vEnd, end: durationSec, section: 'Kết', lines: []});

  const out: Raw[] = [];
  for (const r of raw) {
    const len = r.end - r.start;
    const n = Math.ceil(len / CLIP_MAX);
    for (let k = 0; k < n; k++) out.push({...r, start: r.start + (len * k) / n, end: r.start + (len * (k + 1)) / n, lines: k === 0 ? r.lines : []});
  }
  const video = MV_TIERS[tier].video;
  return out.map((r, idx) => ({
    idx, start: r.start, end: r.end, section: r.section, lines: r.lines, kind: 'clip' as const, clipSec: clipSecondsFor(video, r.end - r.start),
  }));
}

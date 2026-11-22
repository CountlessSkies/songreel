import type {LyricSection} from './catalog';

/**
 * Kieu dung MV:
 * - hybrid: anh + clip o dieu khuc (Amateur)
 * - full: moi canh deu clip, mot nhan vat (pipeline cu, khong con muc nao dung)
 * - story: pipeline ke chuyen cua director (ref/CAM_Creative_Pipeline_MV_Online.md): moc loi Whisper,
 *   kich ban + shot list, character/location sheet, khung dau + khung cuoi tung canh, duyet storyboard, roi moi quay clip.
 */
export type MvMode = 'hybrid' | 'full' | 'story';
export type MvRatio = '9:16' | '16:9';

/** Ba muc MV ban cho khach, theo ref/solsongs-v1.6.1.html. Pro va Cinematic cung dung pipeline 'story'. */
export type MvTier = 'amateur' | 'pro' | 'cinematic';

export const MV_TIERS: Record<MvTier, {label: string; price: number; mode: MvMode; description: string}> = {
  amateur: {
    label: 'Amateur',
    price: 299_000,
    mode: 'hybrid',
    description: 'Điệp khúc là video chuyển động, các đoạn khác là ảnh có máy quay lướt nhẹ.',
  },
  pro: {
    label: 'Pro',
    price: 1_000_000,
    mode: 'story',
    description: 'MV kể chuyện: kịch bản theo lời, nhân vật và bối cảnh nhất quán, duyệt storyboard trước khi quay video.',
  },
  cinematic: {
    label: 'Cinematic',
    price: 2_500_000,
    mode: 'story',
    description: 'MV kể chuyện như mức Pro. Bản thử nghiệm: hiện dựng giống mức Pro.',
  },
};

export const isMvTier = (v: string | null): v is MvTier => !!v && v in MV_TIERS;

/** Gia RunningHub do that ngay 2026-11-19 (USD). */
export const MV_COST = {
  image: 0.03, // Nano Banana 2.1 official, 1k
  storyImage: 0.04, // Seedream 5.5 + phi anh tham chieu, do that 2026-11-22
  storySheets: 4, // uoc tinh so anh character/location sheet
  clipPerSec: 0.1, // Seedance 2.0 mini i2v 720p
};

/** Clip Seedance 2.0 dai 4-15s. Kieu lai chi mua 6s dau canh, phan con lai la anh co Ken Burns. */
export const CLIP_MIN = 4;
export const CLIP_MAX = 15;
export const HYBRID_CLIP = 6;

export type SceneKind = 'clip' | 'still';
/** 'framed': da co khung dau (va khung cuoi), cho duyet storyboard roi moi quay clip (chi kieu story). */
export type SceneStatus = 'pending' | 'image' | 'framed' | 'clip' | 'done' | 'failed';

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
  /** Kieu story: khung cuoi cua canh. */
  endImageUrl?: string | null;
  /** Kieu story: chi dao dien xuat bang tieng Viet cho storyboard. */
  action?: string;
  /** Moc [bat dau, ket thuc] tung cau trong canh (do bang Whisper). Khong co thi chia deu canh. */
  lineTimes?: [number, number][];
};

export type MvView = {
  id: string;
  orderId: string;
  mode: MvMode;
  ratio: MvRatio;
  take: number;
  /** 'review': storyboard xong, cho khach duyet roi moi quay clip (kieu story). */
  status: 'running' | 'review' | 'ready' | 'failed';
  scenes: MvScene[];
  costUsd: number;
  error: string | null;
  /** Kieu story: anh nhan vat va boi canh dung lam tham chieu. */
  sheets?: {label: string; url: string}[];
  /** Kieu story: cau tom tat cau chuyen. */
  logline?: string | null;
  /** Moc loi do tu giong hat hay uoc luong. */
  timing?: 'measured' | 'estimated' | null;
  /** Kieu story: chi phi quay clip uoc tinh (USD), hien o buoc duyet. */
  clipCostUsd?: number;
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
    if (mode !== 'hybrid' && len > CLIP_MAX) {
      const n = Math.ceil(len / CLIP_MAX);
      for (let k = 0; k < n; k++) {
        out.push({...r, start: r.start + (len * k) / n, end: r.start + (len * (k + 1)) / n, lines: k === 0 ? r.lines : []});
      }
    } else out.push(r);
  }
  return out.map((r, idx) => {
    const kind: SceneKind = mode !== 'hybrid' || r.chorus ? 'clip' : 'still';
    const cap = mode !== 'hybrid' ? CLIP_MAX : HYBRID_CLIP;
    const clipSec = kind === 'clip' ? Math.min(cap, Math.max(CLIP_MIN, Math.round(r.end - r.start))) : 0;
    return {idx, start: r.start, end: r.end, section: r.section, lines: r.lines, kind, clipSec};
  });
}

/** Chi phi AI uoc tinh (USD). Kieu story: 2 khung moi canh + cac sheet, clip moi canh. */
export function estimateCostUsd(scenes: {clipSec: number}[], mode: MvMode = 'hybrid') {
  const clips = scenes.reduce((sum, s) => sum + s.clipSec * MV_COST.clipPerSec, 0);
  if (mode === 'story') return clips + (scenes.length * 2 + MV_COST.storySheets) * MV_COST.storyImage;
  return clips + scenes.length * MV_COST.image;
}

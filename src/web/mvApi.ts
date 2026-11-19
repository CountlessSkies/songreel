import type {OrderView} from '../shared/catalog';
import {estimateCostUsd, planScenes, type MvMode, type MvRatio, type MvScene, type MvView} from '../shared/mv';
import {MOCK} from './api';

export type MvRequest = {mode: MvMode; ratio: MvRatio; takeIdx: number; durationSec: number; photos: File[]};

/** Thu nho anh ve canh dai 1280px, JPEG, de gui len nhe va vua lam reference. */
async function shrink(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Không đọc được ảnh'))), 'image/jpeg', 0.88));
}

const mockMvs = new Map<string, {order: OrderView; req: MvRequest; start: number}>();

export async function createMv(order: OrderView, req: MvRequest, passcode: string): Promise<{id: string}> {
  if (MOCK) {
    const id = Math.random().toString(36).slice(2, 10);
    mockMvs.set(id, {order, req, start: Date.now()});
    return {id};
  }
  const fd = new FormData();
  fd.set('orderId', order.id);
  fd.set('mode', req.mode);
  fd.set('ratio', req.ratio);
  fd.set('take', String(req.takeIdx));
  fd.set('duration', String(req.durationSec));
  for (const [i, p] of req.photos.entries()) fd.append('photos', await shrink(p), `photo${i}.jpg`);
  const r = await fetch('/api/mv', {method: 'POST', headers: {'X-Passcode': passcode}, body: fd});
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as {error?: string} | null)?.error ?? `Lỗi ${r.status}`);
  return r.json();
}

export async function getMv(id: string): Promise<MvView> {
  if (MOCK) return mockMv(id);
  const r = await fetch(`/api/mv/${id}`);
  if (!r.ok) throw new Error(`Lỗi ${r.status}`);
  return r.json();
}

// ── Gia lap: anh/clip that tu lan chay thu, xoay vong cho cac canh ──
const IMAGES = ['/mock/mv/s1.jpg', '/mock/mv/s2.jpg', '/mock/mv/s3.jpg', '/mock/mv/s4.jpg', '/mock/mv/s5.jpg'];
const CLIPS = ['/mock/mv/clip1.mp4', '/mock/mv/clip2.mp4'];
const IMAGE_MS = 700;
const CLIP_MS = 1600;

function mockMv(id: string): MvView {
  const m = mockMvs.get(id);
  if (!m) throw new Error('Không tìm thấy MV');
  const dur = m.order.takes[m.req.takeIdx]?.durationSec ?? 180;
  const plan = planScenes(m.order.lyrics ?? [], dur, m.req.mode);
  const t = Date.now() - m.start;
  // Anh ve lan luot, xong anh nao thi quay clip canh do (song song toi da 3 clip)
  let clipIdx = 0;
  const scenes: MvScene[] = plan.map((p, i) => {
    const imgAt = (i + 1) * IMAGE_MS;
    const hasImage = t >= imgAt;
    let status: MvScene['status'] = hasImage ? 'done' : i * IMAGE_MS <= t ? 'image' : 'pending';
    let clipUrl: string | null = null;
    if (p.kind === 'clip' && hasImage) {
      const k = clipIdx++;
      const clipDone = t >= imgAt + CLIP_MS * (1 + Math.floor(k / 3));
      status = clipDone ? 'done' : 'clip';
      clipUrl = CLIPS[k % CLIPS.length];
    }
    return {...p, imageUrl: hasImage ? IMAGES[i % IMAGES.length] : null, clipUrl, status};
  });
  return {
    id,
    orderId: m.order.id,
    mode: m.req.mode,
    ratio: m.req.ratio,
    take: m.req.takeIdx,
    status: scenes.every(s => s.status === 'done') ? 'ready' : 'running',
    scenes,
    costUsd: estimateCostUsd(plan),
    error: null,
  };
}

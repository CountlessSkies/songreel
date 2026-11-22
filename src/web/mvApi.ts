import type {OrderView} from '../shared/catalog';
import {clipCostUsd, estimateCostUsd, MV_TIERS, planScenes, type MvRatio, type MvScene, type MvTier, type MvView} from '../shared/mv';
import {MOCK} from './api';

export type MvRequest = {tier: MvTier; ratio: MvRatio; takeIdx: number; durationSec: number; photos: File[]};

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

const mockMvs = new Map<string, {order: OrderView; req: MvRequest; start: number; approvedAt?: number}>();

/** Duyet storyboard (MV ke chuyen): bat dau quay clip. */
export async function approveMv(id: string, passcode: string): Promise<MvView> {
  if (MOCK) {
    const m = mockMvs.get(id);
    if (m) m.approvedAt = Date.now();
    return mockMv(id);
  }
  const r = await fetch(`/api/mv/${id}/approve`, {method: 'POST', headers: {'X-Passcode': passcode}});
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as {error?: string} | null)?.error ?? `Lỗi ${r.status}`);
  return r.json();
}

export async function createMv(order: OrderView, req: MvRequest, passcode: string): Promise<{id: string}> {
  if (MOCK) {
    const id = Math.random().toString(36).slice(2, 10);
    mockMvs.set(id, {order, req, start: Date.now()});
    return {id};
  }
  const fd = new FormData();
  fd.set('orderId', order.id);
  fd.set('tier', req.tier);
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

/** Gia lap MV ke chuyen: ve khung dau/cuoi lan luot -> cho duyet -> quay clip. */
function mockStory(id: string, m: {order: OrderView; req: MvRequest; start: number; approvedAt?: number}): MvView {
  const dur = m.order.takes[m.req.takeIdx]?.durationSec ?? 180;
  const plan = planScenes(m.order.lyrics ?? [], dur, m.req.tier);
  const t = Date.now() - m.start;
  const framesAt = (i: number) => 1500 + (i + 1) * 400;
  const allFramed = t >= framesAt(plan.length - 1);
  const sinceApprove = m.approvedAt ? Date.now() - m.approvedAt : -1;
  const scenes: MvScene[] = plan.map((p, i) => {
    const framed = t >= framesAt(i);
    const clipDone = sinceApprove >= (i + 1) * 500;
    const status: MvScene['status'] = !framed ? (t >= framesAt(i) - 400 ? 'image' : 'pending') : sinceApprove < 0 ? 'framed' : clipDone ? 'done' : 'clip';
    return {
      ...p,
      imageUrl: framed ? IMAGES[i % IMAGES.length] : null,
      endImageUrl: framed ? IMAGES[(i + 2) % IMAGES.length] : null,
      clipUrl: clipDone ? CLIPS[i % CLIPS.length] : null,
      action: p.lines.length ? `Mẹ nhớ lại: ${p.lines[0].toLowerCase()}` : 'Cảnh mở: ngôi nhà ngói buổi sáng',
      status,
    };
  });
  const clipCost = clipCostUsd(MV_TIERS[m.req.tier].video, plan);
  return {
    id,
    orderId: m.order.id,
    mode: 'story',
    tier: m.req.tier,
    ratio: m.req.ratio,
    take: m.req.takeIdx,
    status: scenes.every(s => s.status === 'done') ? 'ready' : allFramed && sinceApprove < 0 ? 'review' : 'running',
    scenes: t < 1500 ? [] : scenes,
    costUsd: estimateCostUsd(plan, m.req.tier) - (sinceApprove < 0 ? clipCost : 0),
    error: null,
    sheets: t < 1000 ? [] : [{label: `Nhân vật · ${m.order.recipient}`, url: IMAGES[0]}, {label: 'Bối cảnh 1', url: IMAGES[1]}],
    logline: 'Người con đi xa nhớ những buổi sáng bên mẹ, và quyết định về nhà đúng ngày sinh nhật mẹ.',
    timing: 'measured',
    clipCostUsd: clipCost,
  };
}

function mockMv(id: string): MvView {
  const m = mockMvs.get(id);
  if (!m) throw new Error('Không tìm thấy MV');
  return mockStory(id, m);
}

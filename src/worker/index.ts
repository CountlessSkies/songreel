import {Hono} from 'hono';
import type {Answers} from '../shared/catalog';
import type {MvMode, MvRatio} from '../shared/mv';
import {advanceMv, createMv, getMvRow, sweepMv, toMvView} from './mv';
import {advance, createOrder, getRow, sweep, toView, validateAnswers, type Env} from './pipeline';

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const app = new Hono<{Bindings: Env}>();

app.post('/api/orders', async c => {
  const pass = c.env.POC_PASSCODE;
  if (pass && c.req.header('X-Passcode')?.trim() !== pass) {
    return c.json({error: 'Mã truy cập không đúng.'}, 403);
  }
  const a = (await c.req.json().catch(() => null)) as Answers | null;
  if (!a) return c.json({error: 'Dữ liệu không hợp lệ.'}, 400);
  const err = validateAnswers(a);
  if (err) return c.json({error: err}, 400);
  try {
    const id = await createOrder(c.env, a);
    return c.json({id});
  } catch (e) {
    return c.json({error: e instanceof Error ? e.message : String(e)}, 400);
  }
});

app.get('/api/orders/:id', async c => {
  const id = c.req.param('id');
  // Chay buoc tiep theo ngay trong request (viet loi co the mat ~40s), cron lo don bi bo do
  await advance(c.env, id);
  const row = await getRow(c.env, id);
  if (!row) return c.json({error: 'Không tìm thấy đơn.'}, 404);
  return c.json(toView(row));
});

app.post('/api/mv', async c => {
  const pass = c.env.POC_PASSCODE;
  if (pass && c.req.header('X-Passcode')?.trim() !== pass) {
    return c.json({error: 'Mã truy cập không đúng.'}, 403);
  }
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({error: 'Dữ liệu không hợp lệ.'}, 400);
  const mode = String(form.get('mode')) as MvMode;
  const ratio = String(form.get('ratio')) as MvRatio;
  if (mode !== 'hybrid' && mode !== 'full') return c.json({error: 'Kiểu MV không hợp lệ.'}, 400);
  if (ratio !== '9:16' && ratio !== '16:9') return c.json({error: 'Khổ video không hợp lệ.'}, 400);
  const photos: {bytes: ArrayBuffer; type: string}[] = [];
  for (const f of form.getAll('photos')) {
    if (typeof f === 'string') continue;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return c.json({error: 'Ảnh phải là JPG, PNG hoặc WebP.'}, 400);
    if (f.size > MAX_PHOTO_BYTES) return c.json({error: 'Ảnh quá lớn.'}, 400);
    photos.push({bytes: await f.arrayBuffer(), type: f.type});
  }
  try {
    const id = await createMv(c.env, {
      orderId: String(form.get('orderId')),
      mode,
      ratio,
      take: Number(form.get('take')),
      duration: Number(form.get('duration')),
      photos,
    });
    return c.json({id});
  } catch (e) {
    return c.json({error: e instanceof Error ? e.message : String(e)}, 400);
  }
});

app.get('/api/mv/:id', async c => {
  const id = c.req.param('id');
  await advanceMv(c.env, id);
  const row = await getMvRow(c.env, id);
  if (!row) return c.json({error: 'Không tìm thấy MV.'}, 404);
  return c.json(toMvView(row));
});

const MEDIA_KINDS = new Set(['audio', 'cover', 'mvimg', 'mvclip']);

app.get('/api/media/:kind/:id/:n', async c => {
  const {kind, id, n} = c.req.param();
  if (!MEDIA_KINDS.has(kind)) return c.notFound();
  const {value, metadata} = await c.env.BLOBS.getWithMetadata<{contentType?: string}>(`${kind}/${id}/${n}`, 'arrayBuffer');
  if (!value) return c.notFound();
  const type = metadata?.contentType ?? 'application/octet-stream';
  const size = value.byteLength;
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=86400',
  };
  // Ho tro Range de trinh duyet tua nhac (nghe thu bat dau giua bai)
  const range = c.req.header('Range')?.match(/bytes=(\d*)-(\d*)/);
  if (range && (kind === 'audio' || kind === 'mvclip')) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${size}`}});
    return new Response(value.slice(start, end + 1), {
      status: 206,
      headers: {...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1)},
    });
  }
  return new Response(value, {headers: {...headers, 'Content-Length': String(size)}});
});

app.all('/api/*', c => c.json({error: 'Không có API này.'}, 404));

export default {
  fetch: app.fetch,
  scheduled: (_e: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(Promise.all([sweep(env), sweepMv(env)]));
  },
} satisfies ExportedHandler<Env>;

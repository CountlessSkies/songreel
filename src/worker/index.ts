import {Hono} from 'hono';
import type {Answers} from '../shared/catalog';
import {advance, createOrder, getRow, sweep, toView, validateAnswers, type Env} from './pipeline';

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

app.get('/api/media/:kind/:id/:n', async c => {
  const {kind, id, n} = c.req.param();
  if (kind !== 'audio' && kind !== 'cover') return c.notFound();
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
  if (range && kind === 'audio') {
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
    ctx.waitUntil(sweep(env));
  },
} satisfies ExportedHandler<Env>;

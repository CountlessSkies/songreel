// Xuong MV, dung theo ref/solsongs-v1.6.1.html: the "Nguyen lieu", "Phong chieu" (canvas + timeline) va storyboard.
// Chua co mvId: khach chon muc, khung hinh, anh roi bam "Dung MV". Co mvId: theo doi, xem va xuat MV.
// MV ke chuyen (Pro/Cinematic): dung o buoc storyboard ('review') cho khach xem tren nhac roi bam "Quay video".
// Ban ref con cho nhap loi, sua mo ta va tao lai tung canh; app chua co API do nen bo.
import {useEffect, useMemo, useRef, useState} from 'react';
import type {OrderView} from '../shared/catalog';
import {estimateCostUsd, MV_TIERS, planScenes, type MvRatio, type MvScene, type MvTier, type MvView} from '../shared/mv';
import {MOCK} from './api';
import {approveMv, getMv, type MvRequest} from './mvApi';
import {createMedia, drawFrame, mediaReady, pickMime, syncMedia, type Media} from './mvRender';
import {StudioShell} from './StudioShell';

const POLL_MS = 3000;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type PillState = 'wait' | 'run' | 'ok' | 'err';
const PILL_CLASS: Record<PillState, string> = {wait: '', run: ' run', ok: ' ok', err: ' err'};

/** Trang thai anh va clip cua 1 canh, suy ra tu status chung cua canh. */
function pills(s: MvScene): {image: PillState; clip: PillState | null} {
  const clip = s.kind === 'clip';
  if (s.status === 'failed') return {image: 'err', clip: clip ? 'err' : null};
  if (s.status === 'pending') return {image: 'wait', clip: clip ? 'wait' : null};
  if (s.status === 'image') return {image: 'run', clip: clip ? 'wait' : null};
  if (s.status === 'framed') return {image: 'ok', clip: clip ? 'wait' : null};
  if (s.status === 'clip') return {image: 'ok', clip: 'run'};
  return {image: 'ok', clip: clip ? 'ok' : null};
}

const IMAGE_TEXT: Record<PillState, string> = {wait: 'chờ', run: 'đang tạo', ok: 'xong', err: 'lỗi'};
const CLIP_TEXT: Record<PillState, string> = {wait: 'chờ', run: 'đang quay', ok: 'xong', err: 'lỗi'};

export function MvStudio(props: {
  order: OrderView;
  takeIdx: number;
  /** null: chua dung, dang chon nguyen lieu. */
  mvId: string | null;
  tier: MvTier;
  /** Khach da mua goi tao phim Amateur luc thanh toan. */
  hasFilm: boolean;
  onCreate: (req: MvRequest, tier: MvTier) => void;
  isCreating: boolean;
  createError: string | null;
  passcode: string;
  onPasscode: (v: string) => void;
  onBack: () => void;
  onHome: () => void;
}) {
  const {order, mvId, takeIdx, onBack, onHome} = props;
  const [mv, setMv] = useState<MvView | null>(null);
  const [tier, setTier] = useState<MvTier>(props.tier);
  const [pickRatio, setPickRatio] = useState<MvRatio>('9:16');
  const [photos, setPhotos] = useState<File[]>([]);
  const [hasConsent, setHasConsent] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    if (!mvId) {
      setMv(null);
      return;
    }
    let stop = false;
    const tick = async () => {
      try {
        const v = await getMv(mvId);
        if (stop) return;
        setMv(v);
        if (v.status === 'running') window.setTimeout(tick, POLL_MS);
      } catch {
        if (!stop) window.setTimeout(tick, POLL_MS * 2);
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [mvId, pollKey]);

  const approve = async () => {
    if (!mvId) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      setMv(await approveMv(mvId, props.passcode));
      setPollKey(k => k + 1);
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsApproving(false);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const media = useRef<Media>(createMedia());
  const graph = useRef<{ctx: AudioContext; dest: MediaStreamAudioDestinationNode} | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const [now, setNow] = useState(0);
  const [dur, setDur] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'loading' | 'recording'>('idle');
  const [download, setDownload] = useState<{url: string; name: string} | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const take = order.takes[mv?.take ?? takeIdx] ?? order.takes[0];
  const ratio: MvRatio = mv?.ratio ?? pickRatio;
  const isSetup = !mvId;
  // Truoc khi dung: hien cac canh du kien de khach xem truoc phu de tren bai
  const planned = useMemo<MvScene[]>(
    () =>
      planScenes(order.lyrics ?? [], dur || take.durationSec || 180, tier).map(p => ({
        ...p, imageUrl: null, clipUrl: null, status: 'pending' as const,
      })),
    [order.lyrics, dur, take.durationSec, tier],
  );
  const scenes = isSetup ? planned : (mv?.scenes ?? []);
  const isReady = mv?.status === 'ready';
  const isFailed = mv?.status === 'failed';
  const isReview = mv?.status === 'review';
  const [W, H] = ratio === '9:16' ? [720, 1280] : [1280, 720];
  const title = order.title ?? 'Bài hát';

  // Ve lien tuc theo thoi gian nhac
  const live = useRef({scenes, isPlaying, recipient: order.recipient, title: order.title ?? ''});
  live.current = {scenes, isPlaying, recipient: order.recipient, title: order.title ?? ''};
  useEffect(() => {
    syncMedia(media.current, scenes);
  }, [scenes]);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = canvasRef.current?.getContext('2d');
      const t = audioRef.current?.currentTime ?? 0;
      if (c) drawFrame(c, media.current, {...live.current, t});
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Am thanh di qua AudioContext de vua nghe vua ghi duoc vao video. Chi tao 1 lan cho moi the audio. */
  const ensureGraph = () => {
    if (graph.current || !audioRef.current) return graph.current;
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audioRef.current);
    const dest = ctx.createMediaStreamDestination();
    src.connect(ctx.destination);
    src.connect(dest);
    graph.current = {ctx, dest};
    return graph.current;
  };

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
      return;
    }
    await ensureGraph()?.ctx.resume();
    await el.play();
    setIsPlaying(true);
  };

  const seek = (t: number) => {
    if (audioRef.current && exportState === 'idle') audioRef.current.currentTime = t;
  };

  const exportVideo = async () => {
    const el = audioRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    setExportError(null);
    const mime = pickMime();
    if (!mime) {
      setExportError('Trình duyệt này không ghi được video. Thử Chrome hoặc Safari bản mới.');
      return;
    }
    // Cho tai het anh va clip
    setExportState('loading');
    for (let k = 0; k < 120 && !mediaReady(media.current, scenes); k++) await new Promise(r => setTimeout(r, 250));
    const g = ensureGraph()!;
    await g.ctx.resume();
    el.pause();
    el.currentTime = 0;
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...g.dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: 6_000_000});
    const chunks: Blob[] = [];
    rec.ondataavailable = e => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunks, {type: mime.split(';')[0]});
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      setDownload(prev => {
        if (prev) URL.revokeObjectURL(prev.url);
        return {url: URL.createObjectURL(blob), name: `${(order.title ?? 'solsongs').replace(/[\\/:*?"<>|]/g, '')} - MV.${ext}`};
      });
      setExportState('idle');
      setIsPlaying(false);
    };
    el.onended = () => {
      if (rec.state === 'recording') rec.stop();
      setIsPlaying(false);
    };
    recRef.current = rec;
    rec.start(1000);
    setExportState('recording');
    setIsPlaying(true);
    await el.play();
  };

  const cancelExport = () => {
    const rec = recRef.current;
    if (rec && rec.state === 'recording') {
      rec.onstop = () => setExportState('idle');
      rec.stop();
    }
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const total = dur || take.durationSec || 0;
  const isBusy = exportState !== 'idle';
  const done = scenes.filter(s => s.status === 'done').length;
  const framed = scenes.filter(s => s.status === 'framed' || s.status === 'clip' || s.status === 'done').length;
  const clips = scenes.filter(s => s.kind === 'clip');
  const clipSec = clips.reduce((sum, c) => sum + c.clipSec, 0);
  const current = scenes.find(s => now >= s.start && now < s.end)?.idx ?? -1;

  const status = isFailed
    ? 'Chưa dựng được MV.'
    : exportState === 'recording'
      ? `Đang ghi file MV: ${mmss(now)} / ${mmss(total)}. Giữ tab này mở đến khi xong.`
      : exportState === 'loading'
        ? 'Đang tải ảnh và clip của các cảnh…'
        : download
          ? 'File MV đã sẵn sàng.'
          : isReady
            ? `MV đã xong. Bấm ▶ để xem · ${mmss(now)} / ${mmss(total)}`
            : isSetup
              ? 'Chọn mức video rồi bấm “Dựng MV”. Bấm ▶ để nghe bài kèm phụ đề.'
              : isReview
                ? 'Storyboard đã xong. Bấm ▶ để xem các khung hình chạy trên nhạc.'
              : mv && !scenes.length
                ? 'Đang nghe bài để lấy mốc lời và viết kịch bản…'
              : mv
                ? `Đang dựng: ${done}/${scenes.length} cảnh. Có thể xem thử các cảnh đã xong.`
                : 'Đang tải MV…';

  const pickPhotos = (files: FileList | null) => {
    const ok = Array.from(files ?? []).filter(f => f.size <= MAX_PHOTO_BYTES).slice(0, MAX_PHOTOS);
    setPhotos(ok);
    if (!ok.length) setHasConsent(false);
  };
  const durationSec = dur || take.durationSec || 0;
  const canCreate =
    !!durationSec && (photos.length === 0 || hasConsent) && (MOCK || !!props.passcode.trim()) && !props.isCreating && !isBusy;
  const create = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
    props.onCreate({tier, ratio: pickRatio, takeIdx, durationSec, photos}, tier);
  };
  const priceOf = (k: MvTier) => (props.hasFilm && k === 'amateur' ? 'Đã có trong gói' : `+${vnd(MV_TIERS[k].price)}`);

  return (
    <StudioShell onHome={onHome} onBack={onBack} tab="mv" onSong={onBack}>
      <section className="step on" data-step="mv">
        <div className="mv-intro">
          <div>
            <p className="eyebrow">XƯỞNG MV</p>
            <h1>Mỗi bài hát,<br /><em>một câu chuyện có hình.</em></h1>
          </div>
          <p>{title} · tặng {order.recipient}</p>
        </div>

        <div className="bench">
          <section className="card" aria-labelledby="mvInTitle">
            <div className="card-head">
              <div>
                <p className="lab">NGUYÊN LIỆU</p>
                <h2 id="mvInTitle">Bài hát của bạn</h2>
              </div>
            </div>
            <div className="songrow">
              <div className="sr-txt">
                <small>BÀI HÁT</small>
                <b>{title}</b>
                <span>Bản {(mv?.take ?? takeIdx) + 1}{total ? ` · ${mmss(total)}` : ''}</span>
              </div>
              <button type="button" className="btn primary sm" disabled={isBusy} onClick={() => void toggle()}>
                {isPlaying ? '⏸ DỪNG' : isSetup ? '▶ NGHE THỬ' : '▶ XEM MV'}
              </button>
            </div>
            {isSetup && (
              <>
                <div className="upl">
                  <label htmlFor="mvPhotos">+ Nhập ảnh nhân vật</label>
                  <input type="file" id="mvPhotos" accept="image/jpeg,image/png,image/webp" multiple onChange={e => pickPhotos(e.target.files)} />
                  <span>{photos.length ? photos.map(f => f.name).join(', ') : `Chưa có ảnh, AI tự tạo nhân vật. Tối đa ${MAX_PHOTOS} ảnh rõ mặt, dưới 10MB.`}</span>
                </div>
                {photos.length > 0 && (
                  <label className="consent">
                    <input type="checkbox" checked={hasConsent} onChange={e => setHasConsent(e.target.checked)} />
                    <span>Tôi có quyền dùng các ảnh này và người trong ảnh đồng ý để AI dựng hình từ ảnh.</span>
                  </label>
                )}
                <div className="f">
                  <label htmlFor="mvRatio">Khung hình</label>
                  <select id="mvRatio" value={pickRatio} onChange={e => setPickRatio(e.target.value as MvRatio)}>
                    <option value="9:16">Dọc 9:16 (TikTok, Reels)</option>
                    <option value="16:9">Ngang 16:9 (YouTube)</option>
                  </select>
                </div>
                <div className="f">
                  <label>Chất lượng video <small>chọn một mức</small></label>
                  <div className="tiers" role="radiogroup" aria-label="Chất lượng video">
                    {(Object.keys(MV_TIERS) as MvTier[]).map(k => (
                      <label key={k} className={k === tier ? 'tier on' : 'tier'}>
                        <input type="radio" name="mvTier" checked={k === tier} onChange={() => setTier(k)} />
                        <span><b>{MV_TIERS[k].label}</b><span className="tm">{MV_TIERS[k].description}</span></span>
                        <span className={props.hasFilm && k === 'amateur' ? 'pr inc' : 'pr'}>{priceOf(k)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="est">
                  <b>{planned.length} cảnh</b>, {planned.filter(s => s.kind === 'clip').length} clip · chi phí AI ước tính ~$
                  {estimateCostUsd(planned, tier).toFixed(2)} · storyboard khoảng 5 phút, duyệt xong mới quay video
                </div>
                {!MOCK && (
                  <div className="f">
                    <label htmlFor="mvPass">Mã truy cập bản chạy thử</label>
                    <input id="mvPass" type="password" value={props.passcode} onChange={e => props.onPasscode(e.target.value)} autoComplete="off" />
                  </div>
                )}
                {props.createError && <p className="err" role="alert">{props.createError}</p>}
              </>
            )}
            {mv && (
              <>
                <dl className="facts">
                  <dt>Mức video</dt>
                  <dd>{mv.tier ? MV_TIERS[mv.tier].label : 'MV bản cũ'}</dd>
                  <dt>Khung hình</dt>
                  <dd>{mv.ratio === '9:16' ? 'Dọc 9:16' : 'Ngang 16:9'}</dd>
                  <dt>Số cảnh</dt>
                  <dd>{scenes.length} cảnh · {clips.length} clip ({clipSec}s) · {scenes.length - clips.length} ảnh</dd>
                  <dt>Chi phí AI</dt>
                  <dd>~${mv.costUsd.toFixed(2)}</dd>
                  {mv.timing && (
                    <>
                      <dt>Mốc lời</dt>
                      <dd>{mv.timing === 'measured' ? 'Đo từ giọng hát' : 'Ước lượng'}</dd>
                    </>
                  )}
                </dl>
                <div
                  className="mv-prog"
                  role="progressbar"
                  aria-label="Tiến độ dựng MV"
                  aria-valuemin={0}
                  aria-valuemax={scenes.length}
                  aria-valuenow={done}>
                  <i style={{width: `${scenes.length ? (done / scenes.length) * 100 : 0}%`}} />
                </div>
                <div className="est">
                  {isReady ? (
                    <b>MV đã xong</b>
                  ) : isFailed ? (
                    <span className="w">Dựng MV bị dừng</span>
                  ) : isReview ? (
                    <b>Storyboard xong, chờ bạn duyệt</b>
                  ) : mv.mode === 'story' && !scenes.length ? (
                    <>Đang lấy mốc lời và viết kịch bản…</>
                  ) : mv.mode === 'story' && framed < scenes.length && !done ? (
                    <>Đang vẽ khung hình <b>{framed}/{scenes.length || '…'}</b> cảnh</>
                  ) : (
                    <>Đang dựng <b>{done}/{scenes.length}</b> cảnh</>
                  )}
                </div>
                {isReview && (
                  <div className="review">
                    <p>
                      Xem từng cảnh bên dưới và bấm ▶ ở phòng chiếu để xem storyboard chạy trên nhạc. Ưng rồi thì quay video cho cả{' '}
                      {scenes.length} cảnh, chi phí AI thêm khoảng <b>${(mv.clipCostUsd ?? 0).toFixed(2)}</b>, mất khoảng 10 đến 20 phút.
                    </p>
                    {!MOCK && (
                      <div className="f">
                        <label htmlFor="mvPass2">Mã truy cập bản chạy thử</label>
                        <input id="mvPass2" type="password" value={props.passcode} onChange={e => props.onPasscode(e.target.value)} autoComplete="off" />
                      </div>
                    )}
                    <button className="btn primary wide" disabled={isApproving || (!MOCK && !props.passcode.trim())} onClick={() => void approve()}>
                      {isApproving ? 'Đang gửi…' : '🎬 Duyệt và quay video'}
                    </button>
                    {approveError && <p className="err" role="alert">{approveError}</p>}
                  </div>
                )}
              </>
            )}
            {isFailed && <p className="err" role="alert">{mv?.error ?? 'Lỗi không xác định.'}</p>}
            <div className="actions">
              {isSetup && (
                <button className="btn primary grow" disabled={!canCreate} onClick={create}>
                  {props.isCreating ? 'Đang gửi…' : '▶ Dựng MV'}
                </button>
              )}
              {exportState === 'recording' ? (
                <button className="btn outline wide" onClick={cancelExport}>⏹ Huỷ xuất ({mmss(now)} / {mmss(total)})</button>
              ) : (
                <button className={isSetup ? 'btn outline' : 'btn primary wide'} disabled={!isReady || isBusy} onClick={() => void exportVideo()}>
                  {exportState === 'loading' ? 'Đang tải cảnh…' : 'Tạo file MV ↓'}
                </button>
              )}
            </div>
            {exportError && <p className="err" role="alert">{exportError}</p>}
            <p className="note">
              Phụ đề và nhạc được ghép ngay trong trình duyệt, chạy theo thời gian thật của bài{total ? ` (khoảng ${mmss(total)})` : ''}. Giữ tab mở đến khi xong.
            </p>
          </section>

          <section className="monitor" aria-labelledby="mvOutTitle">
            <div className="card-head">
              <div>
                <p className="lab">PHÒNG CHIẾU</p>
                <h2 id="mvOutTitle">{title}</h2>
              </div>
              <span className="ratio">{ratio}</span>
            </div>
            <div className={`stage${ratio === '16:9' ? ' wide' : ''}`}>
              <canvas ref={canvasRef} width={W} height={H} aria-label="Khung xem trước MV" />
              <button className="transport" aria-label={isPlaying ? 'Dừng MV' : 'Phát MV'} disabled={isBusy} onClick={() => void toggle()}>
                {isPlaying ? '⏸' : '▶'}
              </button>
            </div>
            <audio
              ref={audioRef}
              src={take.audioUrl}
              preload="auto"
              onLoadedMetadata={e => setDur(e.currentTarget.duration)}
              onEnded={() => setIsPlaying(false)}
            />
            <div className="timeline" aria-label="Các cảnh của MV">
              {scenes.map(s => (
                <button
                  key={s.idx}
                  title={`Cảnh ${s.idx + 1} · ${mmss(s.start)}`}
                  aria-label={`Tới cảnh ${s.idx + 1}`}
                  aria-current={s.idx === current ? 'true' : undefined}
                  disabled={isBusy}
                  style={s.imageUrl ? {backgroundImage: `url(${s.imageUrl})`} : undefined}
                  onClick={() => seek(s.start)}>
                  <span>{s.idx + 1}</span>
                </button>
              ))}
            </div>
            <div className="mstatus" aria-live="polite">{status}</div>
            {download && !isBusy && (
              <div className="mout">
                <video src={download.url} controls playsInline />
                <a className="btn outline sm" href={download.url} download={download.name}>Tải MV ↓</a>
              </div>
            )}
          </section>
        </div>

        <div className="board-head">
          <div>
            <p className="lab">KỊCH BẢN HÌNH</p>
            <h2>Storyboard</h2>
          </div>
          <span className="note">
            {isSetup
              ? 'Cảnh dự kiến. Khi dựng, cảnh được chia lại theo mốc lời đo từ giọng hát.'
              : mv?.mode === 'story'
                ? 'Mỗi cảnh có khung đầu và khung cuối; video quay từ khung đầu tới khung cuối.'
                : 'Mỗi câu hát một cảnh. Ảnh và clip gốc tải riêng ở từng cảnh.'}
          </span>
        </div>
        {mv?.logline && (
          <p className="logline"><b>Câu chuyện:</b> {mv.logline}</p>
        )}
        <div className="board">
          {(mv?.sheets ?? []).map(sh => (
            <article className="scene sheet" key={sh.url}>
              <div className="thumb">
                <span className="num">{sh.label}</span>
                <img src={sh.url} alt={sh.label} />
              </div>
              <div className="body">
                <div className="ly">Ảnh tham chiếu dùng cho mọi cảnh</div>
                <div className="row"><a className="btn outline sm" href={sh.url} download>⬇ Ảnh</a></div>
              </div>
            </article>
          ))}
          {scenes.map(s => {
            const p = pills(s);
            return (
              <article className="scene" key={s.idx}>
                <div className="thumb">
                  <span className="num">Cảnh {s.idx + 1} · {mmss(s.start)}–{mmss(s.end)}</span>
                  {s.clipUrl && s.status === 'done' ? (
                    <video src={s.clipUrl} poster={s.imageUrl ?? undefined} muted loop playsInline preload="metadata" />
                  ) : (
                    s.imageUrl && <img src={s.imageUrl} alt="" />
                  )}
                </div>
                <div className="body">
                  <div className="ly">
                    {s.lines.length ? s.lines.map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>) : <i>{s.section}</i>}
                  </div>
                  {s.action && <div className="act">{s.action}</div>}
                  {s.endImageUrl && s.status !== 'done' && (
                    <a className="endframe" href={s.endImageUrl} target="_blank" rel="noreferrer" title="Khung cuối của cảnh">
                      <img src={s.endImageUrl} alt="Khung cuối" />
                      <span>Khung cuối</span>
                    </a>
                  )}
                  <div className="meta">
                    <span className={`s-pill${PILL_CLASS[p.image]}`}>Ảnh: {IMAGE_TEXT[p.image]}</span>
                    {p.clip && (
                      <span className={`s-pill${PILL_CLASS[p.clip]}`}>
                        Clip: {p.clip === 'ok' ? `${s.clipSec}s` : CLIP_TEXT[p.clip]}
                      </span>
                    )}
                  </div>
                  <div className="row">
                    {s.imageUrl && <a className="btn outline sm" href={s.imageUrl} download={`canh-${s.idx + 1}.jpg`}>⬇ Ảnh</a>}
                    {s.clipUrl && s.status === 'done' && <a className="btn outline sm" href={s.clipUrl} download={`canh-${s.idx + 1}.mp4`}>⬇ Clip gốc</a>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <p className="r-again"><button className="btn ghost" onClick={onBack}>← Quay lại bài hát</button></p>
      </section>
    </StudioShell>
  );
}

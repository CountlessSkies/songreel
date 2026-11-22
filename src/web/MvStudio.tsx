// Xuong MV, dung theo ref/solsongs-v1.6.1.html: the "Nguyen lieu", "Phong chieu" (canvas + timeline) va storyboard.
// Ban ref cho nhap loi, sua mo ta va tao lai tung canh; app chua co API do nen man nay chi theo doi, xem va xuat MV.
import {useEffect, useRef, useState} from 'react';
import type {OrderView} from '../shared/catalog';
import {MV_MODES, type MvRatio, type MvScene, type MvView} from '../shared/mv';
import {getMv} from './mvApi';
import {createMedia, drawFrame, mediaReady, pickMime, syncMedia, type Media} from './mvRender';
import {StudioShell} from './StudioShell';

const POLL_MS = 3000;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type PillState = 'wait' | 'run' | 'ok' | 'err';
const PILL_CLASS: Record<PillState, string> = {wait: '', run: ' run', ok: ' ok', err: ' err'};

/** Trang thai anh va clip cua 1 canh, suy ra tu status chung cua canh. */
function pills(s: MvScene): {image: PillState; clip: PillState | null} {
  const clip = s.kind === 'clip';
  if (s.status === 'failed') return {image: 'err', clip: clip ? 'err' : null};
  if (s.status === 'pending') return {image: 'wait', clip: clip ? 'wait' : null};
  if (s.status === 'image') return {image: 'run', clip: clip ? 'wait' : null};
  if (s.status === 'clip') return {image: 'ok', clip: 'run'};
  return {image: 'ok', clip: clip ? 'ok' : null};
}

const IMAGE_TEXT: Record<PillState, string> = {wait: 'chờ', run: 'đang tạo', ok: 'xong', err: 'lỗi'};
const CLIP_TEXT: Record<PillState, string> = {wait: 'chờ', run: 'đang quay', ok: 'xong', err: 'lỗi'};

export function MvStudio({order, mvId, takeIdx, onBack, onHome}: {
  order: OrderView;
  mvId: string;
  takeIdx: number;
  onBack: () => void;
  onHome: () => void;
}) {
  const [mv, setMv] = useState<MvView | null>(null);

  useEffect(() => {
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
  }, [mvId]);

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
  const ratio: MvRatio = mv?.ratio ?? '9:16';
  const scenes = mv?.scenes ?? [];
  const isReady = mv?.status === 'ready';
  const isFailed = mv?.status === 'failed';
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
            : mv
              ? `Đang dựng: ${done}/${scenes.length} cảnh. Có thể xem thử các cảnh đã xong.`
              : 'Đang tải MV…';

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
                {isPlaying ? '⏸ DỪNG' : '▶ XEM MV'}
              </button>
            </div>
            {mv && (
              <>
                <dl className="facts">
                  <dt>Kiểu MV</dt>
                  <dd>{MV_MODES[mv.mode].label}</dd>
                  <dt>Khung hình</dt>
                  <dd>{mv.ratio === '9:16' ? 'Dọc 9:16' : 'Ngang 16:9'}</dd>
                  <dt>Số cảnh</dt>
                  <dd>{scenes.length} cảnh · {clips.length} clip ({clipSec}s) · {scenes.length - clips.length} ảnh</dd>
                  <dt>Chi phí AI</dt>
                  <dd>~${mv.costUsd.toFixed(2)}</dd>
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
                  {isReady ? <b>MV đã xong</b> : isFailed ? <span className="w">Dựng MV bị dừng</span> : <>Đang dựng <b>{done}/{scenes.length}</b> cảnh</>}
                </div>
              </>
            )}
            {isFailed && <p className="err" role="alert">{mv?.error ?? 'Lỗi không xác định.'}</p>}
            <div className="actions">
              {exportState === 'recording' ? (
                <button className="btn outline wide" onClick={cancelExport}>⏹ Huỷ xuất ({mmss(now)} / {mmss(total)})</button>
              ) : (
                <button className="btn primary wide" disabled={!isReady || isBusy} onClick={() => void exportVideo()}>
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
          <span className="note">Mỗi câu hát một cảnh. Ảnh và clip gốc tải riêng ở từng cảnh.</span>
        </div>
        <div className="board">
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

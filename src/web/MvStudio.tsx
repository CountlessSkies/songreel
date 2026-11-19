import {useEffect, useRef, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import type {OrderView} from '../shared/catalog';
import {MV_MODES, type MvRatio, type MvScene, type MvView} from '../shared/mv';
import {getMv} from './mvApi';
import {createMedia, drawFrame, mediaReady, pickMime, syncMedia, type Media} from './mvRender';

const POLL_MS = 3000;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const STATUS: Record<MvScene['status'], string> = {
  pending: '⏳ Chờ',
  image: '🖼️ Đang vẽ',
  clip: '🎬 Đang quay',
  done: '✅ Xong',
  failed: '⚠️ Lỗi',
};

export function MvStudio({order, mvId, takeIdx, onBack}: {order: OrderView; mvId: string; takeIdx: number; onBack: () => void}) {
  const isNarrow = useMediaQuery('(max-width: 860px)');
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

  const done = mv?.scenes.filter(s => s.status === 'done').length ?? 0;
  const total = mv?.scenes.length ?? 0;
  const clips = mv?.scenes.filter(s => s.kind === 'clip') ?? [];

  return (
    <Layout
      height="fill"
      contentWidth={1120}
      padding={isNarrow ? 4 : 5}
      content={
        <LayoutContent>
          <VStack gap={5}>
            <div className="hero">
              <div className="hero-notes" aria-hidden="true"><span>🎬</span><span>🎞️</span><span>✨</span></div>
              <div className="hero-logo">SolSongs</div>
              <div className="hero-sub">
                Xưởng MV · {order.title ?? 'Bài hát'} · tặng {order.recipient}
              </div>
            </div>

            {mv && (
              <Card padding={4}>
                <VStack gap={2}>
                  <HStack gap={3} vAlign="center" hAlign="between">
                    <Text type="label">
                      {mv.status === 'ready' ? '🎉 MV đã xong' : `Đang dựng MV: ${done}/${total} cảnh`}
                    </Text>
                    <Text type="supporting" color="secondary">
                      {MV_MODES[mv.mode].label} · {mv.ratio} · {clips.length} clip ({clips.reduce((s, c) => s + c.clipSec, 0)}s) ·{' '}
                      {total - clips.length} ảnh · chi phí AI ~${mv.costUsd.toFixed(2)}
                    </Text>
                  </HStack>
                  <ProgressBar label="Tiến độ dựng MV" isLabelHidden value={total ? (done / total) * 100 : 0} />
                </VStack>
              </Card>
            )}

            {mv?.status === 'failed' && (
              <Banner status="error" title="Chưa dựng được MV" collapsible={false}>
                <Text type="supporting">{mv.error ?? 'Lỗi không xác định.'}</Text>
              </Banner>
            )}

            <Grid columns={isNarrow ? 1 : 2} gap={5}>
              <Preview order={order} mv={mv} takeIdx={mv?.take ?? takeIdx} />
              <Card padding={4}>
                <VStack gap={3}>
                  <Heading level={3}>🎞️ Kịch bản cảnh</Heading>
                  <List hasDividers density="compact" edge="outset">
                    {(mv?.scenes ?? []).map(s => (
                      <ListItem
                        key={s.idx}
                        startContent={
                          s.imageUrl ? (
                            <img className="mv-thumb" src={s.imageUrl} alt="" />
                          ) : (
                            <span className="mv-thumb is-empty" aria-hidden="true" />
                          )
                        }
                        label={s.lines.length ? s.lines.join(' / ') : s.section}
                        description={`Cảnh ${s.idx + 1} · ${mmss(s.start)}–${mmss(s.end)} · ${
                          s.kind === 'clip' ? `🎬 Clip ${s.clipSec}s` : '🖼️ Ảnh'
                        } · ${s.section}`}
                        endContent={<Text type="supporting">{STATUS[s.status]}</Text>}
                      />
                    ))}
                  </List>
                </VStack>
              </Card>
            </Grid>

            <HStack hAlign="center">
              <Button label="← Quay lại bài hát" variant="ghost" onClick={onBack} />
            </HStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}

/** Xem truoc va xuat MV ngay tren trinh duyet. Canvas ve bang mvRender nen ban xuat giong het ban xem. */
function Preview({order, mv, takeIdx}: {order: OrderView; mv: MvView | null; takeIdx: number}) {
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
  const take = order.takes[takeIdx];
  const ratio: MvRatio = mv?.ratio ?? '9:16';
  const scenes = mv?.scenes ?? [];
  const ready = mv?.status === 'ready';
  const [W, H] = ratio === '9:16' ? [720, 1280] : [1280, 720];

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

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Heading level={3}>📱 Xem trước</Heading>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className={ratio === '9:16' ? 'mv-frame is-portrait' : 'mv-frame is-landscape'}
          aria-label="Khung xem trước MV"
        />
        <audio
          ref={audioRef}
          src={take.audioUrl}
          preload="auto"
          onLoadedMetadata={e => setDur(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
        />
        <HStack gap={3} vAlign="center">
          <Button label={isPlaying ? '⏸ Dừng' : '▶ Xem MV'} variant="primary" isDisabled={isBusy} onClick={() => void toggle()} />
          <StackItem size="fill">
            <ProgressBar label="Thời gian" isLabelHidden value={now} max={total || 1} />
          </StackItem>
          <Text type="supporting" color="secondary">
            {mmss(now)} / {mmss(total)}
          </Text>
        </HStack>
        {exportState === 'recording' ? (
          <Button label={`⏹ Huỷ xuất (${mmss(now)} / ${mmss(total)})`} variant="secondary" width="100%" onClick={cancelExport} />
        ) : (
          <Button
            label={exportState === 'loading' ? 'Đang tải cảnh…' : '⬇ Xuất video'}
            variant="secondary"
            width="100%"
            isDisabled={!ready || isBusy}
            isLoading={exportState === 'loading'}
            onClick={() => void exportVideo()}
          />
        )}
        {download && !isBusy && (
          <Button
            label={`💾 Lưu ${download.name}`}
            variant="primary"
            width="100%"
            onClick={() => {
              const a = document.createElement('a');
              a.href = download.url;
              a.download = download.name;
              a.click();
            }}
          />
        )}
        {exportError && (
          <Banner status="error" title="Không xuất được video" collapsible={false}>
            <Text type="supporting">{exportError}</Text>
          </Banner>
        )}
        <Text type="supporting" color="secondary">
          Video ghép ngay trên máy bạn, chạy theo thời gian thật của bài (khoảng {mmss(total)}). Giữ tab mở đến khi xong.
        </Text>
      </VStack>
    </Card>
  );
}

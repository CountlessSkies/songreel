import {useEffect, useMemo, useRef, useState} from 'react';
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

const POLL_MS = 1500;
const TITLE_SEC = 3;

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
              <Preview order={order} mv={mv} takeIdx={takeIdx} />
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

/** Xem truoc MV ngay tren trinh duyet: anh/clip theo moc thoi gian, chu karaoke, the tieu de dau bai. */
function Preview({order, mv, takeIdx}: {order: OrderView; mv: MvView | null; takeIdx: number}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [now, setNow] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const take = order.takes[takeIdx];
  const ratio: MvRatio = mv?.ratio ?? '9:16';
  const scenes = mv?.scenes ?? [];
  const ready = mv?.status === 'ready';

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = audioRef.current;
      if (el) setNow(el.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cur = useMemo(() => scenes.find(s => now >= s.start && now < s.end) ?? scenes[0], [scenes, now]);
  const line = useMemo(() => {
    if (!cur || !cur.lines.length) return null;
    const per = (cur.end - cur.start) / cur.lines.length;
    return cur.lines[Math.min(cur.lines.length - 1, Math.floor((now - cur.start) / per))];
  }, [cur, now]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) el.pause();
    else void el.play();
    setIsPlaying(!isPlaying);
  };

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Heading level={3}>📱 Xem trước</Heading>
        <div className={ratio === '9:16' ? 'mv-frame is-portrait' : 'mv-frame is-landscape'}>
          {scenes.map(s => {
            const on = s === cur;
            const clipOn = on && !!s.clipUrl && s.status === 'done' && now - s.start < s.clipSec;
            if (s.clipUrl && s.status === 'done' && s.clipSec >= s.end - s.start - 0.5)
              return <SceneClip key={s.idx} src={s.clipUrl} isOn={on} isPlaying={isPlaying} />;
            if (s.clipUrl && s.status === 'done')
              return (
                <span key={s.idx}>
                  <SceneClip src={s.clipUrl} isOn={clipOn} isPlaying={isPlaying} />
                  {s.imageUrl && <img className={on && !clipOn ? 'mv-layer is-on kenburns' : 'mv-layer'} src={s.imageUrl} alt="" />}
                </span>
              );
            if (s.imageUrl)
              return <img key={s.idx} className={on ? 'mv-layer is-on kenburns' : 'mv-layer'} src={s.imageUrl} alt="" />;
            return null;
          })}
          {!cur?.imageUrl && <div className="mv-layer is-on mv-wait">Đang vẽ cảnh…</div>}
          {now < TITLE_SEC && (
            <div className="mv-title">
              <div className="mv-title-small">Dành tặng</div>
              <div className="mv-title-name">{order.recipient}</div>
              <div className="mv-title-song">{order.title}</div>
            </div>
          )}
          {line && <div className="mv-sub" key={line}>{line}</div>}
        </div>
        <audio ref={audioRef} src={take.audioUrl} preload="metadata" onEnded={() => setIsPlaying(false)} />
        <HStack gap={3} vAlign="center">
          <Button label={isPlaying ? '⏸ Dừng' : '▶ Xem MV'} variant="primary" onClick={toggle} />
          <StackItem size="fill">
            <ProgressBar label="Thời gian" isLabelHidden value={now} max={take.durationSec ?? 1} />
          </StackItem>
          <Text type="supporting" color="secondary">
            {mmss(now)} / {mmss(take.durationSec ?? 0)}
          </Text>
        </HStack>
        <Button
          label="⬇ Xuất video MP4"
          variant="secondary"
          width="100%"
          isDisabled={!ready}
          onClick={() => alert('Mockup: xuất video ghép trên trình duyệt (canvas + MediaRecorder) sẽ làm sau khi duyệt giao diện.')}
        />
        <Text type="supporting" color="secondary">
          Video ghép ngay trên máy bạn, không cần chờ server.
        </Text>
      </VStack>
    </Card>
  );
}

function SceneClip({src, isOn, isPlaying}: {src: string; isOn: boolean; isPlaying: boolean}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOn && isPlaying) void el.play().catch(() => {});
    else el.pause();
    if (!isOn) el.currentTime = 0;
  }, [isOn, isPlaying]);
  return <video ref={ref} className={isOn ? 'mv-layer is-on' : 'mv-layer'} src={src} muted loop playsInline preload="auto" />;
}

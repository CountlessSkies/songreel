import {useEffect, useRef, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {Divider} from '@astryxdesign/core/Divider';
import {Grid} from '@astryxdesign/core/Grid';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {WRITERS, type OrderView} from '../shared/catalog';

const PREVIEW_SEC = 40;
const FADE_SEC = 2;
const BASE_PRICE = 149_000;
const ADDONS = [
  {id: 'video', label: 'Video lời bài hát', price: 99_000, description: 'Video dọc 9:16 chạy lời theo nhạc, đăng story được.'},
  {id: 'acoustic', label: 'Bản acoustic', price: 49_000, description: 'Thêm một bản mộc chỉ guitar và giọng hát.'},
];

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Diem bat dau nghe thu. Chua co moc dieu khuc tu Suno nen lay khoang 1/4 bai. */
const previewStart = (dur: number) => Math.max(0, Math.min(dur * 0.25, dur - PREVIEW_SEC));

export function Result({order, onNew}: {order: OrderView; onNew: () => void}) {
  const isNarrow = useMediaQuery('(max-width: 800px)');
  const [takeIdx, setTakeIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [addons, setAddons] = useState<string[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const take = order.takes[takeIdx];
  const total = BASE_PRICE + ADDONS.filter(x => addons.includes(x.id)).reduce((s, x) => s + x.price, 0);

  // Doi ban thi dung phat va tua ve dau doan nghe thu
  useEffect(() => {
    setIsPlaying(false);
    setElapsed(0);
  }, [takeIdx]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || isUnlocked) return;
    const onTime = () => {
      const start = previewStart(el.duration || 0);
      const t = el.currentTime - start;
      setElapsed(Math.max(0, t));
      const fadeIn = Math.min(1, t / FADE_SEC);
      const fadeOut = Math.min(1, (PREVIEW_SEC - t) / FADE_SEC);
      el.volume = Math.max(0, Math.min(fadeIn, fadeOut, 1));
      if (t >= PREVIEW_SEC) {
        el.pause();
        el.currentTime = start;
        setElapsed(0);
        setIsPlaying(false);
      }
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [isUnlocked, takeIdx]);

  const togglePreview = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
      return;
    }
    const start = previewStart(el.duration || 0);
    if (el.currentTime < start || el.currentTime >= start + PREVIEW_SEC) el.currentTime = start;
    el.volume = 0;
    void el.play();
    setIsPlaying(true);
  };

  const pay = () => {
    setIsPaying(true);
    audioRef.current?.pause();
    setIsPlaying(false);
    window.setTimeout(() => {
      setIsPaying(false);
      setIsUnlocked(true);
    }, 900);
  };

  // Khi chua mo khoa: chi hien ro tu dau den het dieu khuc dau tien
  const firstChorus = order.lyrics?.findIndex(s => s.kind === 'chorus') ?? -1;

  const player = (
    <Card padding={5}>
      <VStack gap={4}>
        <HStack gap={3} vAlign="center" hAlign="between">
          <div className="chips">
          <ToggleButtonGroup
            label="Chọn bản"
            type="single"
            value={String(takeIdx)}
            onChange={v => v != null && setTakeIdx(Number(v))}>
            {order.takes.map((_, i) => (
              <ToggleButton key={i} value={String(i)} label={`🎧 Bản ${i + 1}`} />
            ))}
          </ToggleButtonGroup>
          </div>
          {takeIdx === 0 && <Badge variant="success" label="⭐ Gợi ý" />}
        </HStack>

        {take.coverUrl && <img className={isPlaying ? 'cover is-playing' : 'cover'} src={take.coverUrl} alt={`Ảnh bìa bản ${takeIdx + 1}`} />}

        <VStack gap={1}>
          <Heading level={2}>{order.title ?? 'Bài hát của bạn'}</Heading>
          <Text type="supporting" color="secondary">
            Tặng {order.recipient}
            {take.durationSec ? ` · ${mmss(take.durationSec)}` : ''}
          </Text>
        </VStack>

        {isUnlocked ? (
          <VStack gap={3}>
            <audio key={take.audioUrl} src={take.audioUrl} controls style={{width: '100%'}} />
            <HStack gap={2}>
              {order.takes.map((t, i) => (
                <Button key={i} label={`⬇ Tải bản ${i + 1}`} variant="secondary" href={t.audioUrl} target="_blank" />
              ))}
            </HStack>
          </VStack>
        ) : (
          <VStack gap={2}>
            <audio key={take.audioUrl} ref={audioRef} src={take.audioUrl} preload="metadata" />
            <HStack gap={3} vAlign="center">
              <Button label={isPlaying ? '⏸ Tạm dừng' : '▶ Nghe thử 40 giây'} variant="primary" onClick={togglePreview} />
              <StackItem size="fill">
                <ProgressBar label="Tiến độ nghe thử" isLabelHidden value={elapsed} max={PREVIEW_SEC} />
              </StackItem>
              <Text type="supporting" color="secondary">
                {mmss(elapsed)} / {mmss(PREVIEW_SEC)}
              </Text>
            </HStack>
          </VStack>
        )}
      </VStack>
    </Card>
  );

  const lyrics = (
    <Card padding={5} variant="pink">
      <VStack gap={4}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <Heading level={3}>📝 Lời bài hát</Heading>
          {order.critic && <Badge variant={order.critic.issues.length ? 'warning' : 'success'} label={`Chấm ${order.critic.score}/100`} />}
        </HStack>
        <Text type="supporting" color="secondary">
          ✍️ {WRITERS[order.writer].label} · {order.round} lần viết
          {order.critic && order.critic.issues.length + order.critic.notes.length > 0
            ? ` · ${[...order.critic.issues, ...order.critic.notes].join('; ')}`
            : ''}
        </Text>
        {order.lyrics?.map((sec, si) => {
          const locked = !isUnlocked && firstChorus >= 0 && si > firstChorus;
          return (
            <VStack key={si} gap={1}>
              <Text type="label" color="secondary">{sec.name}</Text>
              <div className={locked ? 'lyrics-locked' : undefined} aria-hidden={locked || undefined}>
                {sec.lines.map((l, li) => (
                  <p key={li} className={sec.kind === 'chorus' ? 'lyrics-line lyrics-chorus' : 'lyrics-line'}>
                    <Text type="body">{l}</Text>
                  </p>
                ))}
              </div>
            </VStack>
          );
        })}
      </VStack>
    </Card>
  );

  const paywall = isUnlocked ? (
    <Banner status="success" title="🎉 Đã mở khoá bản đầy đủ" collapsible={false}>
      <Text type="supporting">Thanh toán giả lập. Bản thật sẽ gửi email kèm link nghe riêng.</Text>
    </Banner>
  ) : (
    <Card padding={5} variant="yellow">
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={3}>🎁 Nhận bản đầy đủ</Heading>
          <Text type="supporting" color="secondary">
            Cả 2 bản, file mp3 chất lượng cao, lời bài hát và trang nghe riêng để gửi tặng.
          </Text>
        </VStack>
        <CheckboxList label="Thêm" value={addons} onChange={setAddons}>
          {ADDONS.map(x => (
            <CheckboxListItem key={x.id} value={x.id} label={`${x.label} +${vnd(x.price)}`} description={x.description} />
          ))}
        </CheckboxList>
        <Divider />
        <HStack gap={3} vAlign="center" hAlign="between">
          <Text type="label">Tổng</Text>
          <span className="price">{vnd(total)}</span>
        </HStack>
        <Button label="💳 Thanh toán (giả lập)" variant="primary" width="100%" isLoading={isPaying} onClick={pay} />
      </VStack>
    </Card>
  );

  return (
    <Layout
      height="fill"
      contentWidth={1040}
      padding={isNarrow ? 4 : 5}
      content={
        <LayoutContent>
          <VStack gap={5}>
            <HStack gap={3} vAlign="center" hAlign="between">
              <StackItem size="fill">
                <div className="hero">
                  <div className="hero-notes" aria-hidden="true"><span>🎉</span><span>🎵</span><span>🎁</span></div>
                  <div className="hero-logo">SongReel</div>
                  <div className="hero-sub">Bài hát cho {order.recipient} đã sẵn sàng!</div>
                </div>
              </StackItem>
            </HStack>
            <Grid columns={isNarrow ? 1 : 2} gap={5}>
              <VStack gap={5}>
                {player}
                {paywall}
              </VStack>
              {lyrics}
            </Grid>
            <HStack hAlign="center">
              <Button label="🎵 Tạo bài hát khác" variant="ghost" onClick={onNew} />
            </HStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}

import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {VStack} from '@astryxdesign/core/Stack';
import {Step, Stepper} from '@astryxdesign/core/Stepper';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {AGENTS, WRITERS, type OrderView} from '../shared/catalog';

export function Waiting({order, onRetry}: {order: OrderView | null; onRetry: () => void}) {
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const active = order ? AGENTS.findIndex(a => a.key === order.stage) : 0;
  const failed = order?.status === 'failed';

  return (
    <Layout
      height="fill"
      contentWidth={560}
      padding={isNarrow ? 4 : 5}
      content={
        <LayoutContent>
          <VStack gap={5}>
            <div className="hero">
              <div className="hero-logo">SolSongs</div>
              <div className="vinyl-wrap">
                <div className={failed ? 'vinyl is-stopped' : 'vinyl'} aria-hidden="true" />
              </div>
              <VStack gap={1} hAlign="center">
                <Heading level={1}>
                  {failed ? 'Chưa tạo được bài hát 😢' : `Đang sáng tác cho ${order?.recipient ?? '…'} 🎶`}
                </Heading>
                <Text type="supporting" color="secondary">
                  Thường mất 1–3 phút. Cứ giữ trang này mở, bài sẽ hiện ngay khi xong.
                </Text>
                {order && (
                  <Text type="supporting" color="secondary">
                    ✍️ {WRITERS[order.writer].label}
                    {order.stage === 'critic' ? ` · đang sửa lời lần ${order.round}` : ''}
                  </Text>
                )}
              </VStack>
            </div>

            {failed ? (
              <Banner status="error" title="Có lỗi trong lúc tạo bài" collapsible={false}>
                <VStack gap={3}>
                  <Text type="supporting">{order?.error ?? 'Lỗi không xác định.'}</Text>
                  <div>
                    <Button label="Sửa bảng hỏi và thử lại" variant="secondary" onClick={onRetry} />
                  </div>
                </VStack>
              </Banner>
            ) : (
              <ProgressBar label="Tiến độ tạo bài" isLabelHidden value={((active + 0.5) / AGENTS.length) * 100} />
            )}

            <Card padding={5}>
              <Stepper activeStep={active} orientation="vertical" label="Các bước tạo bài" density="compact">
                {AGENTS.map((a, i) => (
                  <Step
                    key={a.key}
                    step={i}
                    label={a.label}
                    description={a.description}
                    status={failed && i === active ? 'error' : undefined}
                  />
                ))}
              </Stepper>
            </Card>
          </VStack>
        </LayoutContent>
      }
    />
  );
}

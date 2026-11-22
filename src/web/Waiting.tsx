// Man cho, dung theo ref/solsongs-v1.6.1.html: song am nhay, cau ky niem cua khach luan phien, danh sach agent.
import {useEffect, useState} from 'react';
import {AGENTS, WRITERS, type OrderView} from '../shared/catalog';
import {StudioShell, WaveMark} from './StudioShell';

const ROTATE_MS = 3600;
const FADE_MS = 350;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Luan phien tung cau trong `lines`, mo dan khi doi cau. */
function useRotating(lines: string[]) {
  const [idx, setIdx] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    if (lines.length < 2) return;
    let swap = 0;
    const timer = window.setInterval(() => {
      setIsVisible(false);
      swap = window.setTimeout(() => {
        setIdx(i => i + 1);
        setIsVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(swap);
    };
  }, [lines.length]);
  return {line: lines.length ? lines[idx % lines.length] : '', isVisible};
}

export function Waiting({order, story, onRetry, onHome}: {
  order: OrderView | null;
  /** Ky niem va net tinh cach khach vua ke (rong neu tai lai trang). */
  story: string;
  onRetry: () => void;
  onHome: () => void;
}) {
  const active = order ? AGENTS.findIndex(a => a.key === order.stage) : 0;
  const isFailed = order?.status === 'failed';
  const lines = story.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 8);
  const {line, isVisible} = useRotating(lines);

  const describe = (key: string, fallback: string) => {
    if (!order) return fallback;
    if (key === 'lyricist') return `${fallback} · ${WRITERS[order.writer].label}`;
    if (key === 'critic' && order.stage === 'critic' && order.round > 1) return `${fallback} · đang sửa lời lần ${order.round}`;
    return fallback;
  };

  return (
    <StudioShell onHome={onHome}>
      <section className="step wait on">
        <div className="w-wrap">
          <div className="w-eq" aria-hidden="true">
            <WaveMark width={130} height={100} barClass={kind => (isFailed ? '' : kind)} />
          </div>
          <p className="ch light">{isFailed ? 'CHƯA XONG' : 'ĐANG SÁNG TÁC'}</p>
          <h1 className="q">{isFailed ? 'Chưa tạo được bài hát' : <>Bài hát cho <span>{order?.recipient ?? '…'}</span></>}</h1>
          <p className="sub">
            {isFailed
              ? 'Có lỗi trong lúc tạo bài. Bạn có thể sửa thông tin và thử lại.'
              : 'Các AI agent đang viết lời, chấm vần và thu âm. Thường mất 1 đến 3 phút, cứ giữ trang này mở.'}
          </p>
          {!isFailed && <p className="w-mem" aria-live="polite" style={{opacity: isVisible ? 1 : 0}}>{line && `“${cut(line, 110)}”`}</p>}
          <div className="agents">
            <ul>
              {AGENTS.map((a, i) => (
                <li key={a.key}>
                  <span className={`st${i < active ? ' ok' : i === active ? (isFailed ? ' err' : ' run') : ''}`} />
                  <div>
                    <div className="nm">{a.label}</div>
                    <div className="ds">{describe(a.key, a.description)}</div>
                  </div>
                  <span className="tm" />
                </li>
              ))}
            </ul>
          </div>
          {isFailed && (
            <>
              <p className="err" role="alert">{order?.error ?? 'Lỗi không xác định.'}</p>
              <p className="w-retry"><button className="btn ghost" onClick={onRetry}>← Sửa thông tin</button></p>
            </>
          )}
        </div>
      </section>
    </StudioShell>
  );
}

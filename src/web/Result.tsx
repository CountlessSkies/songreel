// Man ket qua, dung theo ref/solsongs-v1.6.1.html: trinh phat va loi ben trai, mo khoa (kem goi phim, ban acoustic)
// va loi moi vao Xuong MV ben phai. Thanh toan van la gia lap.
import {useEffect, useState} from 'react';
import {PRICES, WRITERS, type OrderView, type Take} from '../shared/catalog';
import {StudioShell} from './StudioShell';

const PREVIEW_SEC = 40;
const FADE_SEC = 2;

/** Nhung gi khach mua kem khi thanh toan. */
export type Purchase = {film: boolean; acoustic: boolean};

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Diem bat dau nghe thu. Chua co moc dieu khuc tu Suno nen lay khoang 1/4 bai. */
const previewStart = (dur: number) => Math.max(0, Math.min(dur * 0.25, dur - PREVIEW_SEC));

export function Result({order, isPaid, hasFilm, onPay, acousticError, onNew, onHome, onOpenMv}: {
  order: OrderView;
  /** Da thanh toan (gia lap) trong phien nay, hoac don da dat ban acoustic. */
  isPaid: boolean;
  hasFilm: boolean;
  onPay: (p: Purchase) => void;
  acousticError: string | null;
  onNew: () => void;
  onHome: () => void;
  onOpenMv: (takeIdx: number) => void;
}) {
  const [takeIdx, setTakeIdx] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPaying, setIsPaying] = useState(false);
  const [wantFilm, setWantFilm] = useState(false);
  const [wantAcoustic, setWantAcoustic] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const acoustic = order.acoustic;
  // Ban acoustic (neu da thu xong) dung sau 2 ban chinh, chi phat/tai, khong dung lam nen MV
  const tracks: {take: Take; label: string}[] = [
    ...order.takes.map((take, i) => ({take, label: `Bản ${i + 1}`})),
    ...(acoustic?.take ? [{take: acoustic.take, label: 'Bản acoustic'}] : []),
  ];

  // Suno khong tra do dai bai: doc tu file mp3
  const [measured, setMeasured] = useState<Record<string, number>>({});
  useEffect(() => {
    for (const {take} of tracks) {
      if (measured[take.audioUrl] || take.durationSec) continue;
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => setMeasured(m => ({...m, [take.audioUrl]: a.duration}));
      a.src = take.audioUrl;
    }
  }, [tracks.length, measured]);
  const durationOf = (t: Take) => measured[t.audioUrl] ?? t.durationSec ?? null;

  const stop = () => {
    if (audio) {
      audio.ontimeupdate = null;
      audio.onended = null;
      audio.onloadedmetadata = null;
      audio.pause();
    }
    setAudio(null);
    setPlaying(null);
    setProgress(0);
  };
  useEffect(() => () => audio?.pause(), [audio]);

  /** Chua mo khoa: phat 40 giay co mo dan dau cuoi. Da mo khoa: phat tron bai. */
  const play = (i: number) => {
    if (playing === i) {
      stop();
      return;
    }
    stop();
    const el = new Audio(tracks[i].take.audioUrl);
    const isFull = isPaid;
    let start = 0;
    let len = 0;
    el.onloadedmetadata = () => {
      const dur = el.duration || 0;
      start = isFull ? 0 : previewStart(dur);
      len = isFull ? dur : Math.min(PREVIEW_SEC, dur);
      if (start > 0) el.currentTime = start;
    };
    el.ontimeupdate = () => {
      if (!len) return;
      const t = el.currentTime - start;
      setProgress(clamp01(t / len));
      if (isFull) return;
      el.volume = clamp01(Math.min(t / FADE_SEC, (len - t) / FADE_SEC));
      if (t >= len) {
        el.pause();
        setPlaying(null);
        setProgress(0);
      }
    };
    el.onended = () => {
      setPlaying(null);
      setProgress(0);
    };
    el.volume = isFull ? 1 : 0;
    void el.play().catch(() => setPlaying(null));
    setAudio(el);
    setPlaying(i);
  };

  const total = PRICES.song + (wantFilm ? PRICES.film : 0) + (wantAcoustic ? PRICES.acoustic : 0);
  const pay = () => {
    stop();
    setIsPaying(true);
    window.setTimeout(() => {
      setIsPaying(false);
      onPay({film: wantFilm, acoustic: wantAcoustic});
    }, 900);
  };

  // Khi chua mo khoa: chi hien ro tu dau den het dieu khuc dau tien
  const firstChorus = order.lyrics?.findIndex(s => s.kind === 'chorus') ?? -1;
  const review = [
    `Lời: ${WRITERS[order.writer].label}`,
    `${order.round} lần viết`,
    ...(order.critic ? [`Điểm lời ${order.critic.score}/100`, ...order.critic.issues.map(x => `Lỗi: ${x}`), ...order.critic.notes.map(x => `Gợi ý: ${x}`)] : []),
  ];
  // Nen MV chi dung 2 ban chinh
  const mvTake = Math.min(takeIdx, order.takes.length - 1);

  return (
    <StudioShell onHome={onHome} onMv={() => onOpenMv(mvTake)}>
      <section className="step on" data-step="result">
        <div className="r-hero">
          <div className="res-head">
            <span className="badge dark">Mã bài {order.id.slice(-6).toUpperCase()}</span>
            <span className="badge">{isPaid ? '✓ Bản đầy đủ đã mở khoá' : '🎁 Bản nghe thử miễn phí · 40 giây'}</span>
            <h1 className="q">Bài hát của bạn đã sẵn sàng.</h1>
            <p className="sub">{isPaid ? 'Cảm ơn bạn! Đây là bài hát trọn vẹn.' : `Nghe thử ${order.takes.length} bản và chọn bản bạn thích nhất.`}</p>
          </div>
        </div>

        <div className="r-grid">
          <div className="r-main">
            <div className="player">
              <p className="pk">♪ BÀI HÁT CỦA BẠN</p>
              <h3>{order.title ?? 'Bài hát của bạn'}</h3>
              <div className="for">Dành tặng {order.recipient}</div>
              <div className="takes">
                {tracks.map(({take, label}, i) => {
                  const dur = durationOf(take);
                  return (
                    <div key={take.audioUrl + label} className={i === takeIdx ? 'take sel' : 'take'} onClick={() => setTakeIdx(i)}>
                      <div className="row">
                        <button
                          className="pbtn"
                          aria-label={playing === i ? `Dừng ${label}` : `Phát ${label}`}
                          onClick={e => {
                            e.stopPropagation();
                            setTakeIdx(i);
                            play(i);
                          }}>
                          {playing === i ? '❚❚' : '▶'}
                        </button>
                        <div>
                          <b>{label}</b>
                          {i === 0 && <span className="tag">Gợi ý</span>}
                          <br />
                          <small>{isPaid ? `Trọn bài${dur ? ` · ${mmss(dur)}` : ''}` : `Nghe thử ${PREVIEW_SEC} giây`}</small>
                        </div>
                      </div>
                      <div className="bar"><i style={{width: playing === i ? `${progress * 100}%` : 0}} /></div>
                    </div>
                  );
                })}
                {acoustic?.status === 'running' && (
                  <div className="take wait-take" aria-live="polite">
                    <div className="row">
                      <span className="pbtn" aria-hidden="true">♪</span>
                      <div><b>Bản acoustic</b><br /><small>Đang thu, khoảng 1 đến 3 phút…</small></div>
                    </div>
                    <div className="bar"><i className="indeterminate" /></div>
                  </div>
                )}
              </div>
            </div>

            <div className={isPaid ? 'lyrics' : 'lyrics locked'}>
              {order.lyrics?.map((sec, si) => {
                const isLate = !isPaid && firstChorus >= 0 && si > firstChorus;
                return (
                  <div key={si} aria-hidden={isLate || undefined}>
                    <div className="sec">{sec.name}</div>
                    {sec.lines.map((l, li) => <div key={li} className={isLate ? 'ln on late' : 'ln on'}>{l}</div>)}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="r-side">
            {isPaid ? (
              <div className="done-card">
                <h3 className="serif">Cảm ơn bạn! Bài hát đã được mở khoá 🎉</h3>
                <p className="sub">Nghe trọn bài hoặc tải về. Thanh toán giả lập, bản thật sẽ gửi email kèm link nghe riêng.</p>
                <div className="dl">
                  {tracks.map(({take, label}, i) => (
                    <a key={take.audioUrl + label} className={i === takeIdx ? 'btn primary' : 'btn outline'} href={take.audioUrl} download target="_blank" rel="noreferrer">
                      ⬇ Tải {label.toLowerCase()}
                    </a>
                  ))}
                </div>
                {acoustic?.status === 'running' && <p className="note">Bản acoustic đang thu, xong sẽ hiện ở đây và trong trình phát.</p>}
                {acoustic?.status === 'failed' && <p className="err" role="alert">Chưa thu được bản acoustic: {acoustic.error ?? 'lỗi không rõ'}</p>}
                {acousticError && <p className="err" role="alert">Chưa đặt được bản acoustic: {acousticError}</p>}
                {hasFilm && <p className="note">Gói tạo phim Amateur đã gồm trong đơn. Mở Xưởng MV để dựng.</p>}
              </div>
            ) : (
              <div className="paywall">
                <p className="pk dark">MỞ KHOÁ TRỌN GÓI</p>
                <h3>Giữ bài hát này mãi mãi</h3>
                <div className="price">{vnd(PRICES.song)}</div>
                <ul className="incl">
                  <li>Bài hát trọn vẹn, cả {order.takes.length} bản</li>
                  <li>Trang nghe riêng để gửi tặng</li>
                  <li>Chỉnh sửa miễn phí nếu chưa ưng</li>
                </ul>
                <label className="upsell">
                  <input type="checkbox" checked={wantFilm} onChange={e => setWantFilm(e.target.checked)} />
                  <span>
                    <b>Gói tạo phim · Amateur +{vnd(PRICES.film)}</b>
                    <br />
                    <span>MV theo lời bài hát, dựng từ ảnh và clip AI. Nâng lên Pro/Cinematic trong Xưởng MV.</span>
                  </span>
                </label>
                <label className="upsell">
                  <input type="checkbox" checked={wantAcoustic} onChange={e => setWantAcoustic(e.target.checked)} />
                  <span>
                    <b>Thêm bản acoustic +{vnd(PRICES.acoustic)}</b>
                    <br />
                    <span>Cùng lời, phối guitar/piano mộc</span>
                  </span>
                </label>
                <button className="btn primary big wide" disabled={isPaying} onClick={pay}>
                  {isPaying ? 'Đang xác nhận thanh toán…' : `Thanh toán ${vnd(total)} (giả lập)`}
                </button>
                <div className="trust"><span>🔒 VietQR mọi ngân hàng</span><span>↺ Sửa miễn phí</span><span>✓ Hoàn tiền</span></div>
              </div>
            )}

            <div className="mvcta">
              <p className="pk">SOUND YOU CAN SEE</p>
              <h3>Biến bài hát thành thước phim</h3>
              <p>
                {isPaid
                  ? 'Bài hát đã mở khoá, dựng MV trên trọn bài. Mỗi câu hát thành một cảnh phim, chọn mức Amateur, Pro hoặc Cinematic.'
                  : 'Mỗi câu hát thành một cảnh phim, phụ đề chạy theo từng chữ. Chọn mức Amateur, Pro hoặc Cinematic trong Xưởng MV.'}
              </p>
              <button className="btn primary" onClick={() => onOpenMv(mvTake)}>Mở Xưởng MV →</button>
            </div>
          </div>
        </div>

        <details className="studio-panel">
          <summary>Xem các agent đã làm gì (chế độ thử nghiệm)</summary>
          <div className="kv">{review.map(x => <span key={x}>{x}</span>)}</div>
        </details>
        <p className="r-again"><button className="btn ghost" onClick={onNew}>Tạo bài hát khác</button></p>
      </section>
    </StudioShell>
  );
}

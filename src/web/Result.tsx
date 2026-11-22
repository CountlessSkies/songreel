// Man ket qua, dung theo ref/solsongs-v1.6.1.html: trinh phat 2 ban va loi ben trai, mo khoa va MV ben phai.
import {useEffect, useMemo, useRef, useState} from 'react';
import {WRITERS, type OrderView} from '../shared/catalog';
import {estimateCostUsd, MV_MODES, planScenes, type MvMode, type MvRatio} from '../shared/mv';
import {MOCK} from './api';
import type {MvRequest} from './mvApi';
import {StudioShell} from './StudioShell';

const PREVIEW_SEC = 40;
const FADE_SEC = 2;
const BASE_PRICE = 149_000;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const RATIOS: [MvRatio, string][] = [['9:16', 'Dọc 9:16'], ['16:9', 'Ngang 16:9']];

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Diem bat dau nghe thu. Chua co moc dieu khuc tu Suno nen lay khoang 1/4 bai. */
const previewStart = (dur: number) => Math.max(0, Math.min(dur * 0.25, dur - PREVIEW_SEC));

export function Result({
  order,
  onNew,
  onHome,
  onMakeMv,
  isMvStarting,
  passcode,
  onPasscode,
}: {
  order: OrderView;
  onNew: () => void;
  onHome: () => void;
  onMakeMv: (req: MvRequest) => void;
  isMvStarting: boolean;
  passcode: string;
  onPasscode: (v: string) => void;
}) {
  const [takeIdx, setTakeIdx] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPaying, setIsPaying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [mvMode, setMvMode] = useState<MvMode>('hybrid');
  const [mvRatio, setMvRatio] = useState<MvRatio>('9:16');
  const [photos, setPhotos] = useState<File[]>([]);
  const [hasConsent, setHasConsent] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const take = order.takes[takeIdx];
  // Suno khong tra do dai bai: doc tu file mp3
  const [measured, setMeasured] = useState<Record<string, number>>({});
  useEffect(() => {
    if (measured[take.audioUrl]) return;
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => setMeasured(m => ({...m, [take.audioUrl]: a.duration}));
    a.src = take.audioUrl;
  }, [take.audioUrl, measured]);
  const durationOf = (i: number) => measured[order.takes[i].audioUrl] ?? order.takes[i].durationSec ?? null;
  const durationSec = durationOf(takeIdx);
  const mvPlan = useMemo(() => planScenes(order.lyrics ?? [], durationSec ?? 180, mvMode), [order.lyrics, durationSec, mvMode]);

  const stop = () => {
    const el = audio.current;
    if (el) {
      el.ontimeupdate = null;
      el.onended = null;
      el.onloadedmetadata = null;
      el.pause();
    }
    audio.current = null;
    setPlaying(null);
    setProgress(0);
  };
  useEffect(() => () => audio.current?.pause(), []);

  /** Chua mo khoa: phat 40 giay co mo dan dau cuoi. Da mo khoa: phat tron bai. */
  const play = (i: number) => {
    if (playing === i) {
      stop();
      return;
    }
    stop();
    const el = new Audio(order.takes[i].audioUrl);
    audio.current = el;
    const isFull = isUnlocked;
    let start = 0;
    let len = 0;
    el.onloadedmetadata = () => {
      const dur = el.duration || 0;
      start = isFull ? 0 : previewStart(dur);
      len = isFull ? dur : Math.min(PREVIEW_SEC, dur);
      if (start > 0) el.currentTime = start;
    };
    el.ontimeupdate = () => {
      if (audio.current !== el || !len) return;
      const t = el.currentTime - start;
      setProgress(clamp01(t / len));
      if (isFull) return;
      el.volume = clamp01(Math.min(t / FADE_SEC, (len - t) / FADE_SEC));
      if (t >= len) stop();
    };
    el.onended = () => {
      if (audio.current === el) stop();
    };
    el.volume = isFull ? 1 : 0;
    void el.play().catch(() => {
      if (audio.current === el) stop();
    });
    setPlaying(i);
  };

  const pay = () => {
    stop();
    setIsPaying(true);
    window.setTimeout(() => {
      setIsPaying(false);
      setIsUnlocked(true);
    }, 900);
  };

  const pickPhotos = (files: FileList | null) => {
    const ok = Array.from(files ?? []).filter(f => f.size <= MAX_PHOTO_BYTES).slice(0, MAX_PHOTOS);
    setPhotos(ok);
    if (!ok.length) setHasConsent(false);
  };

  // Khi chua mo khoa: chi hien ro tu dau den het dieu khuc dau tien
  const firstChorus = order.lyrics?.findIndex(s => s.kind === 'chorus') ?? -1;
  const canMakeMv = !!durationSec && (photos.length === 0 || hasConsent) && (MOCK || !!passcode.trim()) && !isMvStarting;
  const review = [
    `Lời: ${WRITERS[order.writer].label}`,
    `${order.round} lần viết`,
    ...(order.critic ? [`Điểm lời ${order.critic.score}/100`, ...order.critic.issues.map(x => `Lỗi: ${x}`), ...order.critic.notes.map(x => `Gợi ý: ${x}`)] : []),
  ];

  return (
    <StudioShell onHome={onHome}>
      <section className="step on" data-step="result">
        <div className="r-hero">
          <div className="res-head">
            <span className="badge dark">Mã bài {order.id.slice(-6).toUpperCase()}</span>
            <span className="badge">{isUnlocked ? '✓ Bản đầy đủ đã mở khoá' : '🎁 Bản nghe thử miễn phí · 40 giây'}</span>
            <h1 className="q">Bài hát của bạn đã sẵn sàng.</h1>
            <p className="sub">{isUnlocked ? 'Cảm ơn bạn! Đây là bài hát trọn vẹn.' : `Nghe thử ${order.takes.length} bản và chọn bản bạn thích nhất.`}</p>
          </div>
        </div>

        <div className="r-grid">
          <div className="r-main">
            <div className="player">
              <p className="pk">♪ BÀI HÁT CỦA BẠN</p>
              <h3>{order.title ?? 'Bài hát của bạn'}</h3>
              <div className="for">Dành tặng {order.recipient}</div>
              <div className="takes">
                {order.takes.map((t, i) => {
                  const dur = durationOf(i);
                  return (
                    <div key={t.audioUrl} className={i === takeIdx ? 'take sel' : 'take'} onClick={() => setTakeIdx(i)}>
                      <div className="row">
                        <button
                          className="pbtn"
                          aria-label={playing === i ? `Dừng bản ${i + 1}` : `Phát bản ${i + 1}`}
                          onClick={e => {
                            e.stopPropagation();
                            setTakeIdx(i);
                            play(i);
                          }}>
                          {playing === i ? '❚❚' : '▶'}
                        </button>
                        <div>
                          <b>Bản {i + 1}</b>
                          {i === 0 && <span className="tag">Gợi ý</span>}
                          <br />
                          <small>{isUnlocked ? `Trọn bài${dur ? ` · ${mmss(dur)}` : ''}` : `Nghe thử ${PREVIEW_SEC} giây`}</small>
                        </div>
                      </div>
                      <div className="bar"><i style={{width: playing === i ? `${progress * 100}%` : 0}} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={isUnlocked ? 'lyrics' : 'lyrics locked'}>
              {order.lyrics?.map((sec, si) => {
                const isLate = !isUnlocked && firstChorus >= 0 && si > firstChorus;
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
            {isUnlocked ? (
              <div className="done-card">
                <h3 className="serif">Cảm ơn bạn! Bài hát đã được mở khoá 🎉</h3>
                <p className="sub">Nghe trọn bài hoặc tải về. Thanh toán giả lập, bản thật sẽ gửi email kèm link nghe riêng.</p>
                <div className="dl">
                  {order.takes.map((t, i) => (
                    <a key={t.audioUrl} className={i === takeIdx ? 'btn primary' : 'btn outline'} href={t.audioUrl} download target="_blank" rel="noreferrer">
                      ⬇ Tải bản {i + 1}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="paywall">
                <p className="pk dark">MỞ KHOÁ TRỌN GÓI</p>
                <h3>Giữ bài hát này mãi mãi</h3>
                <div className="price">{vnd(BASE_PRICE)}</div>
                <ul className="incl">
                  <li>Bài hát trọn vẹn, cả {order.takes.length} bản</li>
                  <li>Trang nghe riêng để gửi tặng</li>
                  <li>Chỉnh sửa miễn phí nếu chưa ưng</li>
                </ul>
                <button className="btn primary big wide" disabled={isPaying} onClick={pay}>
                  {isPaying ? 'Đang xác nhận thanh toán…' : `Thanh toán ${vnd(BASE_PRICE)} (giả lập)`}
                </button>
                <div className="trust"><span>🔒 VietQR mọi ngân hàng</span><span>↺ Sửa miễn phí</span><span>✓ Hoàn tiền</span></div>
              </div>
            )}

            <div className="mvcta">
              <p className="pk">SOUND YOU CAN SEE</p>
              <h3>Biến bài hát thành thước phim</h3>
              <p>Mỗi câu hát thành một cảnh phim, phụ đề chạy theo lời. Dùng “Bản {takeIdx + 1}” đang chọn.</p>
              <div className="f">
                <label>Kiểu MV <small>chọn một mức</small></label>
                <div className="tiers" role="radiogroup" aria-label="Kiểu MV">
                  {(Object.keys(MV_MODES) as MvMode[]).map(k => (
                    <label key={k} className={k === mvMode ? 'tier on' : 'tier'}>
                      <input type="radio" name="mvMode" checked={k === mvMode} onChange={() => setMvMode(k)} />
                      <span><b>{MV_MODES[k].label}</b><span className="tm">{MV_MODES[k].description}</span></span>
                      <span className="pr">+{vnd(MV_MODES[k].price)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="f">
                <label>Khung hình</label>
                <div className="chips mini-chips" role="group" aria-label="Khung hình">
                  {RATIOS.map(([v, label]) => (
                    <button type="button" key={v} className={v === mvRatio ? 'chip on' : 'chip'} aria-pressed={v === mvRatio} onClick={() => setMvRatio(v)}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="upl">
                <label htmlFor="mvPhotos">+ Nhập ảnh người nhận</label>
                <input type="file" id="mvPhotos" accept="image/*" multiple onChange={e => pickPhotos(e.target.files)} />
                <span>{photos.length ? photos.map(f => f.name).join(', ') : `Không bắt buộc. Tối đa ${MAX_PHOTOS} ảnh rõ mặt, mỗi ảnh dưới 10MB.`}</span>
              </div>
              {photos.length > 0 && (
                <label className="consent">
                  <input type="checkbox" checked={hasConsent} onChange={e => setHasConsent(e.target.checked)} />
                  <span>Tôi có quyền dùng các ảnh này và đồng ý cho AI xử lý để làm MV.</span>
                </label>
              )}
              <div className="est">
                Bản chạy thử: <b>{mvPlan.length} cảnh</b>, {mvPlan.filter(s => s.kind === 'clip').length} clip · chi phí AI ước tính ~$
                {estimateCostUsd(mvPlan).toFixed(2)} · dựng khoảng 5 đến 10 phút
              </div>
              {!MOCK && (
                <div className="f">
                  <label htmlFor="mvPass">Mã truy cập bản chạy thử</label>
                  <input id="mvPass" type="password" value={passcode} onChange={e => onPasscode(e.target.value)} autoComplete="off" />
                </div>
              )}
              <button
                className="btn primary wide"
                disabled={!canMakeMv}
                onClick={() => durationSec && onMakeMv({mode: mvMode, ratio: mvRatio, takeIdx, durationSec, photos})}>
                {isMvStarting ? 'Đang mở Xưởng MV…' : 'Mở Xưởng MV →'}
              </button>
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

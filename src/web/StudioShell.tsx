// Khung chung cho cac man ben trong (bang hoi, cho, ket qua), dung theo ref/solsongs-v1.6.1.html.
// Chu "Sol Songs" (.wm, .wtag) dung chung CSS voi trang chu trong home.css.
import {useId, type ReactNode} from 'react';
import './studio.css';

/** Cot song am: 11 vach tren (mat troi) va bong phan chieu ben duoi. */
const BARS: [number, number][] = [
  [108.6, 148.1], [85.6, 157.7], [73.3, 162.9], [65.8, 166.1], [61.6, 167.8], [60.3, 168.4],
  [61.6, 167.8], [65.8, 166.1], [73.3, 162.9], [85.6, 157.7], [108.6, 148.1],
];

/** Logo song am. `barClass` gan class cho tung vach ('b' = tren, 'r' = bong) de tao hieu ung tien trinh. */
export function WaveMark({width, height, barClass}: {
  width: number;
  height: number;
  barClass?: (kind: 'b' | 'r', i: number) => string;
}) {
  const gid = useId();
  const x = (i: number) => 27.5 + i * 14.5;
  return (
    <svg className="lmark" xmlns="http://www.w3.org/2000/svg" viewBox="14 46 172 132" width={width} height={height} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="54" x2="0" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC63D" />
          <stop offset="1" stopColor="#F0506E" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${gid})`} strokeWidth="9.5" strokeLinecap="round">
        {BARS.map(([top], i) => <line key={i} x1={x(i)} y1={top} x2={x(i)} y2="131" className={barClass?.('b', i)} data-i={i} />)}
      </g>
      <g stroke="#7A5AF8" strokeOpacity=".55" strokeWidth="9.5" strokeLinecap="round">
        {BARS.map(([, bottom], i) => <line key={i} x1={x(i)} y1="141" x2={x(i)} y2={bottom} className={barClass?.('r', i)} data-i={i} />)}
      </g>
    </svg>
  );
}

export function StudioShell({onHome, onBack, tab = 'song', onSong, children}: {
  onHome: () => void;
  /** Co thi hien nut mui ten quay lai o goc trai. */
  onBack?: () => void;
  /** 'mv' thi them tab "Xưởng MV" va tab "Bài hát" bam duoc (goi onSong). */
  tab?: 'song' | 'mv';
  onSong?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="studio">
      <div className="shell">
        <header className="s-nav">
          <div className="s-navin">
            {onBack && <button className="back" aria-label="Quay lại" onClick={onBack}>←</button>}
            <a
              className="brand"
              href="/"
              title="Về trang chủ"
              onClick={e => {
                e.preventDefault();
                onHome();
              }}>
              <WaveMark width={40} height={31} />
              <span className="wm">Sol Songs</span>
              <span className="wtag">Sound you can see</span>
            </a>
            <nav className="tabs" aria-label="Các khu vực">
              <button onClick={onHome}>Trang chủ</button>
              {tab === 'mv' ? (
                <>
                  <button onClick={onSong}>Bài hát</button>
                  <button className="on" aria-current="page">Xưởng MV</button>
                </>
              ) : (
                <button className="on" aria-current="page">Bài hát</button>
              )}
            </nav>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

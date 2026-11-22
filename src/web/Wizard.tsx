// Bang hoi 8 chuong, dung theo ref/solsongs-v1.6.1.html: cot tien trinh ben trai, the cau hoi dang kinh ben phai.
import {useEffect, useRef, useState, type KeyboardEvent} from 'react';
import {
  GENRES, MOODS, OCCASIONS, PRON, RELS, VOICES,
  decadeOptions, genreOptions, instOptions, moodOptions, occOptions, relOptions,
  tempoOptions, voiceOptions, WRITERS, type Answers, type Option, type WriterKey,
} from '../shared/catalog';
import {StudioShell, WaveMark} from './StudioShell';

const TOTAL = 8;
const BAR_COUNT = 11;
const MIN_MEMORY = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CHAPTERS = ['Người ấy', 'Tên gọi', 'Khoảnh khắc', 'Giai điệu', 'Điều đặc biệt', 'Kỷ niệm', 'Lời nhắn', 'Trao gửi'];
const LINES = [
  'Câu chuyện của bạn bắt đầu', 'Một cái tên sắp thành giai điệu', 'Chọn ngày để nhớ', 'Chọn ánh sáng cho thước phim',
  'Những điều chỉ bạn biết', 'Trái tim của bài hát', 'Nốt lặng cuối cùng', 'Sắp vang lên rồi',
];
const VOICE_EMOJI: Record<string, string> = {male: '🎙️', female: '🎤', duet: '🎶', auto: '✨'};
const QUALITY_SPARKS = ['Luôn lo cho người khác', 'Hay cười', 'Chu đáo từng chút', 'Mạnh mẽ, kiên nhẫn', 'Hài hước'];
const MEMORY_SPARKS = ['Lần đầu gặp nhau, ', 'Có một ngày mưa, ', 'Câu nói quen thuộc nhất là “', 'Món ăn của nhà mình là ', 'Chuyến đi đáng nhớ nhất là '];

const cut = (s: string, n = 46) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Chips({label, options, value, onPick, variant = '', emoji}: {
  label: string;
  options: Option[];
  value: string;
  onPick: (v: string) => void;
  variant?: string;
  emoji?: Record<string, string>;
}) {
  return (
    <div className={`chips ${variant}`} role="group" aria-label={label}>
      {options.map(o => (
        <button type="button" key={o.value} className={o.value === value ? 'chip on' : 'chip'} aria-pressed={o.value === value} onClick={() => onPick(o.value)}>
          {emoji?.[o.value] && <span className="em">{emoji[o.value]}</span>}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Sparks({items, onAdd}: {items: string[]; onAdd: (text: string) => void}) {
  return (
    <div className="sparks">
      {items.map(t => <button type="button" key={t} onClick={() => onAdd(t)}>{t}</button>)}
    </div>
  );
}

export function Wizard({initial, onSubmit, isSubmitting, submitError, onHome}: {
  initial: Answers;
  onSubmit: (a: Answers, passcode: string) => void;
  isSubmitting: boolean;
  submitError: string | null;
  onHome: () => void;
}) {
  const [step, setStep] = useState(1);
  const [a, setA] = useState<Answers>(initial);
  const [passcode, setPasscode] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const qualRef = useRef<HTMLTextAreaElement>(null);
  const memRef = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof Answers>(k: K) => (v: Answers[K]) => setA(prev => ({...prev, [k]: v}));

  const name = a.name.trim();
  const memLen = a.memories.trim().length;
  const isValid = (n: number) => {
    if (n === 1) return !!a.rel;
    if (n === 2) return name.length >= 2;
    if (n === 3) return !!a.occ;
    if (n === 4) return !!a.genre && !!a.voice;
    if (n === 6) return memLen >= MIN_MEMORY;
    if (n === 8) return EMAIL_PATTERN.test(a.email.trim());
    return true;
  };
  const canNext = isValid(step) && !isSubmitting;

  // Sang chuong moi: cuon len dau va dua con tro vao o nhap dau tien (tru chuong cuoi)
  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'smooth'});
    if (step === TOTAL) return;
    const t = window.setTimeout(() => cardRef.current?.querySelector<HTMLElement>('input, textarea')?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [step]);

  const next = () => {
    if (!canNext) return;
    if (step < TOTAL) {
      setStep(step + 1);
      return;
    }
    const bad = CHAPTERS.findIndex((_, i) => !isValid(i + 1));
    if (bad >= 0) {
      setStep(bad + 1);
      return;
    }
    onSubmit(a, passcode);
  };
  const back = () => (step === 1 ? onHome() : setStep(step - 1));

  /** Chon xong thi tu sang chuong sau, nhu ban thiet ke. */
  const pickAndAdvance = (k: 'rel' | 'occ') => (v: string) => {
    set(k)(v);
    const from = step;
    window.setTimeout(() => setStep(s => (s === from ? s + 1 : s)), 220);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') next();
  };

  const addSpark = (k: 'qualities' | 'memories', ref: React.RefObject<HTMLTextAreaElement | null>) => (text: string) => {
    const cur = a[k].trim();
    set(k)(cur ? `${cur}${/[.,!?]$/.test(cur) ? ' ' : ', '}${text}` : text);
    ref.current?.focus();
  };

  // Cot tien trinh
  const lit = Math.round((step / TOTAL) * BAR_COUNT);
  const barClass = (kind: 'b' | 'r', i: number) => `${kind}${i < lit ? ' on' : ''}${kind === 'b' && i === lit - 1 ? ' now' : ''}`;
  const values = [
    RELS[a.rel] ?? '', name, OCCASIONS[a.occ] ?? '',
    a.genre ? `${GENRES[a.genre][0]}${a.voice ? ` · ${VOICES[a.voice]}` : ''}` : '',
    cut(a.qualities.trim()), cut(a.memories.trim()), cut(a.dedication.trim()) || a.sender.trim(), a.email.trim(),
  ];
  const pron = PRON[a.rel] ?? ['người', 'mình'];
  const quote = (a.memories.trim() || a.qualities.trim()).split(/[.!?\n]/)[0].trim();
  const posterTags = [a.genre && GENRES[a.genre][0], a.voice && VOICES[a.voice], a.mood && MOODS[a.mood][0]].filter(Boolean) as string[];

  return (
    <StudioShell onHome={onHome} onBack={back}>
      <div className="wiz">
        <aside className="rail" aria-label="Tiến trình câu chuyện">
          <div className="rail-top">
            <div className="wave"><WaveMark width={74} height={57} barClass={barClass} /></div>
            <div>
              <p className="rail-k">Chương {step}/{TOTAL}</p>
              <p className="rail-p"><b>{CHAPTERS[step - 1]}</b> · {LINES[step - 1]}</p>
            </div>
          </div>
          <div className="rail-prog"><i style={{width: `${(step / TOTAL) * 100}%`}} /></div>
          <ol className="chapters">
            {CHAPTERS.map((t, i) => {
              const k = i + 1;
              const isDone = k < step;
              return (
                <li key={t} className={isDone ? 'done' : k === step ? 'cur' : undefined} onClick={isDone ? () => setStep(k) : undefined}>
                  <span className="n">{isDone ? '✓' : k}</span>
                  <div>
                    <b>{t}</b>
                    {k <= step && values[i] && <small>{values[i]}</small>}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="poster" aria-live="polite">
            <p className="pk">BẢN NHÁP THƯỚC PHIM</p>
            <h3>{name ? `Bài hát cho ${name}` : 'Một bài hát đang chờ được kể'}</h3>
            <p className="pfor">{[RELS[a.rel], OCCASIONS[a.occ]].filter(Boolean).join(' · ') || 'Chọn người nhận để bắt đầu'}</p>
            <div className="ptags">{posterTags.map(t => <span key={t}>{t}</span>)}</div>
            {quote && <blockquote>“{cut(quote, 90)}”</blockquote>}
            <div className="peq" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
        </aside>

        <div className="qcard" ref={cardRef} onKeyDown={onKeyDown}>
          {step === 1 && (
            <section className="step on">
              <p className="ch">CHƯƠNG 1 · NGƯỜI ẤY</p>
              <h1 className="q">Bài hát này dành cho ai?</h1>
              <p className="sub">Mỗi bài hát bắt đầu từ một người: người mà chỉ cần nghĩ tới, bạn đã muốn mỉm cười.</p>
              <Chips label="Người nhận" variant="big" options={relOptions} value={a.rel} onPick={pickAndAdvance('rel')} />
              <p className="whisper">“Âm nhạc nói giúp những điều ta chưa kịp nói.”</p>
            </section>
          )}

          {step === 2 && (
            <section className="step on">
              <p className="ch">CHƯƠNG 2 · TÊN GỌI</p>
              <h1 className="q">Bạn vẫn gọi người ấy là gì?</h1>
              <p className="sub">Cái tên thân quen nhất sẽ vang lên trong điệp khúc, đúng như cách bạn vẫn gọi mỗi ngày.</p>
              <div className="namebox">
                <input
                  className="center bigin"
                  aria-label="Tên gọi người nhận"
                  value={a.name}
                  onChange={e => set('name')(e.target.value)}
                  placeholder="Mẹ Thu, bé Na, anh Minh…"
                  maxLength={40}
                  autoComplete="off"
                />
                <p className={name ? 'echo on' : 'echo'} aria-live="polite">
                  ♪ <span>{name ? `“${name} ơi, hôm nay ${pron[1]} hát cho ${pron[0]} nghe”` : '“… ơi, hôm nay mình hát cho nhau nghe”'}</span>
                </p>
              </div>
              <p className="whisper">Mẹo: viết đúng như lúc bạn gọi người ấy ở nhà.</p>
            </section>
          )}

          {step === 3 && (
            <section className="step on">
              <p className="ch">CHƯƠNG 3 · KHOẢNH KHẮC</p>
              <h1 className="q">Bài hát sẽ đến vào dịp nào?</h1>
              <p className="sub">Có những ngày đáng được nhớ bằng một giai điệu.</p>
              <Chips label="Dịp tặng" variant="big occ" options={occOptions} value={a.occ} onPick={pickAndAdvance('occ')} />
            </section>
          )}

          {step === 4 && (
            <section className="step on">
              <p className="ch">CHƯƠNG 4 · GIAI ĐIỆU</p>
              <h1 className="q">Câu chuyện của bạn nghe như thế nào?</h1>
              <p className="sub">Chọn chất nhạc và giọng hát, như chọn ánh sáng cho một thước phim.</p>
              <p className="group-label">Thể loại</p>
              <Chips label="Thể loại" options={genreOptions} value={a.genre} onPick={set('genre')} />
              <p className="group-label">Giọng hát</p>
              <Chips label="Giọng hát" options={voiceOptions} value={a.voice} onPick={set('voice')} emoji={VOICE_EMOJI} />
              <details className="adv">
                <summary>Tinh chỉnh thêm · tempo, cảm xúc, thời kỳ, nhạc cụ</summary>
                <div className="field wide">
                  <label>Tempo</label>
                  <Chips label="Tempo" variant="mini-chips" options={tempoOptions} value={a.tempo} onPick={set('tempo')} />
                  <label>Cảm xúc</label>
                  <Chips label="Cảm xúc" variant="mini-chips" options={moodOptions} value={a.mood} onPick={set('mood')} />
                  <label>Thời kỳ âm nhạc</label>
                  <Chips label="Thời kỳ âm nhạc" variant="mini-chips" options={decadeOptions} value={a.decade} onPick={set('decade')} />
                  <label>Nhạc cụ chính</label>
                  <Chips label="Nhạc cụ chính" variant="mini-chips" options={instOptions} value={a.inst} onPick={set('inst')} />
                </div>
              </details>
            </section>
          )}

          {step === 5 && (
            <section className="step on">
              <p className="ch">CHƯƠNG 5 · ĐIỀU ĐẶC BIỆT</p>
              <h1 className="q">Điều gì khiến người ấy thật đặc biệt?</h1>
              <p className="sub">
                Tính cách, thói quen, nụ cười… những điều bạn thương nhất ở họ. <i>Không bắt buộc, nhưng càng cụ thể bài hát càng chạm.</i>
              </p>
              <div className="field wide">
                <textarea
                  ref={qualRef}
                  aria-label="Điều đặc biệt ở người ấy"
                  maxLength={500}
                  value={a.qualities}
                  onChange={e => set('qualities')(e.target.value)}
                  placeholder="Hiền lành, hay cười, luôn để phần con miếng ngon nhất, tối nào cũng gọi điện hỏi con ăn cơm chưa…"
                />
              </div>
              <Sparks items={QUALITY_SPARKS} onAdd={addSpark('qualities', qualRef)} />
            </section>
          )}

          {step === 6 && (
            <section className="step on">
              <p className="ch">CHƯƠNG 6 · KỶ NIỆM</p>
              <h1 className="q">Kể cho chúng tôi một kỷ niệm.</h1>
              <p className="sub">Một chi tiết nhỏ, như chiếc xe đạp cũ hay bữa cơm chiều mưa, sẽ thành câu hát và cảnh phim người ấy nhớ mãi.</p>
              <div className="field wide">
                <textarea
                  ref={memRef}
                  className="tall"
                  aria-label="Kỷ niệm"
                  maxLength={1500}
                  value={a.memories}
                  onChange={e => set('memories')(e.target.value)}
                  placeholder="Hồi nhỏ, ngày mưa nào mẹ cũng đạp xe chở mình đi học, áo mưa trùm kín hai mẹ con…"
                />
                <div className="counter">
                  <span className={memLen && memLen < MIN_MEMORY ? 'warn' : undefined}>{memLen && memLen < MIN_MEMORY ? 'Kể thêm một chút nữa nhé' : ''}</span>
                  <span>{memLen} / {MIN_MEMORY} ký tự tối thiểu</span>
                </div>
              </div>
              <p className="group-label left">Gợi ý để bắt đầu</p>
              <Sparks items={MEMORY_SPARKS} onAdd={addSpark('memories', memRef)} />
            </section>
          )}

          {step === 7 && (
            <section className="step on">
              <p className="ch">CHƯƠNG 7 · LỜI NHẮN</p>
              <h1 className="q">Bạn muốn nói điều gì ở cuối bài?</h1>
              <p className="sub">Một câu thôi, sẽ là nốt lặng cuối cùng người ấy nghe được.</p>
              <div className="field wide">
                <textarea
                  className="short"
                  aria-label="Lời nhắn cuối bài"
                  maxLength={300}
                  value={a.dedication}
                  onChange={e => set('dedication')(e.target.value)}
                  placeholder="Chúc mẹ luôn khoẻ mạnh và cười thật nhiều."
                />
                <label htmlFor="f_sender">Ký tên</label>
                <input id="f_sender" value={a.sender} onChange={e => set('sender')(e.target.value)} placeholder="Con gái Minh Anh" />
              </div>
            </section>
          )}

          {step === 8 && (
            <section className="step on">
              <p className="ch">CHƯƠNG 8 · TRAO GỬI</p>
              <h1 className="q">Vài phút nữa, câu chuyện sẽ thành bài hát.</h1>
              <p className="sub">Để lại email, chúng tôi gửi link bài hát khi bản đầy đủ sẵn sàng.</p>
              <div className="field">
                <label htmlFor="f_email">Email</label>
                <input id="f_email" type="email" value={a.email} onChange={e => set('email')(e.target.value)} placeholder="ban@email.com" autoComplete="email" />
                <label htmlFor="f_phone">Số Zalo <small>(không bắt buộc)</small></label>
                <input id="f_phone" type="tel" value={a.phone} onChange={e => set('phone')(e.target.value)} placeholder="09xx xxx xxx" autoComplete="tel" />
                <label>AI viết lời <small>(bản chạy thử cho chọn model để so sánh)</small></label>
                <Chips
                  label="AI viết lời"
                  variant="mini-chips"
                  options={(Object.keys(WRITERS) as WriterKey[]).map(k => ({value: k, label: WRITERS[k].label}))}
                  value={a.writer}
                  onPick={v => set('writer')(v as WriterKey)}
                />
                <p className="note">
                  {WRITERS[a.writer].description} <a className="linkish" href="/bench/" target="_blank" rel="noreferrer">Xem benchmark 3 model</a>
                </p>
                <label htmlFor="f_pass">Mã truy cập bản chạy thử <small>(bản PoC giới hạn người dùng nội bộ)</small></label>
                <input id="f_pass" value={passcode} onChange={e => setPasscode(e.target.value)} autoComplete="off" />
              </div>
              <ul className="promise">
                <li><b>🎧</b>Nghe thử miễn phí 2 bản</li>
                <li><b>↺</b>Sửa miễn phí</li>
                <li><b>✓</b>Hoàn tiền nếu chưa ưng</li>
              </ul>
              {submitError && <p className="err" role="alert">Chưa tạo được bài: {submitError}</p>}
            </section>
          )}

          <div className="nav">
            <button className="btn ghost" style={{visibility: step > 1 ? 'visible' : 'hidden'}} onClick={back}>← Quay lại</button>
            <button className="btn primary" id="nextBtn" disabled={!canNext} onClick={next}>
              {isSubmitting ? 'Đang gửi…' : step === TOTAL ? '🎵 Nghe bài hát của tôi' : 'Tiếp theo →'}
            </button>
          </div>
          {step <= 2 && (
            <p className="legal">
              Bằng việc tiếp tục, bạn đồng ý với <u>Điều khoản</u> &amp; <u>Chính sách bảo mật</u>. Lời, nhạc và hình được tạo với sự hỗ trợ của AI.
            </p>
          )}
        </div>
      </div>
    </StudioShell>
  );
}

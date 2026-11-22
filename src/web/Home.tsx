// Trang chu Sol Songs, dung theo ref/solsongs-v1.6.1.html (thiet ke cua sep). Noi dung va CSS giu nguyen ban goc,
// chi doi phan tuong tac: bam "Tao bai hat" / chon dip thi mo bang hoi voi dip va nguoi nhan dien san.
import {useEffect, useRef, useState, type CSSProperties, type PointerEvent} from 'react';
import {BEDS, instrumental} from './homeBed';
import {occArt} from './homeOccArt';
import {WaveMark} from './StudioShell';
import './home.css';

export type StartPrefill = {occ?: string; rel?: string};

const TRANS: [string, string, string, string][] = [
  ['Hồi tiểu học, ngày mưa nào mẹ cũng đạp xe chở con đi học.', 'Ngày mưa, mẹ đạp xe đưa con đến lớp', '/home/canh-1.jpg', 'Cảnh 1 · 0:00'],
  ['Về đến nhà, mẹ treo hai chiếc áo mưa bên cửa sổ cho khô.', 'Hai chiếc áo mưa hong bên cửa sổ', '/home/canh-2.jpg', 'Cảnh 2 · 0:06'],
  ['Giờ con đi làm xa, vẫn nhớ tay mẹ ấm khi rót trà.', 'Con lớn rồi, vẫn nhớ bàn tay ấm', '/home/canh-3.jpg', 'Cảnh 3 · 0:12'],
  ['Mỗi lần về quê, con chỉ muốn ôm mẹ thật lâu.', 'Bình yên là lúc con được ôm mẹ', '/home/canh-4.jpg', 'Cảnh 4 · 0:18'],
];

type Sample = {
  tab: string;
  title: string;
  for: string;
  tags: string[];
  img: string;
  occ: string;
  rel: string;
  lyric: string[];
  pts: string[];
  /** Giai dieu nen khong loi tao trong trinh duyet, dung khi chua co ban nhac that. */
  bed: keyof typeof BEDS;
  /** Ban nhac that da tao bang Sol Songs (neu co). */
  audio?: string;
};

const SAMPLES: Sample[] = [
  {
    tab: 'Sinh nhật', title: 'Tuổi Mới Của Mẹ Thu', for: 'Con gái tặng mẹ', tags: ['Ballad Việt', 'Giọng nữ', 'Cảm động'],
    bed: 'ballad', img: '/home/canh-3.jpg', occ: 'sinh_nhat', rel: 'me',
    lyric: ['Hôm nay sinh nhật mẹ Thu ơi', 'Con hát khúc ca này tặng mẹ', 'Chúc mẹ tuổi mới thật bình an', 'Mãi là ánh sáng trong tim con'],
    pts: ['Tên mẹ được hát trong điệp khúc', 'Kỷ niệm bữa cơm chiều mưa thành câu hát', 'MV dọc 9:16 để gửi qua Zalo, Messenger'],
    audio: '/mock/take1.mp3',
  },
  {
    tab: 'Kỷ niệm', title: 'Mười Năm Bên Em', for: 'Chồng tặng vợ', tags: ['Acoustic', 'Song ca', 'Lãng mạn'],
    bed: 'indie', img: '/home/canh-4.jpg', occ: 'ky_niem', rel: 'vo',
    lyric: ['Mười năm rồi em ơi, mình vẫn nắm tay', 'Qua bao mùa mưa nắng chẳng đổi thay', 'Căn phòng nhỏ ngày đầu còn nhớ mãi', 'Anh vẫn thương em như buổi ban đầu'],
    pts: ['Từ căn phòng trọ đầu tiên đến hôm nay', 'Song ca: hai người cùng hát', 'Thước phim dựng từ ảnh cưới của hai bạn'],
  },
  {
    tab: 'Cảm ơn', title: 'Lời Cảm Ơn Gửi Thầy', for: 'Học trò tặng thầy', tags: ['Dân ca đương đại', 'Giọng nam', 'Hoài niệm'],
    bed: 'piano', img: '/home/canh-2.jpg', occ: 'cam_on', rel: 'thay_co',
    lyric: ['Cảm ơn thầy những sớm mai', 'Phấn trắng rơi trên bục giảng dài', 'Lời thầy dạy theo em suốt đời', 'Hôm nay em hát gửi thầy đôi lời'],
    pts: ['Chi tiết lớp học cũ thành câu hát', 'Phối đàn tranh, sáo trúc', 'Hợp để phát trong buổi họp lớp'],
  },
];

/** [hinh, nhan, mo ta, dip, nguoi nhan, do sau trong luoi 3D] */
const OCCS: [string, string, string, string, string | null, 'near' | 'mid' | 'far'][] = [
  ['sinh_nhat', 'Sinh nhật', 'Ngọn nến, lời chúc tuổi mới', 'sinh_nhat', null, 'near'],
  ['ky_niem', 'Kỷ niệm ngày yêu', 'Ngày đầu nắm tay', 'ky_niem', null, 'far'],
  ['ngay_cua_me', 'Ngày của Mẹ', 'Bữa cơm chiều, bàn tay ấm', 'ngay_cua_me', 'me', 'mid'],
  ['cam_on_bo', 'Ngày của Bố', 'Chiếc xe đạp, đôi vai gầy', 'cam_on', 'bo', 'near'],
  ['tinh_yeu', 'Tình yêu', 'Những điều chưa kịp nói', 'khong_ly_do', 'nguoi_yeu_nu', 'mid'],
  ['dam_cuoi', 'Đám cưới', 'Trăm năm bắt đầu từ hôm nay', 'dam_cuoi', null, 'near'],
  ['tuong_nho', 'Tưởng nhớ', 'Người vẫn ở trong từng ký ức', 'tuong_nho', null, 'far'],
  ['tot_nghiep', 'Tốt nghiệp', 'Bước sang trang mới', 'tot_nghiep', null, 'mid'],
  ['cam_on', 'Cảm ơn', 'Vì đã luôn ở bên', 'cam_on', null, 'far'],
  ['yeu_xa', 'Yêu xa', 'Khác múi giờ, chung nhịp tim', 'yeu_xa', null, 'near'],
  ['xin_loi', 'Xin lỗi', 'Lời khó nói thành câu hát', 'xin_loi', null, 'mid'],
  ['tet', 'Tết sum vầy', 'Nhà mình đủ mặt', 'tet', null, 'far'],
];

const FAQ: [string, string][] = [
  ['Tôi có cần tự viết lời không?', 'Không. Bạn chỉ cần kể kỷ niệm bằng lời của mình. Sol Songs viết thành ca từ có vần, có tên người nhận trong điệp khúc, rồi phổ nhạc.'],
  ['Tôi nhận được những gì?', 'Bài hát trọn vẹn khoảng 2 phút, trang nghe riêng để gửi tặng, file nhạc để tải. Nếu chọn gói MV: thước phim theo từng câu hát, có phụ đề, khung dọc hoặc ngang.'],
  ['Mất bao lâu?', 'Bản nghe thử có sau vài phút. MV ảnh động dựng ngay sau đó; MV video AI cần thêm thời gian vì mỗi cảnh được quay riêng.'],
  ['Nếu bản đầu tiên chưa ưng thì sao?', 'Bạn được sửa miễn phí: chỉnh câu hát, đổi thể loại, đổi giọng hay tạo lại từng cảnh. Nếu vẫn chưa hài lòng, chúng tôi hoàn tiền theo chính sách.'],
  ['Ảnh gia đình của tôi được dùng thế nào?', 'Ảnh chỉ dùng làm tham chiếu để dựng hình cho bài hát của bạn. Bạn cần có quyền dùng ảnh và sự đồng ý của người trong ảnh.'],
  ['Tôi có được chia sẻ bài hát và MV không?', 'Có. Bạn được tặng, phát trong gia đình và đăng lên mạng xã hội cá nhân. Sử dụng thương mại theo điều khoản riêng.'],
];

const Trust = ({center}: {center?: boolean}) => (
  <p className={center ? 'h-trust center' : 'h-trust'}>
    <span><b>🎧</b>{center ? 'Nghe thử miễn phí' : 'Nghe thử miễn phí trước khi thanh toán'}</span>
    <span><b>↺</b>Sửa miễn phí</span>
    <span><b>✓</b>Hoàn tiền nếu chưa ưng</span>
  </p>
);

const Logo = ({light}: {light?: boolean}) => (
  <a className={light ? 'h-logo light' : 'h-logo'} href="#top" onClick={toTop}>
    <WaveMark width={38} height={29} />
    <span className="wm">Sol Songs</span>
    {!light && <span className="wtag">Sound you can see</span>}
  </a>
);

/** Luoi dip tang co chieu sau: ca luoi nghieng theo chuot, moi khung co thi sai 3 lop. */
function OccGrid({onPick}: {onPick: (p: StartPrefill) => void}) {
  const innRef = useRef<HTMLDivElement>(null);
  const isStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const inn = innRef.current;
    if (!inn || isStill()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    inn.style.setProperty('--rx', `${(x * 7).toFixed(2)}deg`);
    inn.style.setProperty('--ry', `${(-y * 5).toFixed(2)}deg`);
    const c = (e.target as HTMLElement).closest<HTMLElement>('.oc');
    if (!c) return;
    const q = c.getBoundingClientRect();
    c.style.setProperty('--mx', ((e.clientX - q.left) / q.width - 0.5).toFixed(3));
    c.style.setProperty('--my', ((e.clientY - q.top) / q.height - 0.5).toFixed(3));
  };
  const onLeave = () => {
    innRef.current?.style.setProperty('--rx', '0deg');
    innRef.current?.style.setProperty('--ry', '0deg');
  };
  const onOut = (e: PointerEvent<HTMLDivElement>) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.oc');
    if (c && !c.contains(e.relatedTarget as Node | null)) {
      c.style.setProperty('--mx', '0');
      c.style.setProperty('--my', '0');
    }
  };

  return (
    <div className="h-occ occ3d" onPointerMove={onMove} onPointerLeave={onLeave} onPointerOut={onOut}>
      <div className="occ-in" ref={innRef}>
        {OCCS.map(([art, l, m, occ, rel, depth], k) => (
          <div
            className={`oc-cell ${depth}`}
            key={art}
            style={{'--fd': `${(6 + (k % 4) * 1.3).toFixed(1)}s`, '--fdl': `-${(k * 0.9).toFixed(1)}s`} as CSSProperties}
          >
            <button className="oc" aria-label={`${l}: ${m}`} onClick={() => onPick({occ, rel: rel ?? undefined})}>
              <div className="oc-art">
                <svg viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true" dangerouslySetInnerHTML={{__html: occArt(art)}} />
              </div>
              <div className="oc-tx">
                <b>{l}</b>
                <small>{m}</small>
                <span className="oc-go">Tạo bài cho dịp này →</span>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function toTop(e: React.MouseEvent) {
  e.preventDefault();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

export function Home({onStart}: {onStart: (p?: StartPrefill) => void}) {
  const heroRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [tab, setTab] = useState(0);
  const sampleRef = useRef<HTMLAudioElement>(null);
  const [isSampleOn, setIsSampleOn] = useState(false);
  const s = SAMPLES[tab];

  useEffect(() => {
    void heroRef.current?.play().catch(() => {});
  }, []);

  // Giai dieu nen: token tang moi lan dung de bo qua ban render xong tre
  const bed = useRef<{ac?: AudioContext; src?: AudioBufferSourceNode; token: number}>({token: 0});

  const stopSample = () => {
    sampleRef.current?.pause();
    const b = bed.current;
    b.token++;
    if (b.src) {
      b.src.onended = null;
      try {
        b.src.stop();
      } catch {
        /* da dung */
      }
      b.src = undefined;
    }
    setIsSampleOn(false);
  };

  useEffect(() => stopSample, [tab]);

  const toggleSound = () => {
    const v = heroRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
    setIsMuted(v.muted);
  };

  const toggleSample = () => {
    if (isSampleOn) {
      stopSample();
      return;
    }
    setIsSampleOn(true);
    const a = sampleRef.current;
    if (s.audio && a) {
      if (a.currentTime < 30) a.currentTime = 30; // vao gan dieu khuc
      void a.play();
      return;
    }
    void playBed();
  };

  const playBed = async () => {
    const b = bed.current;
    const token = ++b.token;
    try {
      b.ac ??= new AudioContext();
      await b.ac.resume();
      const buf = await instrumental(BEDS[s.bed], s.title, 18);
      if (token !== b.token) return;
      const src = b.ac.createBufferSource();
      src.buffer = buf;
      src.connect(b.ac.destination);
      src.onended = () => {
        if (b.src === src) stopSample();
      };
      src.start();
      b.src = src;
    } catch {
      if (token === b.token) stopSample();
    }
  };

  const start = (p?: StartPrefill) => {
    heroRef.current?.pause();
    stopSample();
    onStart(p);
  };

  return (
    <main className="home">
      <header className="h-nav">
        <nav className="h-wrap h-navin" aria-label="Điều hướng trang chủ">
          <Logo />
          <span className="h-links">
            <a href="#y-tuong">Ý tưởng</a>
            <a href="#cach-lam">Cách hoạt động</a>
            <a href="#nghe-mau">Mẫu</a>
            <a href="#dip-tang">Dịp tặng</a>
            <a href="#hoi-dap">Hỏi đáp</a>
          </span>
          <button className="h-cta sm" onClick={() => start()}>Tạo bài hát</button>
        </nav>
      </header>

      {/* HERO */}
      <section className="h-hero" id="top">
        <div className="h-wrap h-heroin">
          <div className="h-herotext">
            <p className="h-eye">SỐNG LẠI KHOẢNH KHẮC</p>
            <h1>
              Có những khoảnh khắc
              <br />
              <em>đáng được sống lại.</em>
            </h1>
            <p className="h-tagline">Sound you can see.</p>
            <p className="h-lead">
              Kể cho Sol Songs một kỷ niệm. Chúng tôi viết thành ca từ, phổ thành giai điệu và dựng thành một thước phim chân thật,
              để người bạn thương được <b>nghe lại</b>, <b>nhìn lại</b> và <b>cảm lại</b> khoảnh khắc ấy.
            </p>
            <div className="h-btns">
              <button className="h-cta" onClick={() => start()}>Bắt đầu lưu giữ khoảnh khắc →</button>
              <a className="h-ghost" href="#thuoc-phim">▶ Xem thước phim mẫu</a>
            </div>
            <Trust />
          </div>
          <div className="h-phone" id="thuoc-phim">
            <video
              ref={heroRef}
              src="/home/sample.mp4"
              poster="/home/sample-poster.jpg"
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Thước phim mẫu Ngày mưa của mẹ"
            />
            <button className="h-sound" onClick={toggleSound} aria-label={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}>
              {isMuted ? '🔇 Chạm để nghe' : '🔊 Đang phát'}
            </button>
            <div className="h-phone-cap">
              Thước phim mẫu · <i>Ngày mưa của mẹ</i>
            </div>
          </div>
        </div>
      </section>

      {/* Y TUONG */}
      <section className="h-sec" id="y-tuong">
        <div className="h-wrap">
          <p className="h-eye dark">Ý TƯỞNG LỚN</p>
          <blockquote className="h-quote">
            Ký ức không mất đi.
            <br />
            Nó chỉ chờ <em>một giai điệu</em> để sống lại.
          </blockquote>
          <p className="h-formula" aria-label="Khoảnh khắc cộng ca từ cộng âm nhạc cộng hình ảnh bằng ký ức sống lại">
            <span>Khoảnh khắc</span><i>+</i><span>Ca từ</span><i>+</i><span>Âm nhạc</span><i>+</i><span>Hình ảnh</span><i>=</i>
            <span className="hl">Ký ức sống lại</span>
          </p>
          <div className="h-pillars">
            <article>
              <b>01</b>
              <h3>Ca từ đẹp</h3>
              <p>Viết từ những chi tiết chỉ hai người hiểu: cái tên vẫn gọi mỗi ngày, câu nói quen, con đường cũ, bữa cơm chiều mưa. Tên người nhận được hát trong điệp khúc.</p>
            </article>
            <article>
              <b>02</b>
              <h3>Âm nhạc đầy cảm xúc</h3>
              <p>Ballad, acoustic, bolero, lofi hay hát ru: chọn giai điệu hợp với kỷ niệm. Giọng hát tiếng Việt, phối khí trọn vẹn, nghe thử hai bản rồi chọn bản bạn thích.</p>
            </article>
            <article>
              <b>03</b>
              <h3>Thước phim chân thật</h3>
              <p>Mỗi câu hát thành một cảnh. Hình được dựng từ chính câu chuyện, hoặc từ ảnh của bạn, rồi ghép khớp nhạc, phụ đề chạy theo từng câu.</p>
            </article>
          </div>
        </div>
      </section>

      {/* TU KY NIEM DEN CANH PHIM */}
      <section className="h-sec h-dark">
        <div className="h-wrap">
          <p className="h-eye">TỪ MỘT KỶ NIỆM ĐẾN MỘT CẢNH PHIM</p>
          <h2>
            Bạn kể một chi tiết nhỏ.
            <br />
            <em>Chúng tôi giữ nó lại bằng lời, bằng nhạc, bằng hình.</em>
          </h2>
          <div className="h-trans">
            {TRANS.map(([m, l, img, c]) => (
              <div className="h-row" key={c}>
                <div className="mem"><small>KỶ NIỆM BẠN KỂ</small>“{m}”</div>
                <div className="arr">→</div>
                <div className="lyr"><small>CA TỪ</small>{l}</div>
                <div className="arr">→</div>
                <div className="shot" style={{backgroundImage: `url('${img}')`}}><span>{c}</span></div>
              </div>
            ))}
          </div>
          <p className="h-small">Ví dụ minh hoạ từ thước phim mẫu “Ngày mưa của mẹ”.</p>
        </div>
      </section>

      {/* CACH HOAT DONG */}
      <section className="h-sec" id="cach-lam">
        <div className="h-wrap">
          <p className="h-eye dark">4 BƯỚC ĐƠN GIẢN</p>
          <h2 className="ink">Từ câu chuyện của bạn đến thước phim có nhạc</h2>
          <ol className="h-steps">
            <li><span className="n">1</span><h3>Kể khoảnh khắc</h3><p>Người nhận, dịp tặng và những kỷ niệm bạn nhớ nhất.</p><em>~5 phút</em></li>
            <li><span className="n">2</span><h3>Nhận ca từ & giai điệu</h3><p>AI viết lời theo câu chuyện, chấm vần, rồi thu hai bản để bạn chọn.</p><em>Nghe thử miễn phí</em></li>
            <li><span className="n">3</span><h3>Dựng thước phim</h3><p>Mỗi câu hát thành một cảnh: ảnh AI, clip AI hoặc ảnh của bạn, khớp nhạc và phụ đề.</p><em>Dọc 9:16 · Ngang 16:9</em></li>
            <li><span className="n">4</span><h3>Trao tặng</h3><p>Trang nghe riêng để gửi, file nhạc và MV để giữ mãi.</p><em>Tải MP4 · MP3</em></li>
          </ol>
          <div className="h-center">
            <button className="h-cta" onClick={() => start()}>Kể khoảnh khắc của bạn →</button>
            <p className="h-small dark">Không cần biết viết lời hay làm nhạc.</p>
          </div>
        </div>
      </section>

      {/* NGHE MAU */}
      <section className="h-sec h-cream" id="nghe-mau">
        <div className="h-wrap">
          <p className="h-eye dark">NGHE & XEM MẪU</p>
          <h2 className="ink">Mỗi dịp, một khoảnh khắc được giữ lại</h2>
          <div className="h-tabs" role="tablist">
            {SAMPLES.map((x, k) => (
              <button key={x.tab} role="tab" aria-selected={k === tab} onClick={() => setTab(k)}>
                {x.tab}
              </button>
            ))}
          </div>
          <div className="h-sample" role="tabpanel">
            <div className="h-cover" style={{backgroundImage: `url('${s.img}')`}}>
              <div><small>{s.for}</small><h4>{s.title}</h4></div>
            </div>
            <div className="h-sinfo">
              <div className="tags">{s.tags.map(t => <span key={t}>{t}</span>)}</div>
              <p className="h-lyric">
                {s.lyric.map((l, i) => (
                  <span key={i}>{l}<br /></span>
                ))}
              </p>
              <ul>{s.pts.map(p => <li key={p}>{p}</li>)}</ul>
              {s.audio && <audio ref={sampleRef} src={s.audio} preload="none" onEnded={() => setIsSampleOn(false)} />}
              <button className="h-play" onClick={toggleSample}>
                {isSampleOn ? '❚❚ Đang phát' : s.audio ? '▶ Nghe bài mẫu' : '▶ Nghe giai điệu mẫu'}
              </button>
              <button className="h-cta" onClick={() => start({occ: s.occ, rel: s.rel})}>Tạo bài cho dịp này →</button>
              <p className="h-small dark">
                {s.audio
                  ? 'Bài mẫu thật do Sol Songs tạo (lời khác với lời minh hoạ ở trên).'
                  : 'Lời mẫu minh hoạ; giai điệu nền không lời được tạo ngay trong trình duyệt.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DIP TANG */}
      <section className="h-sec" id="dip-tang">
        <div className="h-wrap">
          <p className="h-eye dark">DỊP NÀO CŨNG CÓ KHOẢNH KHẮC</p>
          <h2 className="ink">Bài hát và thước phim cho mọi dịp</h2>
          <OccGrid onPick={start} />
        </div>
      </section>

      {/* CAM KET */}
      <section className="h-sec h-cream">
        <div className="h-wrap">
          <div className="h-promise">
            <article><b>🎧</b><h3>Nghe trước, trả sau</h3><p>Nghe thử bài hát và xem thử MV trước khi thanh toán.</p></article>
            <article><b>↺</b><h3>Sửa đến khi ưng</h3><p>Chỉnh lời, đổi giọng, đổi cảnh miễn phí.</p></article>
            <article><b>✓</b><h3>Hoàn tiền</h3><p>Nếu bản cuối vẫn chưa chạm được bạn.</p></article>
            <article><b>🔒</b><h3>Kỷ niệm là của riêng bạn</h3><p>Câu chuyện và ảnh chỉ dùng để làm bài hát của bạn.</p></article>
          </div>
        </div>
      </section>

      {/* HOI DAP */}
      <section className="h-sec" id="hoi-dap">
        <div className="h-wrap h-faqwrap">
          <div>
            <p className="h-eye dark">HỎI ĐÁP</p>
            <h2 className="ink">Điều bạn có thể đang băn khoăn</h2>
            <p className="h-small dark">Còn câu hỏi khác? Viết cho chúng tôi qua trang hỗ trợ.</p>
          </div>
          <div className="h-faq">
            {FAQ.map(([q, a], i) => (
              <details key={q}>
                <summary><span>{String(i + 1).padStart(2, '0')}</span>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA CUOI */}
      <section className="h-final">
        <div className="h-wrap">
          <h2>
            Đừng để khoảnh khắc đẹp
            <br />
            <em>chỉ còn là trí nhớ.</em>
          </h2>
          <p className="h-tagline center">Sound you can see.</p>
          <p>Một bài hát mang tên người ấy. Một thước phim kể lại câu chuyện của hai người.</p>
          <button className="h-cta big" onClick={() => start()}>Tạo bài hát & thước phim →</button>
          <Trust center />
        </div>
      </section>

      <footer className="h-foot">
        <div className="h-wrap h-footin">
          <div>
            <Logo light />
            <p>
              <b className="h-foot-tag">Sound you can see.</b>
              <br />
              Mỗi khoảnh khắc, một khúc ca, một thước phim.
            </p>
          </div>
          <div>
            <h4>Khám phá</h4>
            <a href="#y-tuong">Ý tưởng</a>
            <a href="#cach-lam">Cách hoạt động</a>
            <a href="#nghe-mau">Nghe mẫu</a>
            <a href="#dip-tang">Dịp tặng</a>
          </div>
          <div>
            <h4>Bắt đầu</h4>
            <button className="linkish" onClick={() => start()}>Tạo bài hát</button>
          </div>
          <div>
            <h4>Thông tin</h4>
            <span>Điều khoản</span>
            <span>Chính sách bảo mật</span>
            <span>Chính sách hoàn tiền</span>
          </div>
        </div>
        <p className="h-copy">© 2026 Sol Songs · Lời, nhạc và hình được tạo với sự hỗ trợ của AI.</p>
      </footer>
    </main>
  );
}

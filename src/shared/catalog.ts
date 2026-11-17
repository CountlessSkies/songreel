// Danh muc lua chon, port tu ref/songreel-studio-v1.03.html. Dung chung cho web va worker.

export type Option = {value: string; label: string};

const opts = (m: Record<string, string>): Option[] =>
  Object.entries(m).map(([value, label]) => ({value, label}));

export const RELS: Record<string, string> = {
  chong: 'Chồng', vo: 'Vợ', nguoi_yeu_nu: 'Bạn gái', nguoi_yeu_nam: 'Bạn trai',
  con_trai: 'Con trai', con_gai: 'Con gái', bo: 'Bố / Ba', me: 'Mẹ / Má',
  ong_ba: 'Ông / Bà', chau: 'Cháu', anh_chi_em: 'Anh / Chị / Em', ban_than: 'Bạn thân',
  thay_co: 'Thầy / Cô', ban_than_minh: 'Cho chính mình', khac: 'Người khác',
};

export const OCCASIONS: Record<string, string> = {
  sinh_nhat: 'Sinh nhật', ky_niem: 'Kỷ niệm ngày cưới / ngày yêu', dam_cuoi: 'Đám cưới',
  ngay_cua_me: 'Ngày của Mẹ / 8-3 / 20-10', tet: 'Tết', cam_on: 'Cảm ơn', xin_loi: 'Xin lỗi',
  tot_nghiep: 'Tốt nghiệp', yeu_xa: 'Yêu xa', tuong_nho: 'Tưởng nhớ', khong_ly_do: 'Không cần lý do',
};

/** [nhan, BPM, style tieng Anh gui Suno] */
export const GENRES: Record<string, [string, number, string]> = {
  ballad: ['Ballad Việt', 72, 'Vietnamese pop ballad, emotional piano, lush strings, slow build, heartfelt, Vietnamese vocals'],
  pop: ['Pop Việt', 104, 'V-pop, modern Vietnamese pop, catchy chorus, bright synths, clean drums, Vietnamese vocals'],
  acoustic: ['Acoustic', 88, 'Vietnamese acoustic pop, fingerstyle guitar, soft piano, intimate, warm, Vietnamese vocals'],
  indie: ['Indie Việt', 78, 'Vietnamese indie pop, dreamy guitars, soft drums, nostalgic, youthful, Vietnamese vocals'],
  lofi: ['Lofi chill', 76, 'Vietnamese lofi pop, dusty keys, mellow beat, cozy, Vietnamese vocals'],
  rnb: ['R&B', 84, 'Vietnamese R&B, smooth groove, warm bass, electric piano, romantic, Vietnamese vocals'],
  edm: ['EDM / Remix', 120, 'Vietnamese EDM pop remix, vinahouse influence, festive drops, bright synths, clear Vietnamese vocals'],
  bolero: ['Bolero', 66, 'Vietnamese bolero, nylon guitar, slow rumba rhythm, nostalgic, Vietnamese vocals'],
  rap: ['Rap Việt', 90, 'Vietnamese melodic rap, warm boom bap beat, sung hook, clear flow, Vietnamese vocals'],
  kids: ['Nhạc thiếu nhi', 112, "Vietnamese children's song, playful, ukulele, xylophone, claps, simple melody, Vietnamese vocals"],
  dan_ca: ['Dân ca đương đại', 76, 'contemporary Vietnamese folk, dan tranh, bamboo flute, modern pads, Vietnamese vocals'],
  lullaby: ['Hát ru', 64, 'Vietnamese modern lullaby, soft guitar, gentle piano, humming, very slow, tender, Vietnamese vocals'],
};

export const VOICES: Record<string, string> = {
  female: 'Giọng nữ', male: 'Giọng nam', duet: 'Song ca', auto: 'Chọn giúp tôi',
};

export const TEMPOS: Record<string, [string, number]> = {
  cham: ['Chậm', 0.85], vua: ['Vừa', 1], nhanh: ['Nhanh', 1.15],
};

export const MOODS: Record<string, [string, string]> = {
  cam_dong: ['Cảm động', 'heartfelt, emotional'],
  vui_tuoi: ['Vui tươi', 'joyful, uplifting'],
  lang_man: ['Lãng mạn', 'romantic, tender'],
  hoai_niem: ['Hoài niệm', 'nostalgic, bittersweet'],
  binh_yen: ['Bình yên', 'calm, peaceful'],
};

export const DECADES: Record<string, [string, string]> = {
  '1990s': ['Thập niên 90', '90s production'],
  '2000s': ['Thập niên 2000', '2000s pop production'],
  '2010s': ['Thập niên 2010', '2010s production'],
  '2020s': ['Hiện đại', 'modern 2020s production'],
};

export const INSTRUMENTS: Record<string, [string, string]> = {
  auto: ['Để AI chọn', ''],
  piano: ['Piano', 'piano lead'],
  guitar: ['Guitar', 'acoustic guitar lead'],
  strings: ['Dàn dây', 'string section'],
  dan_tranh: ['Đàn tranh', 'dan tranh lead'],
};

export const VOCAL_STYLE: Record<string, string> = {
  female: 'warm female vocals', male: 'warm male vocals', duet: 'male and female duet',
};

/** [cach goi nguoi nhan, cach xung cua nguoi hat] */
export const PRON: Record<string, [string, string]> = {
  me: ['mẹ', 'con'], bo: ['bố', 'con'], vo: ['em', 'anh'], chong: ['anh', 'em'],
  nguoi_yeu_nu: ['em', 'anh'], nguoi_yeu_nam: ['anh', 'em'], con_gai: ['con', 'mẹ'],
  con_trai: ['con', 'bố'], ong_ba: ['ông bà', 'cháu'], chau: ['cháu', 'ông bà'],
  anh_chi_em: ['người', 'mình'], ban_than: ['cậu', 'tớ'], thay_co: ['thầy cô', 'em'],
  ban_than_minh: ['mình', 'ta'], khac: ['người', 'tôi'],
};

export const relOptions = opts(RELS);
export const occOptions = opts(OCCASIONS);
export const genreOptions: Option[] = Object.entries(GENRES).map(([value, g]) => ({value, label: g[0]}));
export const voiceOptions = opts(VOICES);
export const tempoOptions: Option[] = Object.entries(TEMPOS).map(([value, t]) => ({value, label: t[0]}));
export const moodOptions: Option[] = Object.entries(MOODS).map(([value, m]) => ({value, label: m[0]}));
export const decadeOptions: Option[] = Object.entries(DECADES).map(([value, d]) => ({value, label: d[0]}));
export const instOptions: Option[] = Object.entries(INSTRUMENTS).map(([value, i]) => ({value, label: i[0]}));

/** Model viet loi khach chon. Nhan xet lay tu benchmark 17/11/2026 (/bench). */
export const WRITERS = {
  sol: {label: 'GPT-6.1 Sol', model: 'openai/gpt-6.1-sol', description: 'Vần đều, xưng hô chuẩn nhất. Chậm hơn (~40 giây).'},
  claude: {label: 'Claude Sonnet 5.5', model: 'anthropic/claude-sonnet-5.5', description: 'Hình ảnh đời thường, giàu cảm xúc. Nhanh (~10 giây).'},
  gemini: {label: 'Gemini 4 Hydrogen', model: 'google/gemini-4-hydrogen', description: 'Nhanh nhất (~5 giây), lời đơn giản hơn.'},
} as const;
export type WriterKey = keyof typeof WRITERS;
export const writerOptions: Option[] = Object.entries(WRITERS).map(([value, w]) => ({value, label: w.label}));

export type Answers = {
  writer: WriterKey;
  rel: string;
  name: string;
  occ: string;
  genre: string;
  voice: string;
  tempo: string;
  mood: string;
  decade: string;
  inst: string;
  qualities: string;
  memories: string;
  dedication: string;
  sender: string;
  email: string;
  phone: string;
};

export const EMPTY_ANSWERS: Answers = {
  writer: 'sol',
  rel: '', name: '', occ: '', genre: '', voice: '',
  tempo: 'vua', mood: 'cam_dong', decade: '2020s', inst: 'auto',
  qualities: '', memories: '', dedication: '', sender: '', email: '', phone: '',
};

/** Trang thai don hang ma API tra ve cho client. */
export type AgentKey = 'brief' | 'lyricist' | 'critic' | 'director' | 'producer' | 'qc';

export const AGENTS: {key: AgentKey; label: string; description: string}[] = [
  {key: 'brief', label: 'Đọc câu chuyện', description: 'Chuẩn hoá bảng hỏi, kiểm tra nội dung'},
  {key: 'lyricist', label: 'Viết lời', description: 'Viết lời tiếng Việt từ kỷ niệm của bạn'},
  {key: 'critic', label: 'Soát lời', description: 'Kiểm tra số câu, vần, tên trong điệp khúc'},
  {key: 'director', label: 'Chọn phong cách', description: 'Thể loại, nhịp độ, giọng hát'},
  {key: 'producer', label: 'Thu âm', description: 'Hát và hoà âm 2 bản khác nhau'},
  {key: 'qc', label: 'Kiểm tra âm thanh', description: 'Lưu bài và chọn bản tốt nhất'},
];

export type OrderStatus = 'running' | 'ready' | 'failed';

export type LyricSection = {name: string; kind: 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'outro'; lines: string[]};

export type Take = {audioUrl: string; coverUrl: string | null; durationSec: number | null};

export type OrderView = {
  id: string;
  writer: WriterKey;
  round: number;
  critic: {score: number; issues: string[]; notes: string[]} | null;
  status: OrderStatus;
  stage: AgentKey;
  error: string | null;
  title: string | null;
  recipient: string;
  lyrics: LyricSection[] | null;
  takes: Take[];
  createdAt: number;
};

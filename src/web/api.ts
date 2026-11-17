import type {AgentKey, Answers, OrderView} from '../shared/catalog';

// ?mock=1: gia lap don hang (khong goi AI, khong ton tien), dung de demo giao dien.
export const MOCK = new URLSearchParams(location.search).has('mock');

const MOCK_STAGES: {stage: AgentKey; ms: number}[] = [
  {stage: 'brief', ms: 1200},
  {stage: 'lyricist', ms: 3500},
  {stage: 'critic', ms: 1500},
  {stage: 'director', ms: 1000},
  {stage: 'producer', ms: 6000},
  {stage: 'qc', ms: 1500},
];

const mockOrders = new Map<string, {answers: Answers; start: number}>();

export async function createOrder(answers: Answers, passcode: string): Promise<{id: string}> {
  if (MOCK) {
    const id = Math.random().toString(36).slice(2, 10);
    mockOrders.set(id, {answers, start: Date.now()});
    return {id};
  }
  const r = await fetch('/api/orders', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Passcode': passcode},
    body: JSON.stringify(answers),
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as {error?: string} | null)?.error ?? `Lỗi ${r.status}`);
  return r.json();
}

export async function getOrder(id: string): Promise<OrderView> {
  if (MOCK) return mockView(id);
  const r = await fetch(`/api/orders/${id}`);
  if (!r.ok) throw new Error(`Lỗi ${r.status}`);
  return r.json();
}

function mockView(id: string): OrderView {
  const o = mockOrders.get(id);
  if (!o) throw new Error('Không tìm thấy đơn');
  let t = Date.now() - o.start;
  let stage: AgentKey = 'qc';
  let done = true;
  for (const s of MOCK_STAGES) {
    if (t < s.ms) {
      stage = s.stage;
      done = false;
      break;
    }
    t -= s.ms;
  }
  const name = o.answers.name.trim() || 'Lan';
  return {
    id,
    writer: o.answers.writer,
    round: 1,
    critic: done ? {score: 96, issues: [], notes: []} : null,
    status: done ? 'ready' : 'running',
    stage,
    error: null,
    title: 'Mẹ Ơi, Mừng Sinh Nhật',
    recipient: name,
    createdAt: o.start,
    lyrics: done ? MOCK_LYRICS : null,
    takes: done
      ? [
          {audioUrl: '/mock/take1.mp3', coverUrl: '/mock/cover1.jpg', durationSec: 192},
          {audioUrl: '/mock/take2.mp3', coverUrl: '/mock/cover2.jpg', durationSec: 215},
        ]
      : [],
  };
}

const MOCK_LYRICS: OrderView['lyrics'] = [
  {name: 'Verse 1', kind: 'verse', lines: [
    'Sáng nay nắng vàng trên hiên nhà',
    'Con nhớ bàn tay mẹ hiền hoà',
    'Bao năm tóc mẹ thêm sợi bạc',
    'Vẫn dịu dàng như những ngày xa',
  ]},
  {name: 'Pre-Chorus', kind: 'prechorus', lines: [
    'Ngày mẹ sinh ra, ngày con biết thương',
    'Một lời cảm ơn, gửi trọn yêu thương',
  ]},
  {name: 'Chorus', kind: 'chorus', lines: [
    'Mẹ Lan ơi, mừng sinh nhật mẹ',
    'Con hát bài này thay lời con nhé',
    'Dẫu mai đi xa trăm ngàn lối rẽ',
    'Lòng con vẫn về bên mẹ Lan ơi',
  ]},
  {name: 'Verse 2', kind: 'verse', lines: [
    'Nhớ bát canh chua chiều mưa bay',
    'Nhớ tiếng ru hời bên vai gầy',
    'Con lớn lên trong vòng tay ấy',
    'Hôm nay con muốn nói điều này',
  ]},
  {name: 'Chorus', kind: 'chorus', lines: [
    'Mẹ Lan ơi, mừng sinh nhật mẹ',
    'Con hát bài này thay lời con nhé',
    'Dẫu mai đi xa trăm ngàn lối rẽ',
    'Lòng con vẫn về bên mẹ Lan ơi',
  ]},
  {name: 'Outro', kind: 'outro', lines: ['Mẹ Lan ơi, con thương mẹ nhiều']},
];

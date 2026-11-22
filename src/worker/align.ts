// Moc thoi gian tung cau hat: Whisper (OpenAI) nghe ban thu kem loi lam goi y, roi can ket qua vao loi co san.
// Whisper hay bia chu o doan nhac khong loi, nen chi lay moc cua nhung tu khop voi loi va noi suy phan con lai.
// Chia canh MV (ban Pro) theo moc do: moi canh 4-15s, vua voi clip Seedance.

export type TimedWord = {word: string; start: number; end: number};
export type LyricLine = {section: string; text: string; chorus: boolean};
export type TimedLine = LyricLine & {start: number; end: number; measured: boolean};

const SEC_PER_SYLLABLE = 0.42;
const MIN_MATCH_RATIO = 0.35;

/** Chu thuong, bo dau cau va ky hieu la (Whisper hay chen ky hieu nhac). */
const norm = (w: string) => w.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '');
/** Bo dau thanh va dau chu de so khop long hon (Whisper hay nghe nham dau). */
const bare = (w: string) => w.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

/**
 * Can loi vao cac tu Whisper nghe duoc (quy hoach dong, giu dung thu tu).
 * Tra null neu khop qua it (khi do dung moc uoc luong).
 */
export function alignLyrics(lines: LyricLine[], words: TimedWord[], duration: number): TimedLine[] | null {
  const lyr = lines.flatMap((l, li) => l.text.split(/\s+/).map(norm).filter(Boolean).map((n, k) => ({li, k, n, b: bare(n)})));
  const heard = words
    .map(w => ({n: norm(w.word), start: Math.max(w.start, w.end - 1.2), end: w.end}))
    .filter(w => w.n)
    .map(w => ({...w, b: bare(w.n)}));
  if (!lyr.length || !heard.length) return null;

  const n = lyr.length;
  const m = heard.length;
  const score = (i: number, j: number) => (lyr[i].n === heard[j].n ? 2 : lyr[i].b === heard[j].b ? 1 : 0);
  const dp = Array.from({length: n + 1}, () => new Float32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = score(i - 1, j - 1);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], s ? dp[i - 1][j - 1] + s : 0);
    }
  }
  // Truy vet: tu loi thu i khop tu nghe duoc thu j
  const match = new Array<number>(n).fill(-1);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const s = score(i - 1, j - 1);
    if (s && dp[i][j] === dp[i - 1][j - 1] + s) {
      match[i - 1] = j - 1;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }

  // Moc tung cau tu cac tu da khop. Can it nhat 2 tu va 30% so tu cua cau de tranh khop nham tu pho bien.
  const out: (TimedLine | null)[] = lines.map((l, li) => {
    const toks = lyr.filter(t => t.li === li);
    const hits = toks.filter(t => match[lyr.indexOf(t)] >= 0);
    if (hits.length < Math.max(2, Math.ceil(toks.length * 0.3))) return null;
    const first = hits[0];
    const last = hits[hits.length - 1];
    const start = heard[match[lyr.indexOf(first)]].start - first.k * SEC_PER_SYLLABLE;
    const end = heard[match[lyr.indexOf(last)]].end + (toks.length - 1 - last.k) * SEC_PER_SYLLABLE;
    return {...l, start: Math.max(0, start), end: Math.min(duration, end), measured: true};
  });
  // Bo cau di nguoc thu tu thoi gian
  let prev = -1;
  for (let i = 0; i < out.length; i++) {
    const o = out[i];
    if (!o) continue;
    if (o.start < prev) out[i] = null;
    else prev = o.start;
  }
  const measured = out.filter(Boolean).length;
  if (measured / lines.length < MIN_MATCH_RATIO) return null;
  return fillGaps(lines, out, duration);
}

/**
 * Noi suy cac cau chua co moc. Do nhip hat that (giay moi chu, tu cac cau lien tiep da do).
 * Neu khoang trong dai hon nhieu so voi can (thuong co doan nhac dao), dat cac cau sat truoc cau da do ke tiep.
 */
function fillGaps(lines: LyricLine[], out: (TimedLine | null)[], duration: number): TimedLine[] {
  const syl = (i: number) => Math.max(3, lines[i].text.split(/\s+/).length);
  const paces: number[] = [];
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (a && b) paces.push((b.start - a.start) / syl(i));
  }
  paces.sort((x, y) => x - y);
  const pace = paces.length ? Math.min(2, Math.max(0.5, paces[Math.floor(paces.length / 2)])) : SEC_PER_SYLLABLE * 1.6;
  const res: TimedLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (out[i]) {
      res.push(out[i]!);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && !out[j]) j++;
    const from = i > 0 ? res[i - 1].end : null;
    const to = j < lines.length ? out[j]!.start : null;
    const syls = Array.from({length: j - i}, (_, k) => syl(i + k));
    const total = syls.reduce((x, y) => x + y, 0);
    let a: number;
    let b: number;
    const need = total * pace;
    if (from !== null && to !== null) [a, b] = [to - from > need * 1.3 ? to - need : from, Math.max(from, to)];
    else if (to !== null) [a, b] = [Math.max(0, to - need), to];
    else [a, b] = [from!, Math.min(duration, from! + need)];
    let t = a;
    for (let k = 0; k < syls.length; k++) {
      const len = ((b - a) * syls[k]) / total;
      res.push({...lines[i + k], start: t, end: t + len, measured: false});
      t += len;
    }
    i = j;
  }
  return res;
}

/** Moc uoc luong khi khong do duoc: giong hat chiem 8%..94% bai, chia theo so tu (giong planScenes). */
export function estimateLines(lines: LyricLine[], duration: number): TimedLine[] {
  const a = duration * 0.08;
  const b = duration * 0.94;
  const w = lines.map(l => Math.max(3, l.text.split(/\s+/).length));
  const total = w.reduce((x, y) => x + y, 0);
  let t = a;
  return lines.map((l, i) => {
    const len = ((b - a) * w[i]) / total;
    const r = {...l, start: t, end: t + len, measured: false};
    t += len;
    return r;
  });
}

export type Shot = {
  start: number;
  end: number;
  section: string;
  lines: string[];
  lineTimes: [number, number][];
  chorus: boolean;
};

const MIN_SHOT = 4;
const MAX_SHOT = 15;
const SPLIT_SHOT = 12;

/** Chia bai thanh canh theo moc cau hat: moi cau 1 canh, doan nhac dai thanh canh rieng, canh qua ngan gop voi canh sau. */
export function planShots(lines: TimedLine[], duration: number): Shot[] {
  const segs: Shot[] = [];
  const pushGap = (a: number, b: number, section: string) => {
    if (b - a > 0.05) segs.push({start: a, end: b, section, lines: [], lineTimes: [], chorus: false});
  };
  pushGap(0, lines[0]?.start ?? duration, 'Mở đầu');
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    const stop = next ? next.start : duration;
    // Khoang lang ngan sau cau thuoc ve cau do; dai hon 4s thi thanh canh nhac dao rieng
    const hold = stop - l.end <= MIN_SHOT ? stop : Math.min(stop, l.end + 1);
    segs.push({start: l.start, end: hold, section: l.section, lines: [l.text], lineTimes: [[l.start, l.end]], chorus: l.chorus});
    if (hold < stop) pushGap(hold, stop, next ? 'Nhạc dạo' : 'Kết');
  });

  // Gop canh ngan hon 4s vao canh sau (hoac canh truoc neu la canh cuoi)
  const merged: Shot[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.end - last.start < MIN_SHOT && s.end - last.start <= MAX_SHOT) {
      last.end = s.end;
      last.lines.push(...s.lines);
      last.lineTimes.push(...s.lineTimes);
      last.chorus ||= s.chorus;
      if (!last.lines.length || last.section === 'Mở đầu') last.section = s.lines.length ? s.section : last.section;
    } else merged.push({...s, lines: [...s.lines], lineTimes: [...s.lineTimes]});
  }
  const tail = merged[merged.length - 1];
  if (merged.length > 1 && tail.end - tail.start < MIN_SHOT) {
    const prevShot = merged[merged.length - 2];
    prevShot.end = tail.end;
    prevShot.lines.push(...tail.lines);
    prevShot.lineTimes.push(...tail.lineTimes);
    merged.pop();
  }

  // Tach canh dai hon 15s thanh cac doan bang nhau ~12s
  const out: Shot[] = [];
  for (const s of merged) {
    const len = s.end - s.start;
    if (len <= MAX_SHOT) {
      out.push(s);
      continue;
    }
    const k = Math.ceil(len / SPLIT_SHOT);
    for (let p = 0; p < k; p++) {
      const a = s.start + (len * p) / k;
      const b = s.start + (len * (p + 1)) / k;
      const inside = s.lineTimes.map((lt, idx) => ({lt, text: s.lines[idx]})).filter(x => x.lt[0] >= a - 0.01 && x.lt[0] < b);
      out.push({...s, start: a, end: b, lines: inside.map(x => x.text), lineTimes: inside.map(x => x.lt)});
    }
  }
  return out;
}

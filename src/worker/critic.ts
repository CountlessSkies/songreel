// Cham loi, port nguyen luat tu prototype v1.03 (critique()).
import type {LyricSection} from '../shared/catalog';

const TONES: Record<string, string> = {'́': 'sắc', '̀': 'huyền', '̉': 'hỏi', '̃': 'ngã', '̣': 'nặng'};
const INITIALS = ['ngh', 'ng', 'nh', 'ch', 'tr', 'th', 'ph', 'kh', 'gh', 'gi', 'qu', 'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l',
  'm', 'n', 'p', 'r', 's', 't', 'v', 'x'];

const toneOf = (w: string) => {
  for (const ch of w.toLowerCase().normalize('NFD')) if (TONES[ch]) return TONES[ch];
  return 'ngang';
};

const rhymeKey = (w: string) => {
  const b = [...w.toLowerCase().normalize('NFD')]
    .filter(c => !TONES[c])
    .join('')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]/gu, '');
  for (const i of INITIALS) if (b.startsWith(i) && b.length > i.length) return b.slice(i.length);
  return b;
};

const lastWord = (l: string) => l.trim().split(/\s+/).pop() ?? '';

export type Critique = {issues: string[]; notes: string[]; score: number; rhyme: number; flat: number};

export function critique(sections: LyricSection[], name: string): Critique {
  const issues: string[] = [];
  const notes: string[] = [];
  const sung = sections.flatMap(s => s.lines);
  if (sung.length < 10) issues.push(`chỉ có ${sung.length} câu (cần ≥10)`);
  // Songs stay under 1:30 so the MV stays cheap: at most 12 sung lines
  if (sung.length > 12) issues.push(`có ${sung.length} câu, bài phải ngắn (tối đa 12 câu)`);
  const long = sung.filter(l => l.split(/\s+/).length > 12);
  if (long.length) issues.push(`${long.length} câu dài hơn 12 chữ`);
  const last = name.trim().split(/\s+/).pop()!.toLowerCase();
  const chorus = sections.filter(s => s.kind === 'chorus').flatMap(s => s.lines);
  if (!chorus.some(l => l.toLowerCase().includes(last))) issues.push('điệp khúc chưa có tên người nhận');
  let pairs = 0;
  let rh = 0;
  for (const s of sections)
    for (let i = 0; i + 1 < s.lines.length; i += 2) {
      pairs++;
      const ka = rhymeKey(lastWord(s.lines[i]));
      const kc = rhymeKey(lastWord(s.lines[i + 1]));
      if (ka === kc || (ka && kc && ka.slice(-1) === kc.slice(-1))) rh++;
    }
  const rhyme = pairs ? rh / pairs : 0;
  if (rhyme < 0.3) notes.push(`ít vần (${rh}/${pairs} cặp câu)`);
  const ends = sung.map(l => toneOf(lastWord(l)));
  const flat = ends.filter(t => t === 'ngang' || t === 'huyền').length / (ends.length || 1);
  if (flat < 0.5) notes.push(`chỉ ${Math.round(flat * 100)}% câu kết thanh bằng`);
  const score = Math.round(Math.max(0, 100 - 25 * issues.length - 5 * notes.length) * (0.8 + 0.2 * rhyme));
  return {issues, notes, score, rhyme, flat};
}

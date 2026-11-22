// Kiem tra can loi + chia canh tren 1 ket qua Whisper that (verbose_json co words).
// Chay: node --experimental-strip-types tools/align_check.ts <whisper.json> <lyrics.txt> <duration-sec>
import {readFileSync} from 'node:fs';
import {alignLyrics, estimateLines, planShots, type LyricLine} from '../src/worker/align.ts';

const [whisperPath, lyricsPath, durArg] = process.argv.slice(2);
const res = JSON.parse(readFileSync(whisperPath, 'utf8'));
const duration = Number(durArg);
const lines: LyricLine[] = readFileSync(lyricsPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map(text => ({section: '', text, chorus: false}));

const timed = alignLyrics(lines, res.words ?? [], duration);
const used = timed ?? estimateLines(lines, duration);
console.log(timed ? 'aligned' : 'FALLBACK to estimate', `${used.filter(l => l.measured).length}/${lines.length} lines measured`);
for (const l of used) console.log(`${l.measured ? '✓' : '·'} ${l.start.toFixed(1).padStart(6)}-${l.end.toFixed(1).padStart(6)}  ${l.text}`);
const shots = planShots(used, duration);
console.log(`\n${shots.length} shots`);
for (const s of shots) console.log(`${s.start.toFixed(1).padStart(6)}-${s.end.toFixed(1).padStart(6)} (${(s.end - s.start).toFixed(1)}s) ${s.section || '-'} | ${s.lines.join(' / ')}`);

// OpenAI Whisper (whisper-1): lay moc thoi gian tung tu cua ban thu. Chi whisper-1 tra duoc moc tung tu.
import type {TimedWord} from './align';

const PROMPT_MAX_CHARS = 1000;

/** Nghe ban thu tieng Viet, dua loi bai lam goi y (giam bia chu rat nhieu). Gioi han file cua OpenAI la 25MB. */
export async function transcribeWords(apiKey: string, audio: ArrayBuffer, mime: string, lyricsHint: string): Promise<TimedWord[]> {
  const fd = new FormData();
  fd.set('file', new Blob([audio], {type: mime}), mime.includes('mp4') ? 'song.m4a' : mime.includes('wav') ? 'song.wav' : 'song.mp3');
  fd.set('model', 'whisper-1');
  fd.set('language', 'vi');
  fd.set('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'word');
  if (lyricsHint) fd.set('prompt', lyricsHint.slice(0, PROMPT_MAX_CHARS));
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {Authorization: `Bearer ${apiKey}`},
    body: fd,
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Whisper lỗi ${r.status}: ${data.error?.message ?? 'không rõ'}`);
  return (Array.isArray(data.words) ? data.words : []).map((w: any) => ({word: String(w.word), start: Number(w.start), end: Number(w.end)}));
}

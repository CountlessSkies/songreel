// Wordless sample melody for the home page, rendered in the browser (ported from ref/solsongs-v1.6.1.html).

type Bed = {bpm: number; progression: number[][]; type: OscillatorType; upper: number};

export const BEDS: Record<string, Bed> = {
  ballad: {bpm: 80, progression: [[0, 4, 7, 11], [7, 11, 14, 17], [-3, 0, 4, 7], [5, 9, 12, 16]], type: 'sine', upper: 0.095},
  indie: {bpm: 96, progression: [[-3, 0, 4, 7], [5, 9, 12, 16], [0, 4, 7, 11], [7, 11, 14, 17]], type: 'triangle', upper: 0.075},
  piano: {bpm: 64, progression: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-5, -2, 2, 5]], type: 'sine', upper: 0.085},
};

function bedNote(track: OfflineAudioContext, at: number, pitch: number, level: number, length: number, wave: OscillatorType) {
  const o = track.createOscillator();
  const g = track.createGain();
  o.type = wave;
  o.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.033);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(track.destination);
  o.start(at);
  o.stop(at + length);
}

/** Renders `dur` seconds of a looping chord bed. The key is derived from the title so each sample sounds different. */
export async function instrumental(style: Bed, title: string, dur: number): Promise<AudioBuffer> {
  const rate = 44100;
  const track = new OfflineAudioContext(1, Math.ceil(rate * dur), rate);
  const beat = 60 / style.bpm;
  const key = Array.from(title).reduce((s, ch) => s + (ch.codePointAt(0) ?? 0), 0) % 5;
  const pattern = [0, 2, 1, 3, 0, 1, 2, 1];
  for (let bar = 0; bar * beat * 4 < dur; bar++) {
    const start = bar * beat * 4;
    const chord = style.progression[bar % style.progression.length];
    bedNote(track, start, chord[0] + 43 + key, 0.13, beat * 3.8, 'sine');
    bedNote(track, start + 2 * beat, chord[2] + 43 + key, 0.08, beat * 1.75, 'sine');
    pattern.forEach((idx, pos) => {
      const at = start + (pos * beat) / 2;
      if (at < dur - 0.12) bedNote(track, at, chord[idx] + 55 + key, style.upper, beat * 1.35, style.type);
    });
    if (bar >= 2) bedNote(track, start + beat, chord[bar % 3] + 67 + key, 0.065, beat * 2.8, 'sine');
  }
  const buf = await track.startRendering();
  const ch = buf.getChannelData(0);
  const fade = rate * 0.85;
  for (let i = 0; i < fade; i++) ch[ch.length - i - 1] *= i / fade;
  return buf;
}

import { audio } from "./engine";

/**
 * Little synthesized instruments, tuned to C major pentatonic so everything harmonizes with the music.
 * Each takes an optional gain (0..1) and pan (−1..1) so four fishers' sounds sit apart in the mix.
 */
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];
export const note = (i: number) => PENTA[((i % 5) + 5) % 5]! * 2 ** Math.floor(i / 5);

type Opts = { gain?: number; pan?: number; at?: number };

function chain(gain: number, pan: number): { ctx: AudioContext; node: AudioNode; t: number } | null {
  const a = audio();
  if (!a) return null;
  const g = a.ctx.createGain();
  g.gain.value = gain;
  const p = a.ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p).connect(a.out);
  return { ctx: a.ctx, node: g, t: a.ctx.currentTime };
}

function tone(freq: number, dur: number, opts: Opts & { type?: OscillatorType; attack?: number; bend?: number } = {}): void {
  const c = chain(opts.gain ?? 0.3, opts.pan ?? 0);
  if (!c) return;
  const t = c.t + (opts.at ?? 0);
  const o = c.ctx.createOscillator();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t);
  if (opts.bend) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.bend), t + dur);
  const e = c.ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(1, t + (opts.attack ?? 0.008));
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(e).connect(c.node);
  o.start(t);
  o.stop(t + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function whoosh(dur: number, from: number, to: number, opts: Opts & { q?: number } = {}): void {
  const c = chain(opts.gain ?? 0.3, opts.pan ?? 0);
  if (!c) return;
  const t = c.t + (opts.at ?? 0);
  const src = c.ctx.createBufferSource();
  src.buffer = noise(c.ctx);
  const f = c.ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = opts.q ?? 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const e = c.ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(1, t + Math.min(0.03, dur / 4));
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(e).connect(c.node);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  tap: (o: Opts = {}) => tone(note(7), 0.08, { gain: 0.18, type: "triangle", ...o }),
  nope: (o: Opts = {}) => tone(note(2), 0.14, { gain: 0.12, type: "triangle", bend: 0.8, ...o }),
  cast: (o: Opts = {}) => whoosh(0.45, 600, 2400, { gain: 0.25, q: 0.8, ...o }),
  plop: (o: Opts = {}) => {
    tone(420, 0.16, { gain: 0.35, bend: 2.2, ...o });
    whoosh(0.18, 1200, 500, { gain: 0.12, ...o, at: (o.at ?? 0) + 0.02 });
  },
  nibble: (o: Opts = {}) => tone(520, 0.07, { gain: 0.14, bend: 1.6, ...o }),
  bite: (o: Opts = {}) => {
    whoosh(0.5, 2500, 400, { gain: 0.45, q: 0.6, ...o });
    tone(note(9), 0.25, { gain: 0.3, type: "triangle", ...o, at: (o.at ?? 0) + 0.02 });
    tone(note(11), 0.35, { gain: 0.3, type: "triangle", ...o, at: (o.at ?? 0) + 0.12 });
  },
  reelClick: (o: Opts = {}) => whoosh(0.03, 3500, 3000, { gain: 0.16, q: 6, ...o }),
  thrash: (o: Opts = {}) => whoosh(0.3, 1800, 700, { gain: 0.3, q: 0.7, ...o }),
  missed: (o: Opts = {}) => {
    whoosh(0.35, 1500, 600, { gain: 0.25, ...o });
    tone(note(6), 0.4, { gain: 0.14, type: "triangle", bend: 0.6, ...o, at: (o.at ?? 0) + 0.1 });
  },
  catch: (o: Opts = {}) => {
    whoosh(0.4, 3000, 900, { gain: 0.35, q: 0.6, ...o });
    [5, 7, 9, 12].forEach((n, i) => tone(note(n), 0.35, { gain: 0.22, type: "triangle", ...o, at: (o.at ?? 0) + 0.1 + i * 0.07 }));
  },
  newFish: (o: Opts = {}) => {
    [7, 9, 10, 12, 14, 17].forEach((n, i) => tone(note(n), 0.5, { gain: 0.2, type: "sine", ...o, at: (o.at ?? 0) + 0.45 + i * 0.08 }));
    tone(note(5), 1.2, { gain: 0.16, type: "triangle", ...o, at: (o.at ?? 0) + 0.45 });
  },
  junk: (o: Opts = {}) => tone(180, 0.35, { gain: 0.3, type: "triangle", bend: 0.5, ...o }),
  upgrade: (o: Opts = {}) => {
    [0, 2, 4, 5, 7, 10].forEach((n, i) => tone(note(n + 5), 0.6, { gain: 0.22, type: "triangle", ...o, at: (o.at ?? 0) + i * 0.11 }));
  },
  golden: (o: Opts = {}) => {
    [12, 14, 16, 19].forEach((n, i) => tone(note(n), 0.9, { gain: 0.12, type: "sine", ...o, at: (o.at ?? 0) + i * 0.15 }));
  },
};

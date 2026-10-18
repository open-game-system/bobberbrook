import { audio } from "./engine";

/**
 * Little synthesized instruments, tuned to C major pentatonic so everything harmonizes with the music.
 * Each takes an optional gain (0..1) and pan (−1..1) so four fishers' sounds sit apart in the mix.
 */
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];
export const note = (i: number) => PENTA[((i % 5) + 5) % 5]! * 2 ** Math.floor(i / 5);

type Opts = { gain?: number; pan?: number; at?: number };

/** Effects sit about 8 dB under where they were (round 00: catch stings jumped ~17 dB over the bed). */
let SFX_TRIM = 0.4;
/** A controller's own effects play close to the ear, alone: it sets a louder trim. */
export function setSfxTrim(trim: number): void {
  SFX_TRIM = trim;
}

/** Every effect goes through one gentle low-pass: the bright edges of noise bursts read as clicks on TV speakers. */
let bus: { ctx: AudioContext; node: AudioNode } | null = null;
function sfxBus(a: { ctx: AudioContext; out: AudioNode }): AudioNode {
  if (bus && bus.ctx === a.ctx) return bus.node;
  const lp = a.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 4200;
  lp.Q.value = 0.5;
  // A second pole pair (24 dB/oct in all): round 23 still measured 6–10 kHz flecks on bite and catch onsets.
  const lp2 = a.ctx.createBiquadFilter();
  lp2.type = "lowpass";
  lp2.frequency.value = 3800;
  lp2.Q.value = 0.6;
  lp.connect(lp2).connect(a.out);
  bus = { ctx: a.ctx, node: lp };
  return lp;
}

function chain(gain: number, pan: number): { ctx: AudioContext; node: AudioNode; t: number } | null {
  const a = audio();
  if (!a) return null;
  const g = a.ctx.createGain();
  g.gain.value = gain * SFX_TRIM;
  const p = a.ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p).connect(sfxBus(a));
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
  e.gain.exponentialRampToValueAtTime(1, t + (opts.attack ?? 0.02));
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
  // A soft attack: an instant noise edge reads as a harsh click.
  e.gain.exponentialRampToValueAtTime(1, t + Math.min(0.07, dur / 3));
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(e).connect(c.node);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  tap: (o: Opts = {}) => tone(note(7), 0.08, { gain: 0.18, type: "triangle", ...o }),
  nope: (o: Opts = {}) => tone(note(2), 0.14, { gain: 0.12, type: "triangle", bend: 0.8, ...o }),
  cast: (o: Opts = {}) => whoosh(0.45, 500, 1300, { gain: 0.22, q: 1.2, ...o }),
  plop: (o: Opts = {}) => {
    tone(420, 0.16, { gain: 0.35, bend: 2.2, ...o });
    whoosh(0.18, 1200, 500, { gain: 0.12, ...o, at: (o.at ?? 0) + 0.02 });
  },
  nibble: (o: Opts = {}) => tone(520, 0.07, { gain: 0.14, bend: 1.6, ...o }),
  bite: (o: Opts = {}) => {
    whoosh(0.5, 1000, 300, { gain: 0.42, q: 1.1, ...o });
    tone(note(4), 0.25, { gain: 0.3, type: "sine", attack: 0.025, ...o, at: (o.at ?? 0) + 0.02 });
    tone(note(6), 0.35, { gain: 0.3, type: "sine", attack: 0.025, ...o, at: (o.at ?? 0) + 0.12 });
  },
  // A soft wooden tick (tonal, low): a 3.5 kHz noise tick counted as a harsh click every reel.
  reelClick: (o: Opts = {}) => tone(880, 0.05, { gain: 0.09, type: "triangle", attack: 0.008, ...o }),
  thrash: (o: Opts = {}) => whoosh(0.32, 1100, 500, { gain: 0.28, q: 1.0, ...o }),
  missed: (o: Opts = {}) => {
    whoosh(0.35, 1000, 450, { gain: 0.24, ...o });
    tone(note(6), 0.4, { gain: 0.14, type: "triangle", bend: 0.6, ...o, at: (o.at ?? 0) + 0.1 });
  },
  // Round 25: one soft water bloop and a three-note rise (round 24's five voices plus a noise whoosh, all
  // starting within 0.3 s, measured as 23–36 bright flecks a minute at the Moonwell catches).
  catch: (o: Opts = {}) => {
    // Round 26: an octave up and louder (the low, soft version read as silence under the bed at Mistmarsh).
    tone(330, 0.4, { gain: 0.42, type: "sine", attack: 0.02, bend: 0.6, ...o });
    [5, 7, 9].forEach((n, i) => tone(note(n), 0.6, { gain: 0.4, type: "sine", attack: 0.02, ...o, at: (o.at ?? 0) + 0.1 + i * 0.09 }));
  },
  newFish: (o: Opts = {}) => {
    [5, 7, 10].forEach((n, i) => tone(note(n), 0.7, { gain: 0.2, type: "sine", attack: 0.035, ...o, at: (o.at ?? 0) + 0.5 + i * 0.12 }));
    tone(note(0), 1.2, { gain: 0.14, type: "sine", attack: 0.06, ...o, at: (o.at ?? 0) + 0.5 });
  },
  junk: (o: Opts = {}) => tone(180, 0.35, { gain: 0.3, type: "triangle", bend: 0.5, ...o }),
  upgrade: (o: Opts = {}) => {
    [0, 2, 4, 5, 7, 10].forEach((n, i) => tone(note(n), 0.6, { gain: 0.22, type: "sine", attack: 0.015, ...o, at: (o.at ?? 0) + i * 0.11 }));
  },
  /** Picking up a trail shell: a bright little two-note twinkle. */
  shell: (o: Opts = {}) => {
    tone(note(7), 0.2, { gain: 0.3, type: "sine", attack: 0.012, ...o });
    tone(note(9), 0.3, { gain: 0.3, type: "sine", attack: 0.012, ...o, at: (o.at ?? 0) + 0.07 });
  },
  /** A soft step on moss and earth. */
  step: (o: Opts = {}) => whoosh(0.09, 380, 180, { gain: 0.22, q: 1.4, ...o }),
  golden: (o: Opts = {}) => {
    [7, 9, 11, 14].forEach((n, i) => tone(note(n), 0.9, { gain: 0.12, type: "sine", attack: 0.02, ...o, at: (o.at ?? 0) + i * 0.15 }));
  },
};

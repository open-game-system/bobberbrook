import type { TimeOfDay } from "../../game/daycycle";
import { audio } from "./engine";
import { note } from "./sfx";

/**
 * The TV's soundscape: the lake (soft lapping water, the waterfall far off), birds by day, crickets and
 * an owl at night, and a slow, warm pentatonic tune whose instrument and density follow the time of day.
 */
type Layer = { gain: GainNode };

let started = false;
let water: Layer | null = null;
let night: Layer | null = null;
let musicBus: GainNode | null = null;
let tod: TimeOfDay = "morning";
let timers: number[] = [];

function noiseSource(ctx: AudioContext, seconds: number, brown: boolean): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = brown ? (last + 0.02 * w) / 1.02 : w;
    d[i] = brown ? last * 3.5 : w;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function startWater(ctx: AudioContext, out: AudioNode): Layer {
  const gain = ctx.createGain();
  gain.gain.value = 0.22;
  const lap = noiseSource(ctx, 6, true);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.08;
  const swell = ctx.createGain();
  swell.gain.value = 0.16;
  lfo.connect(lfoGain).connect(swell.gain);
  lap.connect(lp).connect(swell).connect(gain);
  // The waterfall: a steady hiss, far away.
  const falls = noiseSource(ctx, 4, false);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.4;
  const fallsGain = ctx.createGain();
  fallsGain.gain.value = 0.035;
  falls.connect(bp).connect(fallsGain).connect(gain);
  gain.connect(out);
  lap.start();
  falls.start();
  lfo.start();
  return { gain };
}

function startNight(ctx: AudioContext, out: AudioNode): Layer {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  // Crickets: a high tone chopped by a fast pulse.
  const cricket = ctx.createOscillator();
  cricket.frequency.value = 4400;
  const chop = ctx.createOscillator();
  chop.type = "square";
  chop.frequency.value = 28;
  const chopGain = ctx.createGain();
  chopGain.gain.value = 0.5;
  const amp = ctx.createGain();
  amp.gain.value = 0.5;
  chop.connect(chopGain).connect(amp.gain);
  const slow = ctx.createOscillator();
  slow.frequency.value = 0.7;
  const slowGain = ctx.createGain();
  slowGain.gain.value = 0.4;
  slow.connect(slowGain).connect(amp.gain);
  const lvl = ctx.createGain();
  lvl.gain.value = 0.012;
  cricket.connect(amp).connect(lvl).connect(gain);
  gain.connect(out);
  cricket.start();
  chop.start();
  slow.start();
  return { gain };
}

function chirp(ctx: AudioContext, out: AudioNode, t: number): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = Math.random() * 1.6 - 0.8;
  const base = 2600 + Math.random() * 1600;
  const n = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const s = t + i * 0.11;
    o.frequency.setValueAtTime(base, s);
    o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.06);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.03, s + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
  }
  o.connect(g).connect(p).connect(out);
  o.start(t);
  o.stop(t + n * 0.11 + 0.1);
}

function owl(ctx: AudioContext, out: AudioNode, t: number): void {
  [0, 0.5, 0.7].forEach((d, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(i === 0 ? 390 : 360, t + d);
    o.frequency.exponentialRampToValueAtTime(320, t + d + 0.35);
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.025, t + d + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.4);
    o.connect(g).connect(out);
    o.start(t + d);
    o.stop(t + d + 0.5);
  });
}

/** A plucked, marimba-ish note through a soft low-pass, with a little echo on the music bus. */
function pluck(ctx: AudioContext, out: AudioNode, freq: number, t: number, gain: number, bright: number): void {
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.value = freq;
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = freq * 4;
  const g2 = ctx.createGain();
  g2.gain.value = 0.12;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900 + bright * 1800;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  e.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  o.connect(f);
  o2.connect(g2).connect(f);
  f.connect(e).connect(out);
  o.start(t);
  o2.start(t);
  o.stop(t + 1.5);
  o2.stop(t + 1.5);
}

function pad(ctx: AudioContext, out: AudioNode, freqs: number[], t: number, dur: number, gain: number): void {
  for (const freq of freqs) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 700;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
      e.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(e).connect(out);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }
}

/** Chord roots (pentatonic degrees) for a gentle I – vi – IV – V-ish walk. */
const CHORDS = [
  [0, 2, 4],
  [4, 6, 8],
  [3, 5, 7],
  [1, 3, 6],
];
const BEAT = 60 / 76;

function scheduleBar(ctx: AudioContext, bar: number, t: number): void {
  if (!musicBus) return;
  const chord = CHORDS[bar % CHORDS.length]!;
  const isNight = tod === "night";
  const bright = tod === "golden" ? 0.6 : isNight ? 0.1 : 0.9;
  pad(ctx, musicBus, chord.map((n) => note(n - 5) / 2), t, BEAT * 4, isNight ? 0.02 : 0.014);
  // A little melody: 5–7 notes per bar, never the same bar twice in a row.
  const steps = [0, 1, 1.5, 2, 3, 3.5];
  steps.forEach((s, i) => {
    if (Math.random() < (isNight ? 0.45 : 0.25)) return;
    const degree = chord[i % 3]! + (Math.random() < 0.4 ? 5 : 0) + (Math.random() < 0.3 ? 1 : 0);
    pluck(ctx, musicBus!, note(degree), t + s * BEAT, isNight ? 0.05 : 0.07, bright);
  });
}

export function setTimeOfDayMood(next: TimeOfDay): void {
  tod = next;
  const a = audio();
  if (!a || !night) return;
  const t = a.ctx.currentTime;
  night.gain.gain.setTargetAtTime(next === "night" ? 1 : next === "dawn" ? 0.3 : 0, t, 3);
}

export function startWorld(): void {
  const a = audio();
  if (!a || started) return;
  started = true;
  const { ctx, out } = a;
  water = startWater(ctx, out);
  night = startNight(ctx, out);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.55;
  const delay = ctx.createDelay();
  delay.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  musicBus.connect(out);
  musicBus.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(out);
  let bar = 0;
  let next = ctx.currentTime + 0.5;
  const loop = () => {
    // Schedule a little ahead so a busy frame never makes the music stumble.
    while (next < ctx.currentTime + 1.5) {
      scheduleBar(ctx, bar++, next);
      next += BEAT * 4;
    }
    if (tod !== "night" && Math.random() < 0.18) chirp(ctx, out, ctx.currentTime + Math.random());
    if (tod === "night" && Math.random() < 0.02) owl(ctx, out, ctx.currentTime + Math.random());
  };
  timers.push(window.setInterval(loop, 400));
  loop();
}

export function stopWorld(): void {
  for (const t of timers) window.clearInterval(t);
  timers = [];
  water?.gain.disconnect();
  night?.gain.disconnect();
  musicBus?.disconnect();
  started = false;
}

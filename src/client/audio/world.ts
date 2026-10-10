import type { TimeOfDay } from "../../game/daycycle";
import { audio } from "./engine";
import { note } from "./sfx";
import { moodFor, type Mood } from "./moods";
import type { Biome } from "../../game/regions";

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
/** Someone is walking: the music adds a soft walking bass and shaker. */
let traveling = false;
export function setTraveling(on: boolean): void {
  traveling = on;
}
let timers: number[] = [];
/** The place the family is at sets the music's mode, pace and brightness (moods.ts). */
let mood: Mood = moodFor("moonwell");
export function setPlaceMood(biome: Biome): void {
  mood = moodFor(biome);
}
/** On a boat or zeppelin: wind (and the zeppelin's louder) under the music. */
let wind: Layer | null = null;
export function setRiding(kind: "boat" | "zeppelin" | null): void {
  const a = audio();
  if (!a || !wind) return;
  wind.gain.gain.setTargetAtTime(kind === "zeppelin" ? 0.09 : kind === "boat" ? 0.04 : 0, a.ctx.currentTime, 1.2);
}

function startWind(ctx: AudioContext, out: AudioNode): Layer {
  const src = noiseSource(ctx, 4, true);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(lp).connect(gain).connect(out);
  src.start();
  return { gain };
}

/** A generated hall: decaying stereo noise, so the harp and pad bloom like a forest glade at dusk. */
function reverb(ctx: AudioContext, seconds: number): ConvolverNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  return conv;
}

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
  gain.gain.value = 0.32;
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

/** The night layer: a bus the cricket chirps play through (faded in at night, out by day). */
function startNight(ctx: AudioContext, out: AudioNode): Layer {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(out);
  return { gain };
}

/** One cricket: three quick soft pulses (a steady tone reads as a whine; round 04 heard one). */
function cricket(ctx: AudioContext, out: AudioNode, t: number): void {
  const freq = 3800 + Math.random() * 900;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(out);
  for (let k = 0; k < 3; k++) {
    const s = t + k * 0.06;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.006, s + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
    o.connect(g).connect(pan);
    o.start(s);
    o.stop(s + 0.05);
  }
}

function chirp(ctx: AudioContext, out: AudioNode, t: number): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = Math.random() * 1.6 - 0.8;
  // A mellow warbler (1.7–2.5 kHz, soft attack): 2.6–7 kHz chirps read as harsh ticks on TV speakers.
  const base = 1700 + Math.random() * 800;
  const n = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const s = t + i * 0.11;
    o.frequency.setValueAtTime(base, s);
    o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.25), s + 0.07);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.018, s + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
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

/** A harp-like pluck: a triangle with a quick bright partial, decaying long into the reverb. */
function pluck(ctx: AudioContext, out: AudioNode, freq: number, t: number, gain: number, bright: number): void {
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.value = freq;
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  // The bright partial stays under ~2.4 kHz: higher, it reads as a harsh tick on TV speakers.
  o2.frequency.value = freq * (freq > 500 ? 2 : 4);
  const g2 = ctx.createGain();
  g2.gain.value = 0.12;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 800 + bright * 1400;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  e.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  o.connect(f);
  o2.connect(g2).connect(f);
  f.connect(e).connect(out);
  o.start(t);
  o2.start(t);
  o.stop(t + 2.3);
  o2.stop(t + 2.3);
}

/** A soft "ooh" choir: stacked sines with slow vibrato and a long swell. */
function choir(ctx: AudioContext, out: AudioNode, freqs: number[], t: number, dur: number, gain: number): void {
  for (const freq of freqs) {
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.6 + Math.random();
    const vg = ctx.createGain();
    vg.gain.value = freq * 0.006;
    vib.connect(vg).connect(o.frequency);
    const o2 = ctx.createOscillator();
    o2.frequency.value = freq * 2.003;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(gain, t + dur * 0.45);
    e.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(e);
    o2.connect(g2).connect(e);
    e.connect(out);
    for (const n of [o, o2, vib]) {
      n.start(t);
      n.stop(t + dur + 0.1);
    }
  }
}

function shaker(ctx: AudioContext, out: AudioNode, t: number): void {
  const src = noiseSource(ctx, 1, false);
  // A soft seed shaker in the mid band (a 5 kHz high-passed hiss read as harsh ticks on every off-beat).
  const hp = ctx.createBiquadFilter();
  hp.type = "bandpass";
  hp.frequency.value = 1600;
  hp.Q.value = 1.2;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(0.016, t + 0.025);
  e.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(hp).connect(e).connect(out);
  src.start(t);
  src.stop(t + 0.15);
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
const BEAT0 = 60 / 66;
const beat = () => BEAT0 / mood.tempo;

function scheduleBar(ctx: AudioContext, bar: number, t: number): void {
  if (!musicBus) return;
  const chord = CHORDS[bar % CHORDS.length]!.map((n) => n + mood.shift);
  const isNight = tod === "night";
  const bright = Math.min(1.1, (tod === "golden" ? 0.6 : isNight ? 0.1 : 0.9) * mood.bright);
  const BEAT = beat();
  pad(ctx, musicBus, chord.map((n) => note(n - 5) / 2), t, BEAT * 4, isNight ? 0.014 : 0.01);
  if (bar % 2 === 0) choir(ctx, musicBus, chord.map((n) => note(n)), t, BEAT * 8, isNight ? 0.016 : 0.011);
  // A rising harp arpeggio every bar, and a few melody notes above it.
  [0, 0.5, 1, 1.5, 2, 2.5].forEach((s, i) => {
    const degree = chord[i % 3]! + (i >= 3 ? 5 : 0);
    pluck(ctx, musicBus!, note(degree), t + s * BEAT, (isNight ? 0.035 : 0.045) * (1 - i * 0.08), bright);
  });
  if (traveling) {
    // A gentle walking bass on the beat and a soft shaker on the off-beats.
    [0, 1, 2, 3].forEach((b) => pluck(ctx, musicBus!, note(chord[0]! - 5) / 2, t + b * BEAT, 0.05, 0.2));
    [0.5, 1.5, 2.5, 3.5].forEach((b) => shaker(ctx, musicBus!, t + b * BEAT));
  }
  [2.75, 3.25].forEach((s) => {
    if (Math.random() < 0.4) return;
    pluck(ctx, musicBus!, note(chord[Math.floor(Math.random() * 3)]! + 5), t + s * BEAT, 0.035, bright);
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
  wind = startWind(ctx, out);
  musicBus = ctx.createGain();
  // The bed sits under the effects but must read as music between catches (round 01: too faint;
  // round 05: still −23 dBFS between events, lifted ~2 dB).
  musicBus.gain.value = MUSIC_LEVEL;
  const delay = ctx.createDelay();
  delay.delayTime.value = BEAT0 * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  const hall = reverb(ctx, 3.8);
  const hallWet = ctx.createGain();
  hallWet.gain.value = 0.55;
  musicBus.connect(out);
  musicBus.connect(hall).connect(hallWet).connect(out);
  musicBus.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(out);
  let bar = 0;
  let next = ctx.currentTime + 0.5;
  const loop = () => {
    // Schedule a little ahead so a busy frame never makes the music stumble.
    while (next < ctx.currentTime + 1.5) {
      scheduleBar(ctx, bar++, next);
      next += beat() * 4;
    }
    if (tod !== "night" && Math.random() < 0.1) chirp(ctx, out, ctx.currentTime + Math.random());
    if (tod === "night" && Math.random() < 0.02) owl(ctx, out, ctx.currentTime + Math.random());
    if (night && (tod === "night" || tod === "dawn") && Math.random() < 0.45) cricket(ctx, night.gain, ctx.currentTime + Math.random() * 0.4);
  };
  timers.push(window.setInterval(loop, 400));
  loop();
}

const MUSIC_LEVEL = 2.8;

/** Dips the music under the narrator for `seconds`, then brings it back. */
export function duckMusic(seconds: number): void {
  const a = audio();
  if (!a || !musicBus) return;
  const t = a.ctx.currentTime;
  // Hold the gain where it is before re-ramping: cancelScheduledValues alone jumps it mid-fade, a click
  // on every narrator line (round 11's 8–9 kHz bursts at hooks and catches).
  musicBus.gain.cancelAndHoldAtTime(t);
  musicBus.gain.setTargetAtTime(MUSIC_LEVEL * 0.45, t, 0.08);
  musicBus.gain.setTargetAtTime(MUSIC_LEVEL, t + seconds, 0.4);
}

export function stopWorld(): void {
  for (const t of timers) window.clearInterval(t);
  timers = [];
  water?.gain.disconnect();
  night?.gain.disconnect();
  wind?.gain.disconnect();
  wind = null;
  musicBus?.disconnect();
  started = false;
}

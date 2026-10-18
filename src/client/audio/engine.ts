import { createAudioPause } from "../audio-pause";

/**
 * The page's one AudioContext. Phones unlock it on the first tap; the streamed or framed TV starts it
 * itself. Parked by the OGS launcher (ogs:suspend) means silent (audio-pause.ts).
 */
type Nav = Navigator & { audioSession?: { type: string } };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let tapDest: MediaStreamAudioDestinationNode | null = null;
const pause = createAudioPause();

export function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (ctx && master) return { ctx, out: master };
  if (typeof AudioContext === "undefined") return null;
  // iPhones mute Web Audio on silent unless the session is "playback".
  const nav: Nav = navigator;
  if (nav.audioSession) nav.audioSession.type = "playback";
  ctx = new AudioContext();
  master = ctx.createGain();
  // Loud enough for TV speakers after the stream (the bed sat at about -22 dBFS): about +4 dB into a
  // compressor that holds the peaks.
  master.gain.value = 1.45;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  // A gentle attack and knee: a 3 ms clamp on a sting's onset can fleck the top end (round 24).
  comp.attack.value = 0.02;
  comp.release.value = 0.3;
  comp.knee.value = 12;
  master.connect(comp).connect(ctx.destination);
  if (tapDest === null && new URLSearchParams(location.search).has("record")) {
    tapDest = ctx.createMediaStreamDestination();
    comp.connect(tapDest);
  }
  pause.attach(ctx);
  return { ctx, out: master };
}

/** Call from a user gesture (phones) or at start (the TV, where autoplay is allowed). */
export function unlockAudio(): void {
  if (!audio()) return;
  pause.wake();
}

export function setPaused(on: boolean): void {
  pause.setPaused(on);
}

/** The recorder (?record) captures the TV's mix from here. */
export function captureStream(): MediaStream | null {
  audio();
  return tapDest?.stream ?? null;
}

/** The page's audio clock, if sound has started (for the TV's "no sound" marker). */
export function audioClock(): { state: AudioContextState; time: number } | null {
  return ctx ? { state: ctx.state, time: ctx.currentTime } : null;
}

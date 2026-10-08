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
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
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

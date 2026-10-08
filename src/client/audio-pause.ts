/**
 * The pause gate over the page's AudioContext. The OGS launcher keeps a parked game's iframe loaded
 * (Home, or another game) and posts `ogs:suspend`, then `ogs:resume` on Continue: while parked the
 * game must be silent. Paused is an extra gate on top of mute (setMuted), not a replacement for it.
 */
export type Suspendable = {
  readonly state: AudioContextState;
  suspend(): Promise<void>;
  resume(): Promise<void>;
};

export type AudioPause = {
  /** The page's (one) AudioContext, once it exists. */
  attach(ctx: Suspendable): void;
  /** Sound wants to play (an unlock tap): resume now, or on Continue if parked. */
  wake(): void;
  setPaused(on: boolean): void;
  paused(): boolean;
};

export function createAudioPause(): AudioPause {
  let ctx: Suspendable | null = null;
  let paused = false;
  // Whether Continue should bring the sound back: only if it was playing (or unlocked) when parked.
  let resumeOnContinue = false;

  return {
    attach(next) {
      ctx = next;
    },
    wake() {
      if (!ctx) return;
      if (paused) {
        resumeOnContinue = true;
        if (ctx.state !== "suspended") void ctx.suspend();
        return;
      }
      if (ctx.state === "suspended") void ctx.resume();
    },
    setPaused(on) {
      if (on === paused) return;
      paused = on;
      if (!ctx) return;
      if (on) {
        resumeOnContinue = ctx.state === "running";
        void ctx.suspend();
      } else {
        if (resumeOnContinue) void ctx.resume();
        resumeOnContinue = false;
      }
    },
    paused: () => paused,
  };
}

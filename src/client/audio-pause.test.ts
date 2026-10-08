import { describe, expect, it } from "vitest";
import { createAudioPause, type Suspendable } from "./audio-pause";

/** A stand-in AudioContext: suspend/resume flip `state` like the real one. */
function fakeCtx(state: AudioContextState = "running") {
  const ctx = {
    state,
    suspends: 0,
    resumes: 0,
    suspend() {
      this.suspends++;
      this.state = "suspended";
      return Promise.resolve();
    },
    resume() {
      this.resumes++;
      this.state = "running";
      return Promise.resolve();
    },
  };
  return ctx satisfies Suspendable;
}

describe("audio pause gate (OGS launcher parks the game: ogs:suspend / ogs:resume)", () => {
  it("suspends playing sound when parked and resumes it on Continue", () => {
    const gate = createAudioPause();
    const ctx = fakeCtx("running");
    gate.attach(ctx);
    gate.setPaused(true);
    expect(ctx.state).toBe("suspended");
    gate.setPaused(false);
    expect(ctx.state).toBe("running");
  });

  it("never starts sound that was never unlocked", () => {
    const gate = createAudioPause();
    const ctx = fakeCtx("suspended");
    gate.attach(ctx);
    gate.setPaused(true);
    gate.setPaused(false);
    expect(ctx.state).toBe("suspended");
    expect(ctx.resumes).toBe(0);
  });

  it("a tap that unlocks sound while parked does not play it until Continue", () => {
    const gate = createAudioPause();
    gate.setPaused(true);
    const ctx = fakeCtx("running"); // a context born running (autoplay allowed)
    gate.attach(ctx);
    gate.wake();
    expect(ctx.state).toBe("suspended");
    gate.setPaused(false);
    expect(ctx.state).toBe("running");
  });

  it("wake() unlocks a suspended context when not parked (the existing unlock behavior)", () => {
    const gate = createAudioPause();
    const ctx = fakeCtx("suspended");
    gate.attach(ctx);
    gate.wake();
    expect(ctx.state).toBe("running");
  });

  it("repeated suspends keep the memory of what was playing", () => {
    const gate = createAudioPause();
    const ctx = fakeCtx("running");
    gate.attach(ctx);
    gate.setPaused(true);
    gate.setPaused(true);
    expect(ctx.suspends).toBe(1);
    gate.setPaused(false);
    expect(ctx.state).toBe("running");
    gate.setPaused(false);
    expect(ctx.resumes).toBe(1);
  });

  it("reports whether it is paused", () => {
    const gate = createAudioPause();
    expect(gate.paused()).toBe(false);
    gate.setPaused(true);
    expect(gate.paused()).toBe(true);
  });

  it("pausing before any sound exists is harmless", () => {
    const gate = createAudioPause();
    expect(() => gate.setPaused(true)).not.toThrow();
    expect(() => gate.setPaused(false)).not.toThrow();
  });
});

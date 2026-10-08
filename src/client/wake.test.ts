import { describe, expect, it } from "vitest";
import { STALE_AFTER_MS, visibilityHandler, wakeLockAcquirer } from "./wake";

function page() {
  const calls: string[] = [];
  const state = { hidden: false, now: 1000 };
  const handler = visibilityHandler({
    hidden: () => state.hidden,
    now: () => state.now,
    reload: () => calls.push("reload"),
    acquire: () => calls.push("acquire"),
  });
  const go = (hidden: boolean, now: number) => {
    state.hidden = hidden;
    state.now = now;
    handler();
  };
  return { calls, go };
}

describe("coming back to the page", () => {
  it("only asks for the wake lock again after a short trip away", () => {
    const p = page();
    p.go(true, 1000);
    expect(p.calls).toEqual([]);
    p.go(false, 1000 + STALE_AFTER_MS);
    expect(p.calls).toEqual(["acquire"]);
  });
  it("reloads after long enough away for the socket to drop, and asks for the lock", () => {
    const p = page();
    p.go(true, 1000);
    p.go(false, 1001 + STALE_AFTER_MS);
    expect(p.calls).toEqual(["reload", "acquire"]);
  });
  it("never reloads when it was never hidden", () => {
    const p = page();
    p.go(false, 1_000_000);
    expect(p.calls).toEqual(["acquire"]);
  });
  it("times the trip from the last time it was hidden", () => {
    const p = page();
    p.go(true, 1000);
    p.go(true, 9000);
    p.go(false, 9000 + STALE_AFTER_MS);
    expect(p.calls).toEqual(["acquire"]);
  });
});

describe("the wake lock", () => {
  const sentinel = { lock: "screen" };
  type Lock = typeof sentinel;
  async function acquire(supported: boolean, visible: boolean, request: () => Promise<Lock> = async () => sentinel) {
    const kept: Lock[] = [];
    let asked = 0;
    wakeLockAcquirer({ supported: () => supported, visible: () => visible, request: () => (asked++, request()), keep: (l) => kept.push(l) })();
    await new Promise((r) => setTimeout(r, 0));
    return { kept, asked };
  }
  it("keeps the lock it gets when the page is showing", async () => {
    expect(await acquire(true, true)).toEqual({ kept: [sentinel], asked: 1 });
  });
  it("doesn't ask without wake lock support or while hidden", async () => {
    expect(await acquire(false, true)).toEqual({ kept: [], asked: 0 });
    expect(await acquire(true, false)).toEqual({ kept: [], asked: 0 });
  });
  it("shrugs off a refused lock", async () => {
    expect(await acquire(true, true, () => Promise.reject(new Error("no")))).toEqual({ kept: [], asked: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { trapBack } from "./kidLock";

describe("keeping little hands in the game (browser limits apply)", () => {
  it("turns an edge swipe 'back' into staying put (the page re-arms its history guard)", () => {
    const pushed: string[] = [];
    const listeners: (() => void)[] = [];
    const fake = {
      pushState: (_s: unknown, _t: string, url: string) => void pushed.push(url),
      addPopListener: (fn: () => void) => void listeners.push(fn),
      href: "https://x/join/AB?t=1",
    };
    trapBack(fake);
    expect(pushed).toEqual(["https://x/join/AB?t=1"]);
    for (const fn of listeners) fn(); // the kid swiped back
    expect(pushed).toEqual(["https://x/join/AB?t=1", "https://x/join/AB?t=1"]);
  });
});

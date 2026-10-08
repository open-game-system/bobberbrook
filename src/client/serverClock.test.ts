import { describe, expect, it } from "vitest";
import { createServerClock } from "./serverClock";

describe("serverClock", () => {
  it("follows the room's clock from snapshots", () => {
    let t = 100;
    const c = createServerClock(() => t);
    c.observe(5100);
    expect(c.now()).toBe(5100);
    t = 200;
    expect(c.now()).toBe(5200);
  });
  it("trusts the least-late snapshot, drifting slowly when all arrive later", () => {
    let t = 100;
    const c = createServerClock(() => t);
    c.observe(5100);
    t = 300;
    c.observe(5250); // arrived 50 ms late
    expect(c.now()).toBe(5298);
  });
});

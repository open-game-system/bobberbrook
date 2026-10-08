import { describe, expect, it } from "vitest";
import { FISHER_SPACE, join, newLake, rename, step, type Lake } from "./lake";

const T0 = 1_000;
const fisher = (l: Lake, seat: number) => l.fishers.find((f) => f.seat === seat)!;

describe("fisher colours", () => {
  it("takes the colour a device asks for when it's free", () => {
    let l = join(newLake(1, T0), { name: "Dad", ogsId: null }).lake;
    l = join(l, { name: null, ogsId: null, color: "blue" }).lake;
    expect(fisher(l, 1).color).toBe("blue");
  });
  it("falls back to the first free colour when the asked one is taken", () => {
    let l = join(newLake(1, T0), { name: "A", ogsId: null, color: "blue" }).lake;
    l = join(l, { name: "B", ogsId: null, color: "blue" }).lake;
    expect(l.fishers.map((f) => f.color)).toEqual(["blue", "green"]);
  });
});

describe("rename", () => {
  it("names a fisher (tidied), and clears it when blank", () => {
    let l = join(newLake(1, T0), { name: null, ogsId: null }).lake;
    l = rename(l, 0, "  Juneau   the   Great  ");
    expect(fisher(l, 0).name).toBe("Juneau the Gre");
    expect(fisher(rename(l, 0, "   "), 0).name).toBeNull();
    expect(rename(l, 3, "Nobody")).toBe(l);
  });
});

describe("personal space", () => {
  it("never leaves two fishers standing inside each other", () => {
    let l = join(newLake(1, T0), { name: "A", ogsId: null }).lake;
    l = join(l, { name: "B", ogsId: null }).lake;
    const same = fisher(l, 0).pos;
    l = { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: { ...same } })) };
    l = step(l, T0 + 100);
    const a = fisher(l, 0).pos;
    const b = fisher(l, 1).pos;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(FISHER_SPACE - 1e-6);
  });
  it("leaves fishers who are already apart where they are", () => {
    let l = join(newLake(1, T0), { name: "A", ogsId: null }).lake;
    l = join(l, { name: "B", ogsId: null }).lake;
    const before = l.fishers.map((f) => f.pos);
    l = step(l, T0 + 100);
    expect(l.fishers.map((f) => f.pos)).toEqual(before);
  });
});

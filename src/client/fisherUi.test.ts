import { describe, expect, it } from "vitest";
import { action, join, newLake, setCampfire, step, type Lake } from "../game/lake";
import { lakeRadius, WEST } from "../game/world";
import { buttonState, needsTick, positionAt } from "./fisherUi";

const T0 = 1000;
function shore(): Lake {
  const l = join(newLake(9, T0), { name: "J", ogsId: null }).lake;
  return { ...l, swirls: [], fishers: l.fishers.map((f) => ({ ...f, pos: { x: -(lakeRadius(WEST) + 1), z: 0 } })) };
}
const me = (l: Lake) => l.fishers[0]!;

describe("the big button", () => {
  it("asks to walk to the water away from it, and offers a cast at the edge", () => {
    const far = join(newLake(9, T0), { name: "J", ogsId: null }).lake;
    expect(buttonState(far, me(far), T0).kind).toBe("walk-to-water");
    expect(buttonState(shore(), me(shore()), T0).kind).toBe("cast");
  });
  it("waits, wiggles on nibbles, then shows the bite the moment it is due", () => {
    const l = step(action(shore(), 0, T0), T0 + 900);
    const f = me(l);
    expect(buttonState(l, f, T0 + 901)).toEqual({ kind: "waiting", nibble: false });
    expect(buttonState(l, f, f.nibbles[0]! + 10)).toEqual({ kind: "waiting", nibble: true });
    expect(buttonState(l, f, f.biteAt).kind).toBe("bite");
    expect(needsTick(f, f.biteAt)).toBe(true);
    expect(needsTick(f, f.biteAt - 1)).toBe(false);
  });
  it("shows reel progress", () => {
    let l = step(action(shore(), 0, T0), T0 + 900);
    l = action(l, 0, me(l).biteAt + 1);
    const s = buttonState(l, me(l), me(l).biteAt + 2);
    expect(s.kind).toBe("reel");
  });
  it("shows the campfire", () => {
    const l = setCampfire(shore(), true, T0);
    expect(buttonState(l, me(l), T0).kind).toBe("campfire");
  });
});

describe("positionAt", () => {
  it("walks the dot on from the snapshot, at most 1.5 s ahead", () => {
    const f = { ...me(shore()), pos: { x: 0, z: 0 }, vel: { x: 2, z: 0 }, movedAt: 0 };
    expect(positionAt(f, 500)).toEqual({ x: 1, z: 0 });
    expect(positionAt(f, 10_000)).toEqual({ x: 3, z: 0 });
  });
});

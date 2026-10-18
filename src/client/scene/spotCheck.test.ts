import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { BODY_W, spotCheck } from "./spotCheck";

function camAt(pos: Vector3, look: Vector3): PerspectiveCamera {
  const c = new PerspectiveCamera(45, 16 / 9, 0.1, 500);
  c.position.copy(pos);
  c.lookAt(look);
  c.updateMatrixWorld();
  return c;
}
const dryEverywhere = () => 5;
/** A body 2 m tall: BODY_W x 2 across. */
const TOP = 2;
const W = BODY_W * TOP;

describe("spot check: dry feet and a body width between neighbours on screen", () => {
  const cam = camAt(new Vector3(0, 6, 15), new Vector3(0, 1, 0));
  it("two fishers side by side three body widths apart (centres) have two body widths between them", () => {
    const r = spotCheck(cam, [{ seat: 0, x: -1.5 * W, y: 0, z: 0, top: TOP }, { seat: 2, x: 1.5 * W, y: 0, z: 0, top: TOP }], dryEverywhere);
    expect(r.pairs[0]!.gap).toBeCloseTo(2, 1);
    expect(r.minGap).toBeCloseTo(2, 1);
  });
  it("shoulder to shoulder is under one body width; one behind the other overlaps (negative)", () => {
    expect(spotCheck(cam, [{ seat: 0, x: 0, y: 0, z: 0, top: TOP }, { seat: 2, x: 1.2 * W, y: 0, z: 0, top: TOP }], dryEverywhere).minGap).toBeLessThan(1);
    expect(spotCheck(cam, [{ seat: 0, x: 0, y: 0, z: 0, top: TOP }, { seat: 2, x: 0.2, y: 0, z: -3, top: TOP }], dryEverywhere).minGap).toBeLessThan(0);
  });
  it("feet less than DRY_FEET up the bank are wet; pairs far apart on the ground are not compared", () => {
    const r = spotCheck(cam, [{ seat: 0, x: 0, y: 0, z: 0, top: TOP }, { seat: 2, x: 20, y: 0, z: 0, top: TOP }], (x) => (x > 10 ? 0.5 : 2));
    expect(r.wet).toBe(1);
    expect(r.feet.find((f) => f.seat === 2)!.dry).toBe(false);
    expect(r.pairs).toEqual([]);
  });
});

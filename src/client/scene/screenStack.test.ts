import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { STACK_MAX_OFFSET, spreadOnScreen, stackShare, type Body } from "./screenStack";

const body = (seat: number, x: number, z: number, top = 2.3): Body => ({ seat, x, z, ox: 0, oz: 0, y: 0, top });
/** The group camera: 14 m back and 8 m up, looking north (-z) at the family. */
function cam(): PerspectiveCamera {
  const c = new PerspectiveCamera(40, 16 / 9, 0.1, 500);
  c.position.set(0, 8, 14);
  c.lookAt(new Vector3(0, 1, 0));
  c.updateMatrixWorld(true);
  return c;
}
const anywhere = () => true;

describe("spreadOnScreen (round 24: bodies apart as the TV sees them)", () => {
  it("parts a kid near the lens from a grown-up behind him", () => {
    const c = cam();
    // Juneau 3 m nearer the lens and 0.6 m across (as spreadAcross leaves a pair it could not part: a walk, the cap).
    const s = [body(2, 0, 3, 2.3), body(0, 0.6, 0, 3.05)];
    expect(stackShare(s[0]!, s[1]!, c)).toBeGreaterThan(0.05);
    spreadOnScreen(s, c, anywhere);
    expect(stackShare(s[0]!, s[1]!, c)).toBe(0);
    // Sideways only (the camera's right is +x).
    for (const b of s) expect(Math.abs(b.oz)).toBeLessThan(1e-9);
    // The near one moves fewer metres than the far one (half each on screen).
    expect(Math.abs(s[0]!.ox)).toBeLessThan(Math.abs(s[1]!.ox));
  });

  it("leaves bodies already apart on screen alone", () => {
    const s = [body(0, -2, 0), body(1, 2, 0)];
    spreadOnScreen(s, cam(), anywhere);
    expect(s.every((b) => b.ox === 0 && b.oz === 0)).toBe(true);
  });

  it("never moves anyone onto ground nobody can stand on: the other takes the move", () => {
    const c = cam();
    const s = [body(2, 0, 3), body(0, 0.8, 0)];
    // Water to the right of x 0.9: the far one (on the right) cannot step further right.
    const land = (x: number) => x <= 0.9;
    spreadOnScreen(s, c, land);
    expect(s[1]!.x + s[1]!.ox).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(stackShare(s[0]!, s[1]!, c)).toBeLessThan(0.02);
  });

  it("keeps a fisher on a walk over water on it (along the walk), and never flings anyone past the cap", () => {
    const c = cam();
    const t = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
    const s = [body(2, 0, 2), body(0, 0.3, 0), body(1, -0.3, 1), body(3, 0.1, 4)];
    // The walk runs north-east through (0.3, 0); beside it (z < 0.5) is water.
    const ground = (x: number, z: number) => z >= 0.5 || Math.abs((x - 0.3) * t.z - z * t.x) < 0.3;
    spreadOnScreen(s, c, ground, (x, z) => (z < 0.5 ? t : null));
    const o = s[1]!;
    expect(Math.abs(o.ox * t.z - o.oz * t.x)).toBeLessThan(0.3);
    for (const b of s) expect(Math.hypot(b.ox, b.oz)).toBeLessThanOrEqual(STACK_MAX_OFFSET + 1e-6);
  });

  it("a fisher on the shore next to a walk's end steps aside on the shore (round 24 mistmarsh-dock-foot)", () => {
    const c = cam();
    const s = [body(2, 0, 3), body(0, 0.4, 0, 3.05)];
    // The walk's tangent runs straight along the view (no sideways from it), but the shore is ground.
    spreadOnScreen(s, c, anywhere, (_x, z) => (z < 0.5 ? { x: 0, z: -1 } : null));
    expect(stackShare(s[0]!, s[1]!, c)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { Group, Object3D, Vector3 } from "three";
import { SLING_SETTLE_S, placeRod, slingTarget } from "./rodSling";

describe("rod sling: on the back while walking, in hand at the water", () => {
  it("slings the rod while walking and riding, and while just paused on the way", () => {
    expect(slingTarget({ mode: "walk", moving: true, stillFor: 0, riding: false, atWater: true })).toBe(1);
    expect(slingTarget({ mode: "walk", moving: false, stillFor: 0, riding: true, atWater: true })).toBe(1);
    expect(slingTarget({ mode: "ride", moving: false, stillFor: 5, riding: false, atWater: true })).toBe(1);
    expect(slingTarget({ mode: "walk", moving: false, stillFor: SLING_SETTLE_S * 0.5, riding: false, atWater: true })).toBe(1);
  });

  it("keeps it slung standing still away from the water (a deck, a trail, the tower after a ride)", () => {
    expect(slingTarget({ mode: "walk", moving: false, stillFor: 10, riding: false, atWater: false })).toBe(1);
  });

  it("brings it to hand once the fisher stands still (at the water) and whenever fishing", () => {
    expect(slingTarget({ mode: "walk", moving: false, stillFor: SLING_SETTLE_S + 0.1, riding: false, atWater: true })).toBe(0);
    for (const mode of ["cast", "wait", "bite", "reel", "catch"]) expect(slingTarget({ mode, moving: true, stillFor: 0, riding: false, atWater: true })).toBe(0);
  });

  it("places the rod exactly at the hand mount, the back mount, or between them", () => {
    const root = new Group();
    root.scale.setScalar(2);
    root.position.set(5, 0, 1);
    const hand = new Object3D();
    hand.position.set(0.2, 0.3, 0.1);
    hand.rotation.x = Math.PI / 2;
    const back = new Object3D();
    back.position.set(-0.1, 0.2, -0.3);
    root.add(hand, back);
    const rod = new Object3D();
    root.add(rod);
    root.updateMatrixWorld(true);
    const at = (w: number) => {
      placeRod(rod, root, hand, back, w);
      rod.updateMatrixWorld(true);
      return new Vector3().setFromMatrixPosition(rod.matrixWorld);
    };
    expect(at(0).distanceTo(new Vector3().setFromMatrixPosition(hand.matrixWorld))).toBeLessThan(1e-6);
    expect(at(1).distanceTo(new Vector3().setFromMatrixPosition(back.matrixWorld))).toBeLessThan(1e-6);
    const mid = at(0.5);
    const want = new Vector3().setFromMatrixPosition(hand.matrixWorld).lerp(new Vector3().setFromMatrixPosition(back.matrixWorld), 0.5);
    expect(mid.distanceTo(want)).toBeLessThan(1e-6);
    // The rod's own direction follows the mount (in hand: along the forearm's forward).
    placeRod(rod, root, hand, back, 0);
    rod.updateMatrixWorld(true);
    const up = new Vector3(0, 1, 0).transformDirection(rod.matrixWorld);
    expect(up.z).toBeCloseTo(1);
  });
});

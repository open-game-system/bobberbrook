import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, CylinderGeometry, SphereGeometry, Vector3 } from "three";
import { FACE_WINDOW, hairLocks, paintSkull, waveBrim } from "./fisherShape";

const withColor = (g: BufferGeometry): BufferGeometry => {
  const n = g.getAttribute("position").count;
  g.setAttribute("color", new BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
};

describe("waveBrim", () => {
  it("leaves the crown edge alone and waves the outer rim", () => {
    const g = new CylinderGeometry(0.2, 0.3, 0.05, 24);
    const before = g.getAttribute("position").clone();
    waveBrim(g, 0.2, 0.3, 0.03, 1);
    const pos = g.getAttribute("position");
    let movedOuter = 0;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(before.getX(i), before.getZ(i));
      const dy = pos.getY(i) - before.getY(i);
      if (r <= 0.2001) expect(Math.abs(dy)).toBeLessThan(1e-9);
      if (r > 0.29 && Math.abs(dy) > 0.004) movedOuter++;
      expect(pos.getX(i)).toBe(before.getX(i));
      expect(pos.getZ(i)).toBe(before.getZ(i));
    }
    expect(movedOuter).toBeGreaterThan(8);
  });

  it("moves the same point by the same amount (the seams stay shut)", () => {
    const a = new CylinderGeometry(0.2, 0.3, 0.05, 24);
    const b = new CylinderGeometry(0.2, 0.3, 0.05, 24);
    waveBrim(a, 0.2, 0.3, 0.03, 4);
    waveBrim(b, 0.2, 0.3, 0.03, 4);
    expect(Array.from(a.getAttribute("position").array)).toEqual(Array.from(b.getAttribute("position").array));
  });

  it("keeps the front of the brim calm, so it never drops over the eyes", () => {
    const g = new CylinderGeometry(0.2, 0.3, 0.001, 72, 1, true);
    const before = g.getAttribute("position").clone();
    waveBrim(g, 0.2, 0.3, 0.03, 2);
    const pos = g.getAttribute("position");
    let front = 0;
    let back = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = before.getX(i);
      const z = before.getZ(i);
      if (Math.hypot(x, z) < 0.29) continue;
      const dy = Math.abs(pos.getY(i) - before.getY(i));
      if (z > 0.25) front = Math.max(front, dy);
      if (z < -0.2) back = Math.max(back, dy);
    }
    expect(front).toBeLessThan(back * 0.5);
  });
});

describe("hairLocks", () => {
  for (const seat of [0, 1, 2, 3]) {
    it(`seat ${seat}: locks sit round the hairline and never over the face`, () => {
      const locks = hairLocks(seat);
      expect(locks.length).toBeGreaterThanOrEqual(7);
      for (const l of locks) {
        const inFace = l.at.z > FACE_WINDOW.z && Math.abs(l.at.x) < FACE_WINDOW.x && l.at.y > FACE_WINDOW.y0 && l.at.y < FACE_WINDOW.y1;
        expect(inFace).toBe(false);
        // On the skull's surface (head space: centre y 0.24, radius 0.25), give or take the lock's own bulk.
        const r = l.at.distanceTo(new Vector3(0, 0.24, 0));
        expect(r).toBeGreaterThan(0.2);
        expect(r).toBeLessThan(0.3);
      }
    });
  }

  it("differs a little between seats (no two families' hair the same)", () => {
    expect(hairLocks(0).map((l) => l.at.y)).not.toEqual(hairLocks(1).map((l) => l.at.y));
  });
});

describe("paintSkull", () => {
  const skull = () => withColor(new SphereGeometry(0.25, 22, 16).translate(0, 0.24, 0));
  const sample = (g: BufferGeometry, dir: Vector3) => {
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    let best = -1;
    let bi = 0;
    const p = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).sub(new Vector3(0, 0.24, 0)).normalize();
      const d = p.dot(dir);
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    return new Vector3(col.getX(bi), col.getY(bi), col.getZ(bi));
  };

  it("paints the back and sides of the head into a cooler shade than the face", () => {
    const g = paintSkull(skull());
    const front = sample(g, new Vector3(0, 0, 1));
    const back = sample(g, new Vector3(0, 0, -1));
    const side = sample(g, new Vector3(1, 0, 0));
    expect(back.x).toBeLessThan(front.x * 0.92);
    expect(side.x).toBeLessThan(front.x);
    // Cooler: blue holds up better than red in the shade.
    expect(back.z / back.x).toBeGreaterThan(front.z / front.x);
  });

  it("warms the cheeks", () => {
    const g = paintSkull(skull());
    const cheek = sample(g, new Vector3(0.58, -0.22, 0.78).normalize());
    const brow = sample(g, new Vector3(0, 0.45, 0.89).normalize());
    expect(cheek.x / cheek.y).toBeGreaterThan(brow.x / brow.y);
  });

  it("darkens the hairline (the hair's shadow on the brow) below the hair", () => {
    const g = paintSkull(skull());
    const hairline = sample(g, new Vector3(0, 0.62, 0.78).normalize());
    const mid = sample(g, new Vector3(0, 0.15, 0.99).normalize());
    expect(hairline.x).toBeLessThan(mid.x);
  });
});

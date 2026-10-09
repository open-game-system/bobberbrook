import { BufferGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, Shape, type Material } from "three";
import { merge, paint, prep } from "./geo";

/**
 * A missed hook: the fish's tail flicks up out of the water at the bobber, slaps down and the fish dives
 * away. Just the tail (no face, nothing scary): a chunky painted fluke on a short body, from a pool of 3.
 */

const LIFE = 1.0;
/** When the tail slaps the water (s after the miss). */
export const SLAP_AT = 0.42;

export type Escape = {
  group: Group;
  /** A miss at (x, z); `away` is the heading the fish escapes along (radians, atan2(z, x)). */
  spawn(x: number, z: number, t: number, away: number): void;
  /** Animates the tails; calls `slap` once per tail when it hits the water. */
  frame(t: number, slap: (x: number, z: number, t: number, away: number) => void): void;
  /** Shows one tail mid-flick (shader prewarm), or hides them all. */
  prewarm(on: boolean): void;
  dispose(): void;
};

function tailGeometry(): BufferGeometry {
  // The fluke: a forked fin in the xy plane, its root at the origin, pointing up (+y).
  const sh = new Shape();
  sh.moveTo(-0.12, 0);
  sh.quadraticCurveTo(-0.35, 0.35, -0.62, 0.78);
  sh.quadraticCurveTo(-0.3, 0.62, 0, 0.5);
  sh.quadraticCurveTo(0.3, 0.62, 0.62, 0.78);
  sh.quadraticCurveTo(0.35, 0.35, 0.12, 0);
  sh.closePath();
  const fin = new ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 8 }).translate(0, 0.32, -0.04);
  const finP = paint(prep(fin), 0x3a2a78, 0xd8c8ff, (p, _n, c) => {
    // Soft rays along the fin, a pale edge.
    if (Math.abs(Math.sin(Math.atan2(p.x, p.y - 0.32) * 9)) < 0.15) c.multiplyScalar(0.85);
  });
  // The tail end of the body, rising out of the water.
  const body = paint(prep(new CylinderGeometry(0.1, 0.24, 0.5, 10).translate(0, 0.08, 0)), 0x2a2060, 0x4a3a90);
  return merge([body, finP]);
}

export function buildEscape(painted: Material): Escape {
  const group = new Group();
  group.name = "escapes";
  const geo = tailGeometry();
  type Tail = { mesh: Mesh; at: number; x: number; z: number; away: number; slapped: boolean };
  const tails: Tail[] = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new Mesh(geo, painted);
    mesh.visible = false;
    mesh.castShadow = false;
    group.add(mesh);
    tails.push({ mesh, at: -1e9, x: 0, z: 0, away: 0, slapped: true });
  }
  let next = 0;
  const S = 1.35;
  return {
    group,
    spawn(x, z, t, away) {
      const tl = tails[next++ % tails.length]!;
      tl.at = t;
      tl.x = x;
      tl.z = z;
      tl.away = away;
      tl.slapped = false;
    },
    frame(t, slap) {
      for (const tl of tails) {
        const a = t - tl.at;
        const m = tl.mesh;
        if (a < 0 || a > LIFE) {
          m.visible = false;
          continue;
        }
        m.visible = true;
        // Up out of the water (0-0.25 s), a flick over (0.25-0.42 s), then down and away.
        const rise = a < 0.25 ? a / 0.25 : a < 0.5 ? 1 : Math.max(0, 1 - (a - 0.5) / 0.45);
        const flick = a < 0.25 ? -0.35 * (a / 0.25) : a < SLAP_AT ? -0.35 + 1.5 * ((a - 0.25) / (SLAP_AT - 0.25)) : 1.15 + 0.3 * Math.min(1, (a - SLAP_AT) / 0.3);
        const go = Math.max(0, a - 0.35) * 2.2;
        m.position.set(tl.x + Math.cos(tl.away) * go, -0.55 + 0.75 * rise * rise * (3 - 2 * rise), tl.z + Math.sin(tl.away) * go);
        m.rotation.set(0, -tl.away, 0);
        m.rotateZ(-flick);
        m.scale.setScalar(S);
        if (!tl.slapped && a >= SLAP_AT) {
          tl.slapped = true;
          slap(tl.x + Math.cos(tl.away) * 0.7, tl.z + Math.sin(tl.away) * 0.7, t, tl.away);
        }
      }
    },
    prewarm(on) {
      const m = tails[0]!.mesh;
      m.visible = on;
      if (on) m.position.set(0, 0.2, 30);
    },
    dispose() {
      geo.dispose();
    },
  };
}

import { BufferGeometry, Color, ExtrudeGeometry, Group, Mesh, Shape, SphereGeometry, type Material } from "three";
import { merge, paint, prep } from "./geo";

/**
 * A missed hook: a little fish's bright tail pops up at the bobber, waggles side to side (facing the
 * camera, so the two round lobes always read as a fish tail, round 22: the old dark forked fin seen edge-on
 * read as a grey shark fin), slaps down and the fish dives away. Just the tail (no face, nothing scary): a
 * goldfish-orange fan with a cream rim on a round little body, from a pool of 3.
 */

const LIFE = 1.0;
/** When the tail slaps the water (s after the miss). */
export const SLAP_AT = 0.58;

export type Escape = {
  group: Group;
  /** A miss at (x, z); `away` is the heading the fish escapes along (radians, atan2(z, x)). */
  spawn(x: number, z: number, t: number, away: number): void;
  /** Animates the tails (each faces the camera at cx, cz); calls `slap` once per tail when it hits the water. */
  frame(t: number, slap: (x: number, z: number, t: number, away: number) => void, cx?: number, cz?: number): void;
  /** Shows one tail mid-flick (shader prewarm), or hides them all. */
  prewarm(on: boolean): void;
  dispose(): void;
};

/** The tail's pose `a` s after the miss: rise (0..1 out of the water), swish (radians, side to side in view), sink. */
export function tailPose(a: number): { rise: number; swish: number; lean: number } {
  // Pops up with a little overshoot (0-0.22 s), waggles twice, then slaps down and dives (SLAP_AT on).
  const up = Math.min(1, a / 0.22);
  const pop = up < 1 ? up * up * (3 - 2 * up) * 1.08 : 1 + 0.08 * Math.exp(-(a - 0.22) * 12) * Math.cos((a - 0.22) * 30);
  const sink = a < SLAP_AT ? 0 : Math.min(1, (a - SLAP_AT) / 0.32);
  const rise = Math.max(0, pop * (1 - sink * sink));
  const wag = a < 0.16 ? 0 : Math.sin((a - 0.16) * Math.PI * 2 / 0.21) * 0.38 * Math.min(1, (a - 0.16) / 0.08);
  return { rise, swish: a < SLAP_AT ? wag : wag * (1 - sink), lean: sink * 0.9 };
}

function tailGeometry(): BufferGeometry {
  // The fan: two round lobes in the xy plane, its root at the origin, pointing up (+y), facing +z.
  const sh = new Shape();
  // A narrow stalk that flares into two lobes reaching up and out, round at the tips, a deep notch between.
  sh.moveTo(-0.07, 0);
  sh.lineTo(-0.055, 0.1);
  sh.bezierCurveTo(-0.2, 0.2, -0.5, 0.4, -0.47, 0.56);
  sh.bezierCurveTo(-0.44, 0.68, -0.29, 0.66, -0.21, 0.55);
  sh.bezierCurveTo(-0.13, 0.44, -0.05, 0.33, 0, 0.3);
  sh.bezierCurveTo(0.05, 0.33, 0.13, 0.44, 0.21, 0.55);
  sh.bezierCurveTo(0.29, 0.66, 0.44, 0.68, 0.47, 0.56);
  sh.bezierCurveTo(0.5, 0.4, 0.2, 0.2, 0.055, 0.1);
  sh.lineTo(0.07, 0);
  sh.closePath();
  const fan = new ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.035, bevelSegments: 2, curveSegments: 12 }).translate(0, 0.24, -0.025);
  const cream = new Color(0xffe8a8);
  const fanP = paint(prep(fan), 0xf04a0c, 0xff9418, (p, _n, c) => {
    // Soft darker rays fanning from the root, a thin golden rim at the lobe tips.
    const ang = Math.atan2(p.x, p.y - 0.24);
    if (Math.abs(Math.sin(ang * 8)) < 0.14) c.multiplyScalar(0.84);
    const rim = Math.hypot(p.x, p.y - 0.24);
    c.lerp(cream, Math.min(1, Math.max(0, (rim - 0.52) / 0.14)) * 0.55);
  });
  // The round tail end of the body, rising out of the water: orange over a pale gold belly.
  const body = paint(prep(new SphereGeometry(0.19, 14, 10).scale(1, 1.6, 0.85).translate(0, 0.04, 0)), 0xffc860, 0xf25a14);
  return merge([body, fanP]);
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
  const S = 1.25;
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
    frame(t, slap, cx = 0, cz = 1e6) {
      for (const tl of tails) {
        const a = t - tl.at;
        const m = tl.mesh;
        if (a < 0 || a > LIFE) {
          m.visible = false;
          continue;
        }
        m.visible = true;
        const { rise, swish, lean } = tailPose(a);
        // A little way along its heading once it dives.
        const go = Math.max(0, a - SLAP_AT) * 1.6;
        const x = tl.x + Math.cos(tl.away) * go;
        const z = tl.z + Math.sin(tl.away) * go;
        m.position.set(x, -0.62 + 0.62 * rise, z);
        // Face the camera (the fan's flat side toward the lens), waggle in the view plane, tip back as it dives.
        m.rotation.set(0, Math.atan2(cx - x, cz - z), 0);
        m.rotateZ(swish);
        m.rotateX(-lean);
        m.scale.setScalar(S);
        if (!tl.slapped && a >= SLAP_AT) {
          tl.slapped = true;
          slap(x, z, t, tl.away);
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

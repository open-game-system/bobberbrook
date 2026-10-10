import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
} from "three";
import { BOARD_MS, type Lake } from "../../game/lake";
import type { Platform } from "../../game/regions";
import { blob } from "./kit";
import { fadeGlowMaterial, jitter, merge, paint, prep, puffNormals, surf } from "./geo";
import { PK } from "./painter";
import { disc } from "./decking";
import { buildCloudCards } from "./clouds";
import { surfaceMaterial, tiled } from "./surfaces";
import { rng, vnoise } from "./noise";
import { SEA_Y, heightAt } from "./terrain";
import type { TodState } from "./tod";
import { activeWorld, platformsWithin, towersAround } from "./worldQuery";

/**
 * Boats and zeppelins. Every boat route has a wooden dock with a lantern and a moored, painted boat
 * (sail, no text, no faces); every zeppelin place has a lantern-lit wooden tower, with a little balloon
 * airship moored at each of its routes. While the family gathers (lake.boarding) the vehicle readies
 * (the sail unfurls, the propellers spin, a soft glow rings the platform); on a ride (lake.ride) it
 * carries them: boats rock across the sea, zeppelins climb over the forest into the clouds. The riders
 * stand on the deck; the camera gets a wide travelling shot.
 */

/** Tower platform height (m above its foot). */
export const TOWER_H = 13;
void TOWER_H;
/** How far out from the land end of a dock the boat is moored. */
const MOOR = 10;
/** Vehicles are built small and scaled up to carry four chunky fishers. */
const SIZE = 1.55;
/** Seconds the vehicle holds (turning, loading) at each end of a ride. */
const HOLD = 1.6;
/** How high an airship cruises above its towers (m). */
const CRUISE = 44;
/** Seconds the riders take to step aboard / ashore. */
const STEP = 1.2;

export type RidePose = { x: number; y: number; z: number; facing: number };

export type Vehicles = {
  group: Group;
  update(lake: Lake | null, sn: number, t: number, dt: number, tod: TodState, fx: number, fz: number): void;
  /** Where a riding seat stands (on the deck), or null when that seat isn't riding. */
  rideSeat(seat: number, out: RidePose): boolean;
  /** Focus points for the travelling shot (bow, stern, top), or 0 when there is no ride. */
  rideFocus(out: Vector3[]): number;
  /** While the family gathers at a mooring: its vehicle's focus points and the way from the mooring to it. */
  boardFocus(out: Vector3[]): { n: number; ux: number; uz: number; kind: number } | null;
  /** 0 none, 1 boat, 2 zeppelin. */
  riding(): number;
  /** The riding vehicle's heading (atan2(z, x)). */
  heading(): number;
  prewarm(on: boolean): void;
  reset(): void;
  dispose(): void;
};

// ---------- geometry ----------

/** Turns a geometry built along +y to point along a direction. */
function along(g: BufferGeometry, dir: Vector3): BufferGeometry {
  return g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
}

function boatGeometry(): { body: BufferGeometry; sail: BufferGeometry; glow: BufferGeometry } {
  const hull = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(3.6, 1.15, 1.35);
  const hullP = paint(prep(surf(hull, PK.planks)), 0x5a2a4a, 0x8a3a5a, (p, _n, c) => {
    // A gold stripe under the rim, deep plum below.
    if (p.y > -0.32 && p.y < -0.16) c.setHex(0xe8b860);
    if (p.y > -0.16) c.setHex(0x3a7a8a);
  });
  const deck = paint(prep(surf(new BoxGeometry(6.4, 0.14, 2.3).translate(0, -0.02, 0), PK.planks)), 0xc89a68, 0xd8aa78, (p, _n, c) => {
    if (Math.abs(((p.z + 3) * 2.2) % 1) < 0.08) c.multiplyScalar(0.8);
  });
  const rim = paint(prep(new TorusGeometry(1, 0.09, 6, 28).rotateX(Math.PI / 2).scale(3.55, 1, 1.32).translate(0, 0.1, 0)), 0xe8b860);
  const bow = paint(prep(new ConeGeometry(0.22, 1.2, 6).rotateZ(-Math.PI / 2 - 0.5).translate(3.7, 0.55, 0)), 0xe8b860);
  const mast = paint(prep(surf(new CylinderGeometry(0.09, 0.12, 6.2, 8).translate(0.4, 3.1, 0), PK.grain)), 0x5a3a28, 0x7a5a38);
  const yard = paint(prep(surf(new CylinderGeometry(0.06, 0.06, 3.4, 6).rotateX(Math.PI / 2).translate(0.4, 5.6, 0), PK.grain, 1)), 0x5a3a28);
  const cabin = paint(prep(surf(new BoxGeometry(1.4, 0.9, 1.6).translate(-2.3, 0.5, 0), PK.planks)), 0xa87a50, 0xc89a68);
  // Round 15: the cabin's canopy is tent canvas (violet, gold trim), not a flat violet cone.
  const roof = paint(prep(surf(new ConeGeometry(1.25, 0.8, 4).rotateY(Math.PI / 4).scale(1, 1, 1.15).translate(-2.3, 1.35, 0), PK.tent, 2, 1)), 0xc8bce0, 0xffffff);
  const pole = paint(prep(new CylinderGeometry(0.04, 0.05, 1.3, 6).translate(3.2, 0.7, 0)), 0x3a2a28);
  const body = merge([hullP, deck, rim, bow, mast, yard, cabin, roof, pole]);
  // The sail hangs from the yard (top at y = 0 so it can unfurl downward by scale.y).
  const sail = new PlaneGeometry(3.1, 4.2, 6, 8).translate(0, -2.1, 0).rotateY(Math.PI / 2);
  const sp = sail.getAttribute("position");
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i);
    const z = sp.getZ(i);
    // Belly in the wind.
    sp.setX(i, 0.55 * Math.sin(((y + 4.2) / 4.2) * Math.PI) * (1 - (z / 1.55) ** 2));
  }
  sail.computeVertexNormals();
  const sailP = paint(prep(sail), 0xf4ead8, 0xfff8ec, (p, _n, c) => {
    if (p.y < -1.6 && p.y > -2.5) c.setHex(0xb89ae8);
  });
  const glow = merge([
    paint(prep(new SphereGeometry(0.17, 10, 8).translate(3.2, 1.45, 0)), 0xffc070),
    paint(prep(new SphereGeometry(0.13, 8, 6).translate(-2.3, 1.85, 0)), 0xffd890),
  ]);
  return { body, sail: sailP, glow };
}

function dockGeometry(): { body: BufferGeometry; lamp: BufferGeometry; glow: BufferGeometry } {
  const R = rng(77);
  const parts: BufferGeometry[] = [];
  // Planks from the land (x = -1) out to the boat (x = 7), on posts.
  for (let x = -1.2; x < 7.2; x += 0.42) {
    const g = new BoxGeometry(0.38, 0.12, 2.4 + (R() - 0.5) * 0.2).rotateY((R() - 0.5) * 0.05).translate(x, 0.75 + (R() - 0.5) * 0.03, 0);
    parts.push(paint(prep(surf(g, PK.planks, 1)), [0xa0714a, 0x8f6440, 0xb07e52][Math.floor(R() * 3)]!));
  }
  for (const x of [-0.6, 2.4, 5.2, 7.0]) for (const z of [-1.15, 1.15]) {
    parts.push(paint(prep(surf(new CylinderGeometry(0.13, 0.15, 3.2, 7).translate(x, -0.6, z), PK.grain)), 0x4a3220, 0x6a4a30));
  }
  parts.push(paint(prep(new TorusGeometry(0.16, 0.05, 6, 10).translate(7.0, 1.0, 1.15)), 0xd8c8a0));
  // The lantern post at the end (its own mesh: it dissolves between the camera and a fisher).
  const lamp = merge([
    paint(prep(surf(new CylinderGeometry(0.08, 0.1, 2.6, 7).translate(6.6, 2.05, -1.0), PK.grain)), 0x4a3220, 0x6a4a30),
    paint(prep(new BoxGeometry(0.5, 0.06, 0.06).translate(6.82, 3.32, -1.0)), 0x4a3220),
    paint(prep(new BoxGeometry(0.3, 0.36, 0.3).translate(7.05, 3.05, -1.0)), 0x2a2420),
    paint(prep(new ConeGeometry(0.26, 0.2, 4).rotateY(Math.PI / 4).translate(7.05, 3.3, -1.0)), 0x2a2420),
  ]);
  const glow = paint(prep(new BoxGeometry(0.22, 0.28, 0.32).translate(7.05, 3.05, -1.0)), 0xffb060);
  return { body: merge(parts), lamp, glow };
}

/** Envelope radius along its length (t 0 tail .. 1 nose), small units. */
const ENV_L = 11.5;
const ENV_R = 2.7;
const ENV_Y = 5.4;
function envR(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  // A plump teardrop: blunt nose, long tapering tail.
  return ENV_R * Math.pow(Math.max(0, 4 * k * (1 - k)), 0.5) * (0.82 + 0.18 * k);
}

function finGeometry(root: number, tip: number, span: number, sweep: number): BufferGeometry {
  const sh = new Shape();
  sh.moveTo(0, 0);
  sh.lineTo(-root, 0);
  sh.lineTo(-root + sweep - tip * 0.15, span);
  sh.lineTo(-root + sweep + tip * 0.85, span);
  sh.closePath();
  return new ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 }).translate(0, 0, -0.07);
}

function zeppelinGeometry(): { body: BufferGeometry; prop: BufferGeometry; glow: BufferGeometry } {
  // The envelope: a lathe along +x with 8 painted gores (rose and cream), stitched seams, gold ribs.
  const prof: Vector2[] = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    prof.push(new Vector2(Math.max(0.001, envR(t)), -ENV_L / 2 + ENV_L * t));
  }
  const env = new LatheGeometry(prof, 48).rotateZ(-Math.PI / 2).translate(0, ENV_Y, 0);
  env.computeVertexNormals();
  // Ashenvale colours (round 05: rose/cream gores read as a Mario Party candy stripe): a dusky violet
  // envelope, a teal belly. Round 09: the gold seam dashes painted into the vertex colours smeared across
  // whole triangles into tape stripes, and the flat colour read as vinyl. Now each gore is a stitched
  // canvas panel (the canvas brush layer carries the seams and stitches), shaded like cloth stretched
  // over a frame: lit in the middle, sinking into soft folds at the seams and between the ribs.
  const panel = new Color(0x4e4282);
  const belly = new Color(0x2c6a78);
  const sheen = new Color(0x9a8cd0);
  const RIB_T = [0.2, 0.5, 0.8];
  const envP = paint(prep(surf(env, PK.canvas, 8, 3)), 0x4e4282, 0x4e4282, (p, _n, c) => {
    const phi = Math.atan2(p.z, p.y - ENV_Y) + Math.PI;
    const g = (phi / (Math.PI * 2)) * 8;
    const f = g - Math.floor(g + 1e-4);
    const t = (p.x + ENV_L / 2) / ENV_L;
    c.copy(panel);
    const up = (p.y - ENV_Y) / ENV_R;
    c.lerp(belly, Math.max(0, Math.min(1, (-up - 0.25) * 1.6)));
    // Moonlit lavender sheen along the top.
    c.lerp(sheen, Math.max(0, up - 0.5) * 0.7);
    // Cloth over a frame: each gore bellies out (lit middle), each rib pinches it in (a soft fold).
    const bellyOut = Math.sin(Math.PI * Math.min(1, Math.max(0, f)));
    let pinch = 1;
    for (const rt of RIB_T) pinch = Math.min(pinch, Math.min(1, Math.abs(t - rt) * 18));
    c.multiplyScalar((0.8 + 0.2 * bellyOut) * (0.86 + 0.14 * pinch) * (0.92 + 0.16 * Math.max(0, up)));
    // Long soft wrinkles running nose to tail, a little lighter and darker.
    c.multiplyScalar(0.96 + 0.06 * Math.sin(g * 9.0 + t * 3.0) * Math.sin(t * 23.0 + g));
  });
  const ribs: BufferGeometry[] = [];
  // Painted gold trim: slim bands, dark old gold in the shade to a pale lit edge on top.
  const trim = (p: Vector3, _n: Vector3, c: Color) => { c.multiplyScalar(0.8 + 0.3 * Math.max(0, (p.y - ENV_Y) / ENV_R)); };
  for (const t of RIB_T) {
    const r = envR(t) + 0.03;
    ribs.push(paint(prep(new TorusGeometry(r, 0.04, 6, 48).rotateY(Math.PI / 2).translate(-ENV_L / 2 + ENV_L * t, ENV_Y, 0)), 0x9a7434, 0xe6c47a, trim));
  }
  // A gold nose cap and a tail cone.
  ribs.push(paint(prep(new SphereGeometry(0.42, 12, 8).translate(ENV_L / 2 - 0.12, ENV_Y, 0)), 0xa88038, 0xecd08a));
  ribs.push(paint(prep(new ConeGeometry(0.3, 0.9, 10).rotateZ(Math.PI / 2).translate(-ENV_L / 2 - 0.2, ENV_Y, 0)), 0x9a7434, 0xd8b468));
  // A spine along the top and a belly keel the gondola hangs from.
  ribs.push(paint(prep(surf(new BoxGeometry(ENV_L * 0.62, 0.16, 0.5).translate(0.3, ENV_Y - ENV_R + 0.12, 0), PK.planks)), 0x6a4a30, 0x8a6a40));
  // Tail: canvas fins stretched on painted wooden ribs (round 09: flat violet slabs with cardboard
  // gold flaps): a round spar on the leading edge, three ribs root to tip, a canvas rudder/elevator.
  const fins: BufferGeometry[] = [];
  const tailX = -ENV_L / 2 + 2.6;
  const wood = (a: Vector3, b: Vector3, r: number): BufferGeometry => {
    const len = a.distanceTo(b);
    const g = along(new CylinderGeometry(r, r, len, 6).translate(0, len / 2, 0), b.clone().sub(a));
    return paint(prep(surf(g.translate(a.x, a.y, a.z), PK.grain)), 0x5a3a24, 0x8a6240);
  };
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    const span = k % 2 === 0 ? 2.3 : 1.9;
    const rootL = 2.6;
    const tipL = 1.3;
    const sweep = 0.6;
    const fin = finGeometry(rootL, tipL, span, sweep);
    const root = envR(0.2) - 0.25;
    const placeFin = (g: BufferGeometry) => g.translate(0, root, 0).rotateX(rot).translate(tailX, ENV_Y, 0);
    fins.push(paint(prep(surf(placeFin(fin), PK.canvas, 0.42, 0.42)), 0x3e3472, 0x6c5ea6, (p, _n, c) => {
      // Canvas sags a little between the ribs.
      c.multiplyScalar(0.9 + 0.1 * Math.abs(Math.sin(p.x * 2.4)));
    }));
    const lead0 = new Vector3(0, 0, 0);
    const leadS = new Vector3(-rootL + sweep + tipL * 0.85, span, 0);
    const trail0 = new Vector3(-rootL, 0, 0);
    const trailS = new Vector3(-rootL + sweep - tipL * 0.15, span, 0);
    const spars: BufferGeometry[] = [wood(lead0, leadS, 0.1), wood(leadS, trailS, 0.08)];
    for (const cf of [0.3, 0.62, 0.95]) spars.push(wood(lead0.clone().lerp(trail0, cf), leadS.clone().lerp(trailS, cf), 0.075));
    for (const sp of spars) fins.push(placeFin(sp));
    // The rudder / elevator: a canvas flap on a wooden frame, hinged on the trailing edge, turned a little.
    const flap = surf(new BoxGeometry(0.8, span * 0.8, 0.1).translate(-0.4, root + span * 0.45, 0), PK.canvas, 1, 1);
    const flapP = paint(prep(flap), 0x4a3e80, 0x7a6cb4);
    const flapFrame = [
      wood(new Vector3(0, root + span * 0.05, 0), new Vector3(0, root + span * 0.85, 0), 0.07),
      wood(new Vector3(-0.8, root + span * 0.05, 0), new Vector3(-0.8, root + span * 0.85, 0), 0.06),
      wood(new Vector3(0, root + span * 0.85, 0), new Vector3(-0.8, root + span * 0.85, 0), 0.06),
    ];
    for (const g of [flapP, ...flapFrame]) fins.push(g.rotateY(k % 2 === 0 ? 0.22 : 0).translate(-2.6, 0, 0).rotateX(rot).translate(tailX, ENV_Y, 0));
  }
  // The gondola: a little wooden boat with railings and four lanterns.
  const hull = paint(prep(surf(new SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(2.35, 0.8, 1.15), PK.planks)), 0x5a3020, 0x8a5a38, (p, _n, c) => {
    if (Math.abs(((p.y + 1) * 6) % 1) < 0.12) c.multiplyScalar(0.75);
    if (p.y > -0.18) c.setHex(0xd8a848);
  });
  const floor = paint(prep(surf(new BoxGeometry(4.3, 0.12, 2.15).translate(0, 0.02, 0), PK.planks)), 0xc89a68, 0xd8aa78, (p, _n, c) => {
    if (Math.abs(((p.x + 3) * 2.4) % 1) < 0.08) c.multiplyScalar(0.82);
  });
  const rails: BufferGeometry[] = [];
  const RX = 2.05;
  const RZ = 1.02;
  const RH = 0.78;
  for (const z of [-RZ, RZ]) rails.push(paint(prep(surf(new CylinderGeometry(0.06, 0.06, RX * 2, 6).rotateZ(Math.PI / 2).translate(0, RH, z), PK.grain, 1)), 0x7a4a28, 0xa87a50));
  for (const x of [-RX, RX]) rails.push(paint(prep(surf(new CylinderGeometry(0.06, 0.06, RZ * 2, 6).rotateX(Math.PI / 2).translate(x, RH, 0), PK.grain, 1)), 0x7a4a28, 0xa87a50));
  for (let x = -RX; x <= RX + 1e-3; x += RX / 5) for (const z of [-RZ, RZ]) rails.push(paint(prep(surf(new CylinderGeometry(0.035, 0.035, RH, 5).translate(x, RH / 2, z), PK.grain)), 0x5a3a28));
  for (let z = -RZ + RZ / 2; z < RZ; z += RZ / 2) for (const x of [-RX, RX]) rails.push(paint(prep(surf(new CylinderGeometry(0.035, 0.035, RH, 5).translate(x, RH / 2, z), PK.grain)), 0x5a3a28));
  // Lantern posts at the four corners: post, little cage, swept cap.
  const lamps: [number, number][] = [[RX, RZ], [RX, -RZ], [-RX, RZ], [-RX, -RZ]];
  for (const [x, z] of lamps) {
    rails.push(paint(prep(surf(new CylinderGeometry(0.05, 0.06, 1.35, 6).translate(x, 0.68, z), PK.grain)), 0x4a3220, 0x6a4a30));
    rails.push(paint(prep(new CylinderGeometry(0.2, 0.2, 0.06, 6).translate(x, 1.36, z)), 0x2a2420));
    rails.push(paint(prep(new ConeGeometry(0.24, 0.26, 6).translate(x, 1.78, z)), 0x4a2f88, 0x8a6ad0));
  }
  // Ropes up to the keel.
  for (const x of [-1.8, 0, 1.8]) for (const z of [-RZ, RZ]) {
    const top = new Vector3(x * 1.15, ENV_Y - ENV_R + 0.15, z * 0.2);
    const bot = new Vector3(x, RH, z);
    const len = top.distanceTo(bot);
    const g = along(new CylinderGeometry(0.03, 0.03, len, 4).translate(0, len / 2, 0), top.clone().sub(bot));
    rails.push(paint(prep(g.translate(bot.x, bot.y, bot.z)), 0xe8d8b0));
  }
  // Engine pods either side with the propellers' hubs (props spin separately).
  for (const z of [-1.55, 1.55]) {
    rails.push(paint(prep(new SphereGeometry(0.4, 12, 8).scale(1.5, 1, 1).translate(-1.3, 0.55, z)), 0x8a8aa0, 0xc8c8e0));
    rails.push(paint(prep(new CylinderGeometry(0.06, 0.06, 0.55, 5).rotateX(Math.PI / 2).translate(-1.3, 0.55, z * 0.82)), 0x4a3220));
  }
  const body = merge([envP, ...ribs, ...fins, hull, floor, ...rails]);
  const prop = merge([
    paint(prep(new BoxGeometry(0.08, 1.5, 0.24)), 0x5a3a28, 0x8a6a40),
    paint(prep(new BoxGeometry(0.08, 0.24, 1.5)), 0x5a3a28, 0x8a6a40),
    paint(prep(new SphereGeometry(0.14, 8, 6)), 0xe8b860),
  ]);
  const glow = merge(lamps.map(([x, z]) => paint(prep(new SphereGeometry(0.17, 10, 8).translate(x, 1.52, z)), 0xffc070)));
  return { body, prop, glow };
}

/** The landing platform: deck height, deck radius, and the steps' outer radius (metres). */
export const DECK_H = 2.4;
export const DECK_R = 5.9;
const STEPS_R = 7.3;
/** Where a moored airship hangs: its centre this far out from the tower, gondola floor at deck height. */
const ZEP_OUT = 11;

/** The ground a walker stands on round a zeppelin tower (the deck, its steps), or -Infinity off it. */
export function towerDeckY(x: number, z: number): number {
  let y = -Infinity;
  for (const t of towersAround(x, z, heightAt)) {
    const r = Math.hypot(x - t.x, z - t.z);
    if (r >= STEPS_R) continue;
    const k = r <= DECK_R ? 1 : (STEPS_R - r) / (STEPS_R - DECK_R);
    y = Math.max(y, t.y + DECK_H * k);
  }
  return y;
}

function towerGeometry(): { body: BufferGeometry; fade: BufferGeometry; mast: BufferGeometry; glow: BufferGeometry } {
  const parts: BufferGeometry[] = [];
  /** Rails, lantern posts and the mast: they dissolve between the camera and a fisher (round 10: a tower lamp hid Juneau). */
  const fade: BufferGeometry[] = [];
  const stone = (p: Vector3, _n: Vector3, c: Color) => {
    const v = vnoise(p.x * 1.3 + p.y * 0.7, p.z * 1.3, 17);
    c.multiplyScalar(0.84 + 0.3 * v);
  };
  // A round stone dais with three steps all round it (painted stone tiles: its own group).
  const stoneParts: BufferGeometry[] = [];
  stoneParts.push(paint(prep(new CylinderGeometry(DECK_R + 0.05, DECK_R + 0.25, DECK_H + 1.2, 28).translate(0, (DECK_H + 1.2) / 2 - 1.3, 0)), 0x6a5e86, 0x8a7ea8, stone));
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const r = STEPS_R - (i * (STEPS_R - DECK_R)) / steps;
    const h = (DECK_H * (i + 1)) / (steps + 1);
    stoneParts.push(paint(prep(new CylinderGeometry(r, r + 0.08, h + 1.2, 32).translate(0, (h + 1.2) / 2 - 1.2, 0)), 0x7a6e98, 0xa89cc8, stone));
  }
  // The wooden deck: planks round the centre.
  // Round 13: a turned deck with a painted lip (the light catches its edge), occluded round the mast foot
  // and under the rail, worn lighter where people stand.
  parts.push(surf(disc({ r: DECK_R + 0.2, top: DECK_H + 0.03, bottom: DECK_H - 0.19, lip: 0.12, rings: 6 }, 48, (rho, _h, lip, c) => {
    c.setHex(0xb07642);
    if (lip) c.setHex(0xd8a470);
    else if (rho > 0.97) c.setHex(0x5a3820);
    else c.multiplyScalar((0.66 + 0.34 * Math.min(1, Math.max(0, (rho - 0.2) / 0.25))) * (1.0 - 0.32 * Math.max(0, rho - 0.82) / 0.15));
  }), PK.planks));
  // A rail in eight arcs, open toward every mooring direction (multiples of 45 degrees).
  const RAIL = DECK_R + 0.05;
  const gap = 0.17;
  for (let k = 0; k < 8; k++) {
    const a0 = (k * Math.PI) / 4 + gap;
    const arc = Math.PI / 4 - 2 * gap;
    fade.push(paint(prep(surf(new TorusGeometry(RAIL, 0.07, 5, 10, arc).rotateX(Math.PI / 2).rotateY(-a0 - arc).translate(0, DECK_H + 0.95, 0), PK.grain, 1)), 0x5a3a28, 0x8a6a40));
    for (let j = 0; j <= 3; j++) {
      const a = a0 + (arc * j) / 3;
      fade.push(paint(prep(surf(new CylinderGeometry(0.06, 0.07, 0.95, 6).translate(Math.cos(a) * RAIL, DECK_H + 0.48, Math.sin(a) * RAIL), PK.grain)), 0x5a3a28));
    }
  }
  // Lantern posts at four of the arcs' middles.
  const lampAt: [number, number][] = [];
  for (let k = 0; k < 8; k += 2) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const x = Math.cos(a) * (RAIL - 0.1);
    const z = Math.sin(a) * (RAIL - 0.1);
    fade.push(paint(prep(surf(new CylinderGeometry(0.09, 0.12, 2.4, 7).translate(x, DECK_H + 1.2, z), PK.grain)), 0x4a3220, 0x6a4a30));
    fade.push(paint(prep(new CylinderGeometry(0.3, 0.3, 0.07, 6).translate(x, DECK_H + 2.4, z)), 0x2a2420));
    fade.push(paint(prep(new ConeGeometry(0.36, 0.4, 6).translate(x, DECK_H + 3.05, z)), 0x4a2f88, 0x8a6ad0));
    lampAt.push([x, z]);
  }
  // The mooring mast: a slender carved trunk with a lantern crown under a swept elven roof.
  const MH = 17;
  // Round 14: the mast with its foot, rings and crown dissolves as one thing (an instanced mesh of one:
  // the per-object fade), so its foot never stays behind as a stump on the deck (session 186 s) nor its
  // crown floats where the trunk has gone.
  const mast: BufferGeometry[] = [];
  mast.push(surf(disc({ r: 1.3, top: DECK_H + 0.55, bottom: DECK_H, lip: 0.12, flare: 0.12, rings: 2 }, 18, (rho, h, lip, c) => {
    c.setHex(0x8a5a38).lerp(new Color(0xa87a50), h);
    if (lip) c.lerp(new Color(0xf0c890), 0.4);
    c.multiplyScalar(0.7 + 0.3 * Math.min(1, h * 2) * (rho < 0.3 ? 0.8 : 1));
  }), PK.grain, 1));
  mast.push(paint(prep(surf(new CylinderGeometry(0.32, 0.55, MH, 10).translate(0, DECK_H + MH / 2, 0), PK.grain)), 0x4a3220, 0x7a5a38));
  for (const y of [4, 8.5, 12.5]) mast.push(paint(prep(new TorusGeometry(0.5 - y * 0.012, 0.09, 5, 14).rotateX(Math.PI / 2).translate(0, DECK_H + y, 0)), 0xd8a848));
  mast.push(paint(prep(new CylinderGeometry(1.5, 1.2, 0.25, 14).translate(0, DECK_H + MH - 1.2, 0)), 0x8a5a38, 0xa87a50));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    mast.push(paint(prep(new CylinderGeometry(0.05, 0.05, 1.3, 5).translate(Math.cos(a) * 1.35, DECK_H + MH - 0.45, Math.sin(a) * 1.35)), 0x5a3a28));
  }
  const prof: Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push(new Vector2(0.02 + 2.1 * Math.pow(1 - t, 1.8), DECK_H + MH + 0.1 + t * 2.4));
  }
  mast.push(paint(prep(new LatheGeometry(prof, 14)), 0x3e2a7a, 0x9a7ae0));
  const glow = merge([
    paint(prep(new SphereGeometry(0.55, 12, 8).translate(0, DECK_H + MH - 0.4, 0)), 0xffc878),
    ...lampAt.map(([x, z]) => paint(prep(new SphereGeometry(0.2, 8, 6).translate(x, DECK_H + 2.7, z)), 0xffc070)),
  ]);
  return { body: tiled(stoneParts, parts), fade: merge(fade), mast: merge(mast), glow };
}

/** A plank bridge from the deck's edge out to a moored gondola (along +x, deck height). */
function gangplankGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const x0 = DECK_R - 0.3;
  const x1 = ZEP_OUT - 1.15 * SIZE + 0.1;
  for (let x = x0; x < x1; x += 0.36) parts.push(paint(prep(surf(new BoxGeometry(0.32, 0.1, 1.7).translate(x + 0.16, DECK_H + 0.02, 0), PK.planks, 1)), [0xa0714a, 0xb07e52][Math.round(x * 3) % 2]!));
  for (const z of [-0.85, 0.85]) {
    parts.push(paint(prep(new CylinderGeometry(0.045, 0.045, x1 - x0, 5).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, DECK_H + 0.9, z)), 0xe8d8b0));
    for (const x of [x0 + 0.1, x1 - 0.1]) parts.push(paint(prep(new CylinderGeometry(0.06, 0.06, 0.95, 5).translate(x, DECK_H + 0.45, z)), 0x5a3a28));
  }
  return merge(parts);
}

/** A boat's wake: a foaming V and a churned stripe behind the stern (boat space, +x forward). */
function wakeGeometry(): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const R = rng(515);
  const strip = (side: number, angle: number, len: number, w0: number, w1: number, gain: number) => {
    const base = pos.length / 3;
    const n = 44;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const d = t * len;
      const cx = -3.2 - Math.cos(angle) * d;
      const cz = side * Math.sin(angle) * d;
      const w = w0 + (w1 - w0) * t;
      // Across the strip: perpendicular to its direction (-cos a, side sin a).
      const px = side * Math.sin(angle) * w * 0.5;
      const pz = Math.cos(angle) * w * 0.5;
      // Broken foam: bright clumps and gaps, not a solid beam.
      const r = R();
      const lump = r < 0.3 ? 0.12 : 0.6 + 0.4 * r;
      const f = gain * Math.pow(1 - t, 1.6) * lump * Math.min(1, t * 8 + 0.2);
      pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz);
      col.push(f * 0.85, f * 0.95, f, f * 0.85, f * 0.95, f);
      if (i < n) idx.push(base + i * 2, base + i * 2 + 1, base + i * 2 + 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2);
    }
  };
  strip(1, 0.42, 11, 0.5, 1.6, 0.9);
  strip(-1, 0.42, 11, 0.5, 1.6, 0.9);
  strip(1, 0, 8, 1.4, 2.4, 0.6);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ---------- poses ----------

const ease = (x: number) => {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
};

/** A moored heading: across the route, the same from either end (so an arriving vehicle settles where its twin was). */
function mooredHeading(ux: number, uz: number): number {
  let px = -uz;
  let pz = ux;
  if (px < -1e-6 || (Math.abs(px) <= 1e-6 && pz < 0)) {
    px = -px;
    pz = -pz;
  }
  return Math.atan2(pz, px);
}

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

type Pose = { x: number; y: number; z: number; heading: number; roll: number; pitch: number };

/** Where a platform's vehicle rests. */
function restPose(p: Platform, out: Pose): Pose {
  const dx = p.to.x - p.at.x;
  const dz = p.to.z - p.at.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  if (p.kind === "boat") {
    out.x = p.at.x + ux * MOOR;
    out.z = p.at.z + uz * MOOR;
    out.y = SEA_Y + 0.25;
    out.heading = mooredHeading(ux, uz);
  } else {
    // Out from the tower past its mooring, alongside the deck: the gondola floor level with it.
    const t = towerOf(p);
    let mx = p.at.x - t.x;
    let mz = p.at.z - t.z;
    const ml = Math.hypot(mx, mz);
    if (ml < 0.5) {
      mx = ux;
      mz = uz;
    } else {
      mx /= ml;
      mz /= ml;
    }
    out.x = t.x + mx * ZEP_OUT;
    out.z = t.z + mz * ZEP_OUT;
    out.y = Math.max(0, heightAt(t.x, t.z)) + DECK_H + 0.02;
    // Broadside to the deck, nose clockwise (the same from either end of a route).
    out.heading = Math.atan2(mx, -mz);
  }
  out.roll = 0;
  out.pitch = 0;
  return out;
}

function towerOf(p: Platform): { x: number; z: number } {
  const place = activeWorld().placeById(p.place);
  return place ? activeWorld().towerAt(place) : p.at;
}

// ---------- the module ----------

type Live = {
  p: Platform; vehicle: Group; sail: Mesh | null; props: Mesh[]; base: Group | null; ready: number; alive: boolean; bodies: Mesh[];
  /** An airship moored on the side of its tower facing the pond (it would hang over the fishing). */
  facesPlace: boolean;
  /** 0 = up and away (out of the frame), 1 = moored at the tower. */
  shown: number;
};

/** Does a zeppelin mooring face its place's pond (from the tower)? */
function mooringFacesPlace(p: Platform): boolean {
  if (p.kind !== "zeppelin") return false;
  const place = activeWorld().placeById(p.place);
  if (!place) return false;
  const t = towerOf(p);
  const mx = p.at.x - t.x;
  const mz = p.at.z - t.z;
  const cx = place.center.x - t.x;
  const cz = place.center.z - t.z;
  const ml = Math.hypot(mx, mz);
  const cl = Math.hypot(cx, cz);
  return ml > 0.5 && cl > 0.5 && (mx * cx + mz * cz) / (ml * cl) > 0.3;
}
/** How high a parked airship lifts off when it makes way. */
const PARK_LIFT = 40;
const WHITE = new Color(1, 1, 1);

export function buildVehicles(full: boolean, painted: Material, paintedDouble: Material, fadeMat: Material = painted, fadeDouble: Material = paintedDouble): Vehicles {
  const group = new Group();
  group.name = "vehicles";
  const boat = boatGeometry();
  const dock = dockGeometry();
  const zep = zeppelinGeometry();
  const tower = towerGeometry();
  const plank = gangplankGeometry();
  const wakeGeo = wakeGeometry();
  const wakeMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const wake = new Mesh(wakeGeo, wakeMat);
  wake.name = "wake";
  wake.renderOrder = 4;
  wake.visible = false;
  wake.position.y = 0.1;
  // Lamp glass and lantern cages dissolve with their posts and hulls.
  const glowMat = fadeGlowMaterial();
  const ringMat = new MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const ringGeo = new RingGeometry(2.2, 3.4, 40).rotateX(-Math.PI / 2);
  const ring = new Mesh(ringGeo, ringMat);
  ring.name = "board-glow";
  ring.renderOrder = 5;
  ring.visible = false;
  group.add(ring);
  // Clouds round a zeppelin's flight: painted cloud-card banks.
  const CLOUDS = 16;
  const cloudCards = buildCloudCards(CLOUDS);
  const clouds = cloudCards.mesh;
  clouds.name = "clouds";
  clouds.visible = false;
  group.add(clouds);
  const cloudR = rng(4242);
  const cloudSeed = Array.from({ length: CLOUDS }, () => ({ a: cloudR(), b: cloudR(), c: cloudR(), s: 0.8 + cloudR() * 1.6 }));
  const m4 = new Matrix4();
  const live = new Map<string, Live>();
  const towers = new Map<string, Group>();
  let lastX = 1e9;
  let lastZ = 1e9;
  const pose: Pose = { x: 0, y: 0, z: 0, heading: 0, roll: 0, pitch: 0 };
  const pose2: Pose = { x: 0, y: 0, z: 0, heading: 0, roll: 0, pitch: 0 };
  let rideLive: Live | null = null;
  let rideSeats: number[] = [];
  let rideState = { k: 0, board: 0, land: 0, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, kind: 0 };
  const rideOrder: number[] = [];
  let rideHeading = 0;
  let boardLive: Live | null = null;

  function make(p: Platform): Live {
    const vehicle = new Group();
    vehicle.name = `${p.kind}-${p.id}`;
    let sail: Mesh | null = null;
    const props: Mesh[] = [];
    const bodies: Mesh[] = [];
    let base: Group | null = null;
    if (p.kind === "boat") {
      const b = new Mesh(boat.body, fadeMat);
      bodies.push(b);
      b.castShadow = full;
      const g = new Mesh(boat.glow, glowMat);
      sail = new Mesh(boat.sail, paintedDouble);
      sail.position.set(0.4, 5.55, 0);
      sail.castShadow = full;
      vehicle.add(b, g, sail);
      // The dock: from the land end (at) out along the route.
      base = new Group();
      base.name = `dock-${p.id}`;
      const d = new Mesh(dock.body, painted);
      d.castShadow = full;
      d.receiveShadow = true;
      const dl = new Mesh(dock.lamp, fadeMat);
      dl.castShadow = full;
      base.add(d, dl, new Mesh(dock.glow, glowMat));
      const dx = p.to.x - p.at.x;
      const dz = p.to.z - p.at.z;
      base.position.set(p.at.x, SEA_Y, p.at.z);
      base.rotation.y = -Math.atan2(dz, dx);
      group.add(base);
    } else {
      const b = new Mesh(zep.body, fadeMat);
      bodies.push(b);
      b.castShadow = full;
      const g = new Mesh(zep.glow, glowMat);
      vehicle.add(b, g);
      for (const z of [-1.55, 1.55]) {
        const pr = new Mesh(zep.prop, painted);
        pr.position.set(-2.0, 0.55, z);
        props.push(pr);
        vehicle.add(pr);
      }
      // One tower per place, shared by its routes.
      const t = towerOf(p);
      const ty = Math.max(0, heightAt(t.x, t.z));
      if (!towers.has(p.place)) {
        const tg = new Group();
        tg.name = `tower-${p.place}`;
        const tb = new Mesh(tower.body, surfaceMaterial(tower.body, painted));
        tb.castShadow = full;
        tb.receiveShadow = true;
        const tf = new Mesh(tower.fade, fadeMat);
        tf.castShadow = full;
        const tm = new InstancedMesh(tower.mast, fadeMat, 1);
        tm.setMatrixAt(0, new Matrix4());
        tm.castShadow = full;
        tg.add(tb, tf, tm, new Mesh(tower.glow, glowMat));
        tg.position.set(t.x, ty, t.z);
        towers.set(p.place, tg);
        group.add(tg);
      }
      // This mooring's gangplank, out from the deck toward its airship.
      base = new Group();
      base.name = `plank-${p.id}`;
      const pl = new Mesh(plank, painted);
      pl.receiveShadow = true;
      base.add(pl);
      base.position.set(t.x, ty, t.z);
      base.rotation.y = -Math.atan2(p.at.z - t.z, p.at.x - t.x);
      group.add(base);
    }
    restPose(p, pose);
    place(vehicle, pose);
    group.add(vehicle);
    const facesPlace = mooringFacesPlace(p);
    return { p, vehicle, sail, props, base, ready: 0, alive: true, bodies, facesPlace, shown: facesPlace ? 0 : 1 };
  }

  function place(v: Group, ps: Pose): void {
    v.position.set(ps.x, ps.y, ps.z);
    v.scale.setScalar(SIZE);
    v.rotation.set(ps.roll, -ps.heading, ps.pitch, "YXZ");
  }

  function drop(l: Live): void {
    l.alive = false;
    group.remove(l.vehicle);
    if (l.base) group.remove(l.base);
  }

  /** The ride's vehicle pose at a time (s since departure). */
  function ridePose(p: Platform, kind: number, from: Pose, to: Pose, ts: number, dur: number, t: number, out: Pose): number {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const travel = Math.atan2(dz, dx);
    const moveDur = Math.max(1, dur - 2 * HOLD);
    const k = ease((ts - HOLD) / moveDur);
    out.x = from.x + dx * k;
    out.z = from.z + dz * k;
    // Turn from moored to the way ahead while loading, and back at the far end.
    const turnIn = ease(ts / HOLD);
    const turnOut = ease((ts - (dur - HOLD)) / HOLD);
    out.heading = angleLerp(angleLerp(from.heading, travel, turnIn), to.heading, turnOut);
    if (kind === 1) {
      out.y = SEA_Y + 0.25 + Math.sin(t * 1.3) * 0.12;
      out.roll = Math.sin(t * 1.1) * 0.05;
      out.pitch = Math.sin(t * 0.8 + 1) * 0.03;
    } else {
      // Straight up off the tower first (clear of every canopy), cruise high, then down at the far end.
      const u = Math.max(0, Math.min(1, (ts - HOLD) / moveDur));
      const kh = ease((u - 0.14) / 0.72);
      out.x = from.x + dx * kh;
      out.z = from.z + dz * kh;
      const climb = ease(u / 0.2) * ease((1 - u) / 0.2);
      out.y = from.y + (to.y - from.y) * kh + climb * CRUISE;
      out.roll = Math.sin(t * 0.6) * 0.02;
      // Nose up while climbing, down while descending.
      out.pitch = (u < 0.5 ? 1 : -1) * 0.07 * Math.sin(Math.PI * Math.min(1, (u < 0.5 ? u : 1 - u) / 0.2));
      return kh;
    }
    void p;
    return k;
  }

  const deck = (kind: number, i: number) => {
    const slots: [number, number][] = kind === 1 ? [[-0.9, -0.55], [-0.9, 0.55], [1.3, -0.55], [1.3, 0.55]] : [[-1.0, -0.45], [-1.0, 0.45], [0.95, -0.45], [0.95, 0.45]];
    return slots[i % 4]!;
  };
  const deckY = (kind: number) => (kind === 1 ? 0.06 : 0.08);
  const tmpV = new Vector3();

  return {
    group,
    update(lake, sn, t, dt, tod, fx, fz) {
      glowMat.color.setScalar(0.9 + 2.0 * tod.glow);
      if (Math.hypot(fx - lastX, fz - lastZ) > 8) {
        lastX = fx;
        lastZ = fz;
        const near = new Set<string>();
        for (const p of platformsWithin(fx, fz, 2)) {
          if (Math.hypot(p.at.x - fx, p.at.z - fz) > 260) continue;
          near.add(p.id);
          if (!live.has(p.id)) live.set(p.id, make(p));
        }
        const rideId = lake?.ride?.platformId;
        for (const [id, l] of live) if (!near.has(id) && l !== rideLive && id !== rideId && !(lake?.ride && l.p.place === lake.ride.toPlace)) {
          drop(l);
          live.delete(id);
        }
        const places = new Set([...live.values()].filter((l) => l.p.kind === "zeppelin").map((l) => l.p.place));
        for (const [pl, tg] of towers) if (!places.has(pl)) {
          group.remove(tg);
          towers.delete(pl);
        }
      }
      // Boarding: the vehicle readies and the platform glows.
      const boarding = lake?.boarding ?? null;
      ring.visible = false;
      boardLive = null;
      for (const l of live.values()) {
        const want = boarding?.platformId === l.p.id ? Math.min(1, (sn - boarding.since) / BOARD_MS) : 0;
        l.ready += (want - l.ready) * Math.min(1, dt * (want > l.ready ? 6 : 1.5));
        if (boarding?.platformId === l.p.id) {
          boardLive = l;
          ring.visible = true;
          ring.position.set(l.p.at.x, Math.max(0, heightAt(l.p.at.x, l.p.at.z)) + 0.08, l.p.at.z);
          const pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
          ringMat.opacity = (0.25 + 0.35 * pulse) * (0.4 + 0.6 * l.ready);
          ring.scale.setScalar(1 + 0.08 * pulse);
        }
      }
      // The ride (its vehicle and the far end's twin are always live, however far the focus has come).
      const ride = lake?.ride ?? null;
      if (ride) {
        for (const id of [ride.platformId]) {
          if (live.has(id)) continue;
          const p = activeWorld().platformsNear(ride.from, 1).find((q) => q.id === id);
          if (p) live.set(id, make(p));
        }
        const p0 = live.get(ride.platformId)?.p;
        if (p0) {
          const tw = activeWorld().platformsNear(ride.to, 1).find((q) => q.place === p0.toPlace && q.toPlace === p0.place);
          if (tw && !live.has(tw.id)) live.set(tw.id, make(tw));
        }
      }
      rideSeats = ride?.seats ?? [];
      const rl = ride ? live.get(ride.platformId) ?? null : null;
      if (rl !== rideLive && rideLive && !ride) {
        // Arrived: the twin at the far end takes over (it rests exactly where this one stopped).
        restPose(rideLive.p, pose);
        place(rideLive.vehicle, pose);
      }
      rideLive = rl;
      // The empty lake (the attract / opening shot): no airship hangs over the scene.
      const attract = !lake || lake.fishers.length === 0;
      for (const l of live.values()) {
        // The far end's twin hides while its partner sails in.
        const twin = ride && rl && l !== rl && l.p.place === rl.p.toPlace && l.p.toPlace === rl.p.place;
        // Parked airships keep out of the fishing frame: the ones on the pond side of their tower stay up
        // and away, and every idle one lifts off while the family boards, rides or lands at that tower.
        if (l.p.kind === "zeppelin") {
          const active = l === rl || l === boardLive;
          const busyHere = (boardLive !== null && boardLive !== l && boardLive.p.kind === "zeppelin" && boardLive.p.place === l.p.place)
            || (rl !== null && rl !== l && rl.p.kind === "zeppelin" && (rl.p.place === l.p.place || rl.p.toPlace === l.p.place));
          const want = active ? 1 : !l.facesPlace && !busyHere && !attract ? 1 : 0;
          if (attract && !active) l.shown = 0;
          l.shown = l === rl ? 1 : l.shown + (want - l.shown) * Math.min(1, dt * (active ? 1.6 : 0.9));
          if (Math.abs(want - l.shown) < 0.002) l.shown = want;
          if (l.base) l.base.visible = l.shown > 0.6;
        }
        l.vehicle.visible = !twin && l.shown > 0.01;
        const busy = l === rl ? 1 : l.ready;
        // Moored vehicles fade like trees when they stand between the camera and the family; the ride's never does.
        for (const b of l.bodies) b.material = l === rl ? painted : fadeMat;
        if (l.sail) l.sail.material = l === rl ? paintedDouble : fadeDouble;
        if (l.sail) l.sail.scale.set(1, 0.25 + 0.75 * busy, 1);
        for (const pr of l.props) pr.rotation.x += dt * (1.5 + 14 * busy);
        if (l !== rl && l.p.kind === "boat") {
          restPose(l.p, pose);
          pose.y += Math.sin(t * 1.2 + l.p.at.x) * 0.06;
          pose.roll = Math.sin(t * 0.9 + l.p.at.z) * 0.025;
          place(l.vehicle, pose);
        } else if (l !== rl) {
          restPose(l.p, pose);
          const lift = 1 - ease(l.shown);
          pose.y += Math.sin(t * 0.7 + l.p.at.x) * 0.15 + lift * PARK_LIFT;
          // Drifting off outward as it climbs.
          const t0 = towerOf(l.p);
          pose.x += (pose.x - t0.x) * lift * 1.2;
          pose.z += (pose.z - t0.z) * lift * 1.2;
          place(l.vehicle, pose);
        }
      }
      clouds.visible = false;
      wake.visible = false;
      rideState.kind = 0;
      if (ride && rl) {
        const kind = ride.kind === "boat" ? 1 : 2;
        restPose(rl.p, pose2);
        const twin = [...live.values()].find((l) => l.p.place === rl.p.toPlace && l.p.toPlace === rl.p.place);
        const end: Pose = { x: 0, y: 0, z: 0, heading: 0, roll: 0, pitch: 0 };
        if (twin) restPose(twin.p, end);
        else {
          const dx = ride.to.x - ride.from.x;
          const dz = ride.to.z - ride.from.z;
          const len = Math.hypot(dx, dz) || 1;
          end.x = ride.to.x - (dx / len) * (kind === 1 ? MOOR : 5.9);
          end.z = ride.to.z - (dz / len) * (kind === 1 ? MOOR : 5.9);
          end.y = kind === 1 ? SEA_Y + 0.25 : Math.max(0, heightAt(ride.to.x, ride.to.z)) + TOWER_H + 0.1;
          end.heading = pose2.heading;
        }
        const dur = (ride.arriveAt - ride.departAt) / 1000;
        const ts = Math.max(0, (sn - ride.departAt) / 1000);
        const k = ridePose(rl.p, kind, pose2, end, ts, dur, t, pose);
        place(rl.vehicle, pose);
        rideHeading = pose.heading;
        rl.vehicle.visible = true;
        rideState = { k, board: ease(ts / STEP), land: ease((ts - (dur - STEP - 0.2)) / STEP), from: ride.from, to: ride.to, kind };
        rideOrder.length = 0;
        if (lake) for (const f of lake.fishers) rideOrder.push(f.seat);
        if (kind === 1) {
          // The wake foams up with speed (the eased crossing: still at the docks, fastest mid-sea).
          if (wake.parent !== rl.vehicle) rl.vehicle.add(wake);
          wake.visible = true;
          const spd = Math.min(1, 4.5 * k * (1 - k));
          wakeMat.opacity = spd * (0.75 + 0.25 * Math.sin(t * 7.3));
          wake.scale.set(0.6 + 0.4 * spd, 1, 1);
        }
        if (kind === 2) {
          clouds.visible = true;
          const fwd = pose.heading;
          cloudSeed.forEach((c, i) => {
            const along = ((c.a * 260 - ts * 6) % 260) - 130;
            const side = (c.b < 0.5 ? -1 : 1) * (28 + Math.abs(c.b - 0.5) * 140);
            const x = pose.x + Math.cos(fwd) * along - Math.sin(fwd) * side;
            const z = pose.z + Math.sin(fwd) * along + Math.cos(fwd) * side;
            const fade = Math.min(1, Math.sin(Math.PI * Math.min(1, Math.max(0, k))) * 2.5);
            const s = c.s * (1.6 + 1.6 * fade) * Math.max(0.01, fade);
            m4.makeScale(s * 1.6, s, s).setPosition(x, pose.y - 6 - c.c * 14, z);
            clouds.setMatrixAt(i, m4);
          });
          clouds.instanceMatrix.needsUpdate = true;
          // Lavender cloud banks in the twilight (not sunset-pink lumps).
          cloudCards.lit.copy(tod.cloud).lerp(WHITE, 0.6).multiplyScalar(1.35);
          cloudCards.shade.copy(tod.cloudShade).lerp(tod.hemiSky, 0.3);
        }
      }
    },
    rideSeat(seat, out) {
      if (!rideLive || rideState.kind === 0 || !rideSeats.includes(seat)) return false;
      const i = Math.max(0, rideOrder.indexOf(seat));
      const v = rideLive.vehicle;
      const [lx, lz] = deck(rideState.kind, i);
      tmpV.set(lx, deckY(rideState.kind), lz);
      v.updateMatrixWorld();
      tmpV.applyMatrix4(v.matrixWorld);
      // Step aboard at the start, ashore at the end (from / to where the rules stand them).
      const off = { x: Math.cos(i * 1.7) * 0.9, z: Math.sin(i * 1.7) * 0.9 };
      const sx = rideState.from.x + off.x;
      const sz = rideState.from.z + off.z;
      const ex = rideState.to.x + off.x;
      const ez = rideState.to.z + off.z;
      const b = rideState.board;
      const l = rideState.land;
      let x = sx + (tmpV.x - sx) * b;
      let z = sz + (tmpV.z - sz) * b;
      const sy = Math.max(0, heightAt(sx, sz), towerDeckY(sx, sz));
      let y = sy + (tmpV.y - sy) * b + Math.sin(Math.PI * b) * 0.8;
      if (l > 0) {
        const ey = Math.max(0, heightAt(ex, ez), towerDeckY(ex, ez));
        x += (ex - x) * l;
        z += (ez - z) * l;
        y += (ey - y) * l + Math.sin(Math.PI * l) * 0.8;
      }
      out.x = x;
      out.y = y;
      out.z = z;
      out.facing = rideHeading;
      return true;
    },
    rideFocus(out) {
      if (!rideLive || rideState.kind === 0) return 0;
      const v = rideLive.vehicle;
      v.updateMatrixWorld();
      // Round 14: the airship's focus is its gondola (the family and their tags above it), not the envelope:
      // with the envelope's top in the fit the family shrank to two tags at the bottom on landing (session 180 s).
      const pts = rideState.kind === 1 ? [[3.8, 0.5, 0], [-3.6, 0.5, 0], [0.4, 4, 0]] : [[2.6, 0.2, 0], [-2.6, 0.2, 0], [0, 1.2, 0]];
      pts.forEach(([x, y, z], i) => out[i]!.set(x!, y!, z!).applyMatrix4(v.matrixWorld));
      return pts.length;
    },
    boardFocus(out) {
      if (!boardLive || rideState.kind !== 0) return null;
      const v = boardLive.vehicle;
      v.updateMatrixWorld();
      const zep = boardLive.p.kind === "zeppelin";
      const pts = zep ? [[2.6, 0.2, 0], [-2.6, 0.2, 0], [0, 4.2, 0]] : [[3.6, 0.5, 0], [-3.4, 0.5, 0], [0.4, 3.5, 0]];
      pts.forEach(([x, y, z], i) => out[i]!.set(x!, y!, z!).applyMatrix4(v.matrixWorld));
      // From the people's mooring toward their vehicle.
      const dx = v.position.x - boardLive.p.at.x;
      const dz = v.position.z - boardLive.p.at.z;
      const len = Math.hypot(dx, dz) || 1;
      return { n: pts.length, ux: dx / len, uz: dz / len, kind: zep ? 2 : 1 };
    },
    riding: () => (rideLive ? rideState.kind : 0),
    heading: () => rideHeading,
    prewarm(on) {
      // Make one of each visible so every material compiles up front.
      if (on) {
        const pb: Platform = { id: "prewarm-boat", kind: "boat", place: "moonwell", at: { x: 0, z: 30 }, to: { x: 0, z: 200 }, toPlace: "moonwell", path: [] };
        const pz: Platform = { id: "prewarm-zep", kind: "zeppelin", place: "moonwell", at: { x: 22, z: 4 }, to: { x: 300, z: 4 }, toPlace: "moonwell", path: [] };
        const lb = make(pb);
        live.set(pb.id, lb);
        const lz = make(pz);
        lz.shown = 1;
        live.set(pz.id, lz);
        lb.vehicle.add(wake);
        wake.visible = true;
        wakeMat.opacity = 0.5;
        ring.visible = true;
        clouds.visible = true;
        clouds.count = 1;
      } else {
        wake.removeFromParent();
        wake.visible = false;
        for (const id of ["prewarm-boat", "prewarm-zep"]) {
          const l = live.get(id);
          if (l) drop(l);
          live.delete(id);
        }
        for (const [pl, tg] of towers) {
          group.remove(tg);
          towers.delete(pl);
        }
        clouds.count = CLOUDS;
        lastX = 1e9;
      }
    },
    reset() {
      for (const l of live.values()) drop(l);
      live.clear();
      for (const tg of towers.values()) group.remove(tg);
      towers.clear();
      rideLive = null;
      lastX = 1e9;
    },
    dispose() {
      for (const g of [boat.body, boat.sail, boat.glow, dock.body, dock.lamp, dock.glow, zep.body, zep.prop, zep.glow, tower.body, tower.fade, tower.mast, tower.glow, plank, wakeGeo, ringGeo]) g.dispose();
      wakeMat.dispose();
      glowMat.dispose();
      ringMat.dispose();
      cloudCards.dispose();
      clouds.dispose();
    },
  };
}

void vnoise;

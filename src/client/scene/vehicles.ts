import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from "three";
import { BOARD_MS, type Lake } from "../../game/lake";
import type { Platform } from "../../game/regions";
import { blob } from "./kit";
import { jitter, merge, paint, prep, puffNormals } from "./geo";
import { rng, vnoise } from "./noise";
import { SEA_Y, heightAt } from "./terrain";
import type { TodState } from "./tod";
import { activeWorld, platformsWithin } from "./worldQuery";

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
/** How far out from the land end of a dock the boat is moored. */
const MOOR = 10;
/** Vehicles are built small and scaled up to carry four chunky fishers. */
const SIZE = 1.55;
/** Seconds the vehicle holds (turning, loading) at each end of a ride. */
const HOLD = 1.6;
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
  const hullP = paint(prep(hull), 0x5a2a4a, 0x8a3a5a, (p, _n, c) => {
    // A gold stripe under the rim, deep plum below.
    if (p.y > -0.32 && p.y < -0.16) c.setHex(0xe8b860);
    if (p.y > -0.16) c.setHex(0x3a7a8a);
  });
  const deck = paint(prep(new BoxGeometry(6.4, 0.14, 2.3).translate(0, -0.02, 0)), 0xc89a68, 0xd8aa78, (p, _n, c) => {
    if (Math.abs(((p.z + 3) * 2.2) % 1) < 0.08) c.multiplyScalar(0.8);
  });
  const rim = paint(prep(new TorusGeometry(1, 0.09, 6, 28).rotateX(Math.PI / 2).scale(3.55, 1, 1.32).translate(0, 0.1, 0)), 0xe8b860);
  const bow = paint(prep(new ConeGeometry(0.22, 1.2, 6).rotateZ(-Math.PI / 2 - 0.5).translate(3.7, 0.55, 0)), 0xe8b860);
  const mast = paint(prep(new CylinderGeometry(0.09, 0.12, 6.2, 8).translate(0.4, 3.1, 0)), 0x5a3a28, 0x7a5a38);
  const yard = paint(prep(new CylinderGeometry(0.06, 0.06, 3.4, 6).rotateX(Math.PI / 2).translate(0.4, 5.6, 0)), 0x5a3a28);
  const cabin = paint(prep(new BoxGeometry(1.4, 0.9, 1.6).translate(-2.3, 0.5, 0)), 0xa87a50, 0xc89a68);
  const roof = paint(prep(new ConeGeometry(1.25, 0.8, 4).rotateY(Math.PI / 4).scale(1, 1, 1.15).translate(-2.3, 1.35, 0)), 0x5a3a9a, 0x8a6ad0);
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

function dockGeometry(): { body: BufferGeometry; glow: BufferGeometry } {
  const R = rng(77);
  const parts: BufferGeometry[] = [];
  // Planks from the land (x = -1) out to the boat (x = 7), on posts.
  for (let x = -1.2; x < 7.2; x += 0.42) {
    const g = new BoxGeometry(0.38, 0.12, 2.4 + (R() - 0.5) * 0.2).rotateY((R() - 0.5) * 0.05).translate(x, 0.75 + (R() - 0.5) * 0.03, 0);
    parts.push(paint(prep(g), [0xa0714a, 0x8f6440, 0xb07e52][Math.floor(R() * 3)]!));
  }
  for (const x of [-0.6, 2.4, 5.2, 7.0]) for (const z of [-1.15, 1.15]) {
    parts.push(paint(prep(new CylinderGeometry(0.13, 0.15, 3.2, 7).translate(x, -0.6, z)), 0x4a3220, 0x6a4a30));
  }
  parts.push(paint(prep(new TorusGeometry(0.16, 0.05, 6, 10).translate(7.0, 1.0, 1.15)), 0xd8c8a0));
  // The lantern post at the end.
  parts.push(paint(prep(new CylinderGeometry(0.08, 0.1, 2.6, 7).translate(6.6, 2.05, -1.0)), 0x4a3220, 0x6a4a30));
  parts.push(paint(prep(new BoxGeometry(0.5, 0.06, 0.06).translate(6.82, 3.32, -1.0)), 0x4a3220));
  parts.push(paint(prep(new BoxGeometry(0.3, 0.36, 0.3).translate(7.05, 3.05, -1.0)), 0x2a2420));
  parts.push(paint(prep(new ConeGeometry(0.26, 0.2, 4).rotateY(Math.PI / 4).translate(7.05, 3.3, -1.0)), 0x2a2420));
  const glow = paint(prep(new BoxGeometry(0.22, 0.28, 0.32).translate(7.05, 3.05, -1.0)), 0xffb060);
  return { body: merge(parts), glow };
}

function zeppelinGeometry(): { body: BufferGeometry; prop: BufferGeometry; glow: BufferGeometry } {
  const env = new SphereGeometry(1, 28, 16).scale(6.4, 2.6, 2.6).translate(0, 5.2, 0);
  jitter(env, 0.02, 3);
  env.computeVertexNormals();
  const envP = paint(prep(env), 0xc06a9a, 0xf0a8c8, (p, _n, c) => {
    // Painted gores: rose and cream bands, a gold belly band.
    const band = Math.floor((p.x + 6.4) / 1.6) % 2;
    if (band === 0) c.lerp(new Color(0xfff0e0), 0.55);
    if (p.y < 3.4 && p.y > 3.0) c.setHex(0xe8b860);
  });
  const fins: BufferGeometry[] = [];
  for (const [ry, rx] of [[0, 0], [0, Math.PI / 2], [0, Math.PI], [0, -Math.PI / 2]] as const) {
    const f = new BoxGeometry(1.6, 0.12, 1.5).translate(-0.4, 0, 0.75).rotateX(rx).rotateY(ry).translate(-6.0, 5.2, 0);
    fins.push(paint(prep(f), 0x5a3a9a, 0x8a6ad0));
  }
  const gondola = paint(prep(new BoxGeometry(4.2, 0.9, 2.2).translate(0, -0.45, 0)), 0x7a4a30, 0xa87a50);
  const keel = paint(prep(new SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(2.2, 0.6, 1.15).translate(0, -0.9, 0)), 0x5a3020, 0x7a4a30);
  const floor = paint(prep(new BoxGeometry(4.0, 0.1, 2.0).translate(0, 0.02, 0)), 0xc89a68);
  const rails: BufferGeometry[] = [];
  for (const z of [-1.05, 1.05]) rails.push(paint(prep(new BoxGeometry(4.2, 0.08, 0.08).translate(0, 0.75, z)), 0x5a3a28));
  for (const x of [-2.05, 2.05]) rails.push(paint(prep(new BoxGeometry(0.08, 0.08, 2.2).translate(x, 0.75, 0)), 0x5a3a28));
  for (const x of [-2, -0.7, 0.7, 2]) for (const z of [-1.05, 1.05]) rails.push(paint(prep(new CylinderGeometry(0.04, 0.04, 0.75, 5).translate(x, 0.38, z)), 0x5a3a28));
  // Ropes up to the envelope.
  for (const x of [-1.8, 1.8]) for (const z of [-1, 1]) {
    const top = new Vector3(x * 1.4, 3.2, z * 1.7);
    const bot = new Vector3(x, 0.75, z);
    const len = top.distanceTo(bot);
    const g = along(new CylinderGeometry(0.03, 0.03, len, 4).translate(0, len / 2, 0), top.clone().sub(bot));
    rails.push(paint(prep(g.translate(bot.x, bot.y, bot.z)), 0xd8c8a0));
  }
  const engine = paint(prep(new CylinderGeometry(0.35, 0.45, 0.9, 10).rotateZ(Math.PI / 2).translate(-2.55, 0.2, 0)), 0x8a8aa0, 0xb0b0c8);
  const body = merge([envP, ...fins, gondola, keel, floor, ...rails, engine]);
  const prop = merge([
    paint(prep(new BoxGeometry(0.08, 1.7, 0.22)), 0x5a3a28),
    paint(prep(new BoxGeometry(0.08, 0.22, 1.7)), 0x5a3a28),
    paint(prep(new SphereGeometry(0.14, 8, 6)), 0xe8b860),
  ]);
  const glow = merge([
    paint(prep(new SphereGeometry(0.16, 8, 6).translate(2.1, 1.0, 1.05)), 0xffc070),
    paint(prep(new SphereGeometry(0.16, 8, 6).translate(2.1, 1.0, -1.05)), 0xffc070),
    paint(prep(new SphereGeometry(0.14, 8, 6).translate(-2.1, 1.0, 1.05)), 0xffd890),
    paint(prep(new SphereGeometry(0.14, 8, 6).translate(-2.1, 1.0, -1.05)), 0xffd890),
  ]);
  return { body, prop, glow };
}

function towerGeometry(): { body: BufferGeometry; glow: BufferGeometry } {
  const parts: BufferGeometry[] = [];
  const H = TOWER_H;
  // Four splayed log legs, braced in X's, a round landing platform with a rail and a lantern mast.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = new Vector3(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2);
    const head = new Vector3(Math.cos(a) * 1.9, H, Math.sin(a) * 1.9);
    const len = foot.distanceTo(head);
    const g = along(new CylinderGeometry(0.3, 0.22, len, 7).translate(0, len / 2, 0), head.clone().sub(foot));
    parts.push(paint(prep(g.translate(foot.x, -0.4, foot.z)), 0x4a3220, 0x7a5a38));
  }
  for (let lvl = 0; lvl < 3; lvl++) {
    const y = 2.5 + lvl * 3.6;
    const r = 3.2 - (1.3 * y) / H;
    parts.push(paint(prep(new TorusGeometry(r, 0.09, 5, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4).translate(0, y, 0)), 0x6a4a30));
  }
  parts.push(paint(prep(new CylinderGeometry(3.2, 3.0, 0.4, 16).translate(0, H, 0)), 0xa87a50, 0xc89a68));
  parts.push(paint(prep(new TorusGeometry(3.1, 0.07, 5, 24).rotateX(Math.PI / 2).translate(0, H + 0.95, 0)), 0x5a3a28));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    parts.push(paint(prep(new CylinderGeometry(0.05, 0.05, 0.95, 5).translate(Math.cos(a) * 3.1, H + 0.5, Math.sin(a) * 3.1)), 0x5a3a28));
  }
  // A ladder up one leg-side, a mast with a little round roof.
  parts.push(paint(prep(new BoxGeometry(0.1, H, 0.1).translate(2.4, H / 2 - 0.3, -0.35)), 0x5a3a28));
  parts.push(paint(prep(new BoxGeometry(0.1, H, 0.1).translate(2.4, H / 2 - 0.3, 0.35)), 0x5a3a28));
  for (let y = 0.4; y < H; y += 0.55) parts.push(paint(prep(new BoxGeometry(0.08, 0.06, 0.7).translate(2.4 - (y / H) * 0.0, y, 0)), 0x6a4a30));
  parts.push(paint(prep(new CylinderGeometry(0.14, 0.16, 4.2, 7).translate(0, H + 2.1, 0)), 0x4a3220, 0x6a4a30));
  parts.push(paint(prep(new ConeGeometry(1.0, 0.9, 8).translate(0, H + 4.6, 0)), 0x5a3a9a, 0x8a6ad0));
  const glow = paint(prep(new SphereGeometry(0.45, 12, 8).translate(0, H + 3.6, 0)), 0xffc878);
  return { body: merge(parts), glow };
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
  } else {
    const t = towerOf(p);
    out.x = t.x + ux * 5.9;
    out.z = t.z + uz * 5.9;
    out.y = Math.max(0, heightAt(t.x, t.z)) + TOWER_H + 0.1;
  }
  out.heading = mooredHeading(ux, uz);
  out.roll = 0;
  out.pitch = 0;
  return out;
}

function towerOf(p: Platform): { x: number; z: number } {
  const place = activeWorld().placeById(p.place);
  return place ? activeWorld().towerAt(place) : p.at;
}

// ---------- the module ----------

type Live = { p: Platform; vehicle: Group; sail: Mesh | null; props: Mesh[]; base: Group | null; ready: number; alive: boolean };

export function buildVehicles(full: boolean, painted: Material, paintedDouble: Material): Vehicles {
  const group = new Group();
  group.name = "vehicles";
  const boat = boatGeometry();
  const dock = dockGeometry();
  const zep = zeppelinGeometry();
  const tower = towerGeometry();
  const glowMat = new MeshBasicMaterial({ vertexColors: true });
  const ringMat = new MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const ringGeo = new RingGeometry(2.2, 3.4, 40).rotateX(-Math.PI / 2);
  const ring = new Mesh(ringGeo, ringMat);
  ring.name = "board-glow";
  ring.renderOrder = 5;
  ring.visible = false;
  group.add(ring);
  // Clouds round a zeppelin's flight.
  const cloudGeo = merge([blob(2.4, 0, 0, 0, 1, 10, 7), blob(1.8, 2.2, -0.3, 0.4, 2, 9, 6), blob(1.7, -2.1, -0.4, -0.3, 3, 9, 6), blob(1.4, 0.6, 0.9, -0.6, 4, 8, 6)]);
  puffNormals(cloudGeo, 0, 0, 0, 0.85);
  paint(cloudGeo, 0xd8d0f0, 0xffffff);
  const cloudMat = new MeshLambertMaterial({ vertexColors: true, emissive: new Color(0x3a3450) });
  const CLOUDS = 16;
  const clouds = new InstancedMesh(cloudGeo, cloudMat, CLOUDS);
  clouds.name = "clouds";
  clouds.frustumCulled = false;
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

  function make(p: Platform): Live {
    const vehicle = new Group();
    vehicle.name = `${p.kind}-${p.id}`;
    let sail: Mesh | null = null;
    const props: Mesh[] = [];
    let base: Group | null = null;
    if (p.kind === "boat") {
      const b = new Mesh(boat.body, painted);
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
      base.add(d, new Mesh(dock.glow, glowMat));
      const dx = p.to.x - p.at.x;
      const dz = p.to.z - p.at.z;
      base.position.set(p.at.x, SEA_Y, p.at.z);
      base.rotation.y = -Math.atan2(dz, dx);
      group.add(base);
    } else {
      const b = new Mesh(zep.body, painted);
      b.castShadow = full;
      const g = new Mesh(zep.glow, glowMat);
      vehicle.add(b, g);
      const pr = new Mesh(zep.prop, painted);
      pr.position.set(-3.05, 0.2, 0);
      props.push(pr);
      vehicle.add(pr);
      // One tower per place, shared by its routes.
      if (!towers.has(p.place)) {
        const t = towerOf(p);
        const tg = new Group();
        tg.name = `tower-${p.place}`;
        const tb = new Mesh(tower.body, painted);
        tb.castShadow = full;
        tb.receiveShadow = true;
        tg.add(tb, new Mesh(tower.glow, glowMat));
        tg.position.set(t.x, Math.max(0, heightAt(t.x, t.z)), t.z);
        towers.set(p.place, tg);
        group.add(tg);
      }
    }
    restPose(p, pose);
    place(vehicle, pose);
    group.add(vehicle);
    return { p, vehicle, sail, props, base, ready: 0, alive: true };
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
      const lift = Math.sin(Math.PI * k);
      out.y = from.y + (to.y - from.y) * k + lift * 26;
      out.roll = Math.sin(t * 0.6) * 0.02;
      // Nose up while climbing, down while descending.
      out.pitch = Math.cos(Math.PI * k) * 0.08 * Math.min(1, lift * 4);
    }
    void p;
    return k;
  }

  const deck = (kind: number, i: number) => {
    const slots: [number, number][] = kind === 1 ? [[-0.9, -0.55], [-0.9, 0.55], [1.3, -0.55], [1.3, 0.55]] : [[-0.9, -0.5], [-0.9, 0.5], [0.9, -0.5], [0.9, 0.5]];
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
      for (const l of live.values()) {
        const want = boarding?.platformId === l.p.id ? Math.min(1, (sn - boarding.since) / BOARD_MS) : 0;
        l.ready += (want - l.ready) * Math.min(1, dt * (want > l.ready ? 6 : 1.5));
        if (boarding?.platformId === l.p.id) {
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
      for (const l of live.values()) {
        // The far end's twin hides while its partner sails in.
        const twin = ride && rl && l !== rl && l.p.place === rl.p.toPlace && l.p.toPlace === rl.p.place;
        l.vehicle.visible = !twin;
        const busy = l === rl ? 1 : l.ready;
        if (l.sail) l.sail.scale.set(1, 0.25 + 0.75 * busy, 1);
        for (const pr of l.props) pr.rotation.x += dt * (1.5 + 14 * busy);
        if (l !== rl && l.p.kind === "boat") {
          restPose(l.p, pose);
          pose.y += Math.sin(t * 1.2 + l.p.at.x) * 0.06;
          pose.roll = Math.sin(t * 0.9 + l.p.at.z) * 0.025;
          place(l.vehicle, pose);
        } else if (l !== rl) {
          restPose(l.p, pose);
          pose.y += Math.sin(t * 0.7 + l.p.at.x) * 0.15;
          place(l.vehicle, pose);
        }
      }
      clouds.visible = false;
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
          cloudMat.emissive.copy(tod.hemiSky).multiplyScalar(0.35);
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
      const sy = Math.max(0, heightAt(sx, sz));
      let y = sy + (tmpV.y - sy) * b + Math.sin(Math.PI * b) * 0.8;
      if (l > 0) {
        const ey = Math.max(0, heightAt(ex, ez));
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
      const pts = rideState.kind === 1 ? [[3.8, 0.5, 0], [-3.6, 0.5, 0], [0.4, 4, 0]] : [[5, 5.2, 0], [-5, 5.2, 0], [0, -1, 0]];
      pts.forEach(([x, y, z], i) => out[i]!.set(x!, y!, z!).applyMatrix4(v.matrixWorld));
      return pts.length;
    },
    riding: () => (rideLive ? rideState.kind : 0),
    heading: () => rideHeading,
    prewarm(on) {
      // Make one of each visible so every material compiles up front.
      if (on) {
        const pb: Platform = { id: "prewarm-boat", kind: "boat", place: "moonwell", at: { x: 0, z: 30 }, to: { x: 0, z: 200 }, toPlace: "moonwell", path: [] };
        const pz: Platform = { id: "prewarm-zep", kind: "zeppelin", place: "moonwell", at: { x: 22, z: 4 }, to: { x: 300, z: 4 }, toPlace: "moonwell", path: [] };
        live.set(pb.id, make(pb));
        live.set(pz.id, make(pz));
        ring.visible = true;
        clouds.visible = true;
        clouds.count = 1;
      } else {
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
      for (const g of [boat.body, boat.sail, boat.glow, dock.body, dock.glow, zep.body, zep.prop, zep.glow, tower.body, tower.glow, ringGeo, cloudGeo]) g.dispose();
      glowMat.dispose();
      ringMat.dispose();
      cloudMat.dispose();
      clouds.dispose();
    },
  };
}

void vnoise;

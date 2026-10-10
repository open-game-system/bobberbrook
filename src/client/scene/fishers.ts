import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  CylinderGeometry,
  Vector3,
  PerspectiveCamera,
  type ShaderMaterial,
  type Camera,
  type PlaneGeometry,
  type Object3D,
} from "three";
import { CAST_FLIGHT_MS, CATCH_SHOW_MS, type Fisher, type Lake } from "../../game/lake";
import { REEL_START, thrashingAt } from "../../game/reel";
import { fishById } from "../../game/fish";
import { CAMPFIRE, onDock, type Vec } from "../../game/world";
import { activeWorld } from "./worldQuery";
import { FISHER_SCALE, ROD_SEGMENTS, buildFisher, type FisherRig, type RigMaterials } from "./character";
import { CatchCard, lightPillar, type FishShadows, type FishTextures } from "./fishviz";
import type { Fx } from "./fx";
import { damp } from "./noise";
import { heightAt } from "./terrain";
import { towerDeckY } from "./vehicles";
import { aroundFire } from "./campPath";
import { merge, paint, prep } from "./geo";
import { layoutTags, type TagBox, type TagShift } from "./tagLayout";
import { CARD_PX, FISH_PX, chestHold, holdCard, liftFrom } from "./holdCard";

const DECK_Y = 0.42;
const LINE_SEGS = 18;
/** The lift from the water into the hands (round 11: 0.95 s read as a float; round 13: 0.6 -> 0.3 s). */
const LEAP_S = 0.3;
/** The lift starts at most this far from the catcher (round 13: a double catch flew a perch between two fishers). */
const LIFT_REACH = 2.2;
/** The arms while holding a catch across the chest: forward (rotation x) and out (rotation z). */
const HOLD_ARM_X = -1.25;
const HOLD_ARM_Z = 0.42;
/** The held fish's plane in front of the catcher's centre (world units): past the belly, behind the mittens. */
const HOLD_FRONT = 0.5;
/** The held fish's tilt (radians, head up). */
const HOLD_TILT = 0.14;
/** The chin above the feet (world units, at FISHER_SCALE): the held fish's top stays under it. */
const CHIN_Y = 0.55 * FISHER_SCALE;
/** The fish is held up until this age (s), then tucked away over TUCK_S. */
const TUCK_AT = 2.75;
const TUCK_S = 0.45;
/** Half the fisher's head width with the hat brim (world units, at FISHER_SCALE). */
const HEAD_HALF = 0.3 * FISHER_SCALE;
/** How much longer the arms reach while holding a catch. */
const HOLD_REACH = 0.75;

const scratch: Vec = { x: 0, z: 0 };
const predicted: Vec = { x: 0, z: 0 };

/** Dead reckoning with the room's own walkability (no allocation). Capped at 1.2 s of prediction. */
function predict(f: Fisher, serverNow: number, out: Vec): void {
  let x = f.pos.x;
  let z = f.pos.z;
  const vx = f.vel.x;
  const vz = f.vel.z;
  if ((vx !== 0 || vz !== 0) && f.mode === "ride") {
    // Riding: the boat or zeppelin glides on in a straight line.
    const left = Math.min(1.2, Math.max(0, (serverNow - f.movedAt) / 1000));
    out.x = x + vx * left;
    out.z = z + vz * left;
    return;
  }
  if (vx !== 0 || vz !== 0) {
    const walkable = (p: Vec) => activeWorld().walkable(p);
    let left = Math.min(1.2, Math.max(0, (serverNow - f.movedAt) / 1000));
    while (left > 1e-9) {
      const h = Math.min(0.05, left);
      left -= h;
      scratch.x = x + vx * h;
      scratch.z = z + vz * h;
      if (walkable(scratch)) { x = scratch.x; z = scratch.z; continue; }
      scratch.z = z;
      if (walkable(scratch)) { x = scratch.x; continue; }
      scratch.x = x;
      scratch.z = z + vz * h;
      if (walkable(scratch)) { z = scratch.z; continue; }
      break;
    }
  }
  out.x = x;
  out.z = z;
}

function groundY(x: number, z: number): number {
  scratch.x = x;
  scratch.z = z;
  return onDock(scratch) ? DECK_Y : Math.max(heightAt(x, z), -0.25, towerDeckY(x, z));
}

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function bobberGeometry(): BufferGeometry {
  // A painted float: a glossy red crown lit from above with a soft highlight, a dark band, a cream belly
  // shaded underneath, a slim quill with a red tip (no face).
  const top = paint(prep(new SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), 0xb81e18, 0xff6a4a, (p, n, c) => {
    const hl = Math.max(0, n.x * -0.5 + n.y * 0.7 + n.z * 0.5);
    c.lerp(new Color(0xffd0b8), Math.pow(hl, 6) * 0.8);
  });
  const bottom = paint(prep(new SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), 0x9aa8b4, 0xfff6e8);
  const band = paint(prep(new CylinderGeometry(0.153, 0.153, 0.035, 16)), 0x3a2418, 0x5a3a24);
  const stick = paint(prep(new CylinderGeometry(0.014, 0.02, 0.18, 6).translate(0, 0.21, 0)), 0xf0e8d8, 0xffffff);
  const tip = paint(prep(new SphereGeometry(0.03, 8, 6).translate(0, 0.31, 0)), 0xff3a2a, 0xff8a6a);
  return merge([top, bottom, band, stick, tip]);
}

type Pose = { legL: number; legR: number; armLx: number; armLz: number; armRx: number; armRz: number; bodyY: number; lean: number; tilt: number; headX: number; headY: number; sq: number; bend: number; sit: number };
const zeroPose = (): Pose => ({ legL: 0, legR: 0, armLx: 0, armLz: 0, armRx: 0, armRz: 0, bodyY: 0, lean: 0, tilt: 0, headX: 0, headY: 0, sq: 0, bend: 0, sit: 0 });

class FisherView {
  rig: FisherRig;
  /** The colour the rig was built in: always the fisher's own `color` (chosen per device), never the seat's. */
  private colorName = "green";
  get color(): string {
    return this.colorName;
  }
  private parent: Group | null = null;
  readonly bobber: Mesh;
  readonly line: Mesh;
  private readonly linePos: Float32Array;
  private readonly lineGeo: BufferGeometry;
  readonly card: CatchCard;
  present = false;
  private appear = 0;
  x = 0;
  z = 0;
  y = 0;
  private facing = 0;
  private walkPhase = 0;
  /** 0..1: how far the whole fisher turns to face the camera (showing off a catch). */
  private turnToCamera = 0;
  /** Arm reach while holding up a catch (1 = normal; the arms stretch a little to get under the fish). */
  private reachTarget = { l: 1, r: 1 };
  private reach = { l: 1, r: 1 };
  private turnW = 0;
  speed = 0;
  private pose = zeroPose();
  private target = zeroPose();
  private dispProgress = REEL_START;
  // Event bookkeeping.
  private castKey = -1;
  private plopped = false;
  private nibbleIdx = 0;
  private biteKey = -1;
  private missSeq = -1;
  private catchSeq = -1;
  private thrashAcc = 0;
  private biteAcc = 0;
  // Bobber display.
  bobberVisible = false;
  readonly bob = new Vector3();
  private lastBobX = 0;
  private lastBobZ = 0;
  // The catch moment.
  catchStart = -1;
  /** Sideways shift (world units along the camera's right) keeping simultaneous catches apart. */
  cardDx = 0;
  private catchFromX = 0;
  private catchFromZ = 0;
  private catchId = "";
  private catchNew = false;
  private catchGolden = false;
  private catchJunk = false;
  /** 0 common/uncommon/junk (a small sparkle), 1 rare (gold rays), 2 legendary (big burst + light pillar). */
  private catchTier = 0;
  private readonly pillar: Mesh;
  private readonly pillarMat: ShaderMaterial;
  private catchCm = 30;
  private catchEnd = -1;
  private catchAspect = 1.6;
  private sparkAcc = 0;
  readonly hold = new Vector3();
  private readonly handA = new Vector3();
  private readonly handB = new Vector3();
  private readonly toCam = new Vector3();
  /** How hard the line shivers (reeling: a fighting fish makes it thrash); time for its wave. */
  private lineShake = 0;
  private lineT = 0;
  private readonly tip = new Vector3();
  private readonly tmp = new Vector3();
  private readonly side = new Vector3();
  private readonly camDir = new Vector3();
  upgradeFlash = 0;
  /** Screen-space (NDC) shift of the name tag, so close fishers' tags don't overlap (eased). */
  tagDx = 0;
  /** How far the name tag rises to stay above a fish held overhead (world units). */
  tagLift = 0;
  tagDy = 0;

  constructor(
    readonly seat: number,
    private readonly mats: RigMaterials,
    bobberGeo: BufferGeometry,
    bobberMat: MeshBasicMaterial | import("three").MeshLambertMaterial,
    lineMat: MeshBasicMaterial,
    cardGeo: { rays: BufferGeometry; plane: PlaneGeometry },
    private readonly textures: FishTextures,
  ) {
    this.rig = buildFisher(seat, this.colorName, mats);
    this.bobber = new Mesh(bobberGeo, bobberMat);
    this.bobber.scale.setScalar(1.9);
    this.bobber.castShadow = true;
    this.linePos = new Float32Array((LINE_SEGS + 1) * 2 * 3);
    this.lineGeo = new BufferGeometry();
    this.lineGeo.setAttribute("position", new BufferAttribute(this.linePos, 3));
    const idx: number[] = [];
    for (let i = 0; i < LINE_SEGS; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.lineGeo.setIndex(idx);
    this.line = new Mesh(this.lineGeo, lineMat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 8;
    this.card = new CatchCard(cardGeo.rays, cardGeo.plane);
    const p = lightPillar();
    this.pillar = p.mesh;
    this.pillarMat = p.mat;
    this.pillar.visible = false;
  }

  attach(parent: Group): void {
    this.parent = parent;
    parent.add(this.rig.root, this.bobber, this.line, this.card.group, this.rig.tag, this.pillar);
  }

  /** Rebuilds the rig in a new colour (shared materials, so no shader compiles). */
  private recolor(colorName: string): void {
    const old = this.rig;
    this.colorName = colorName;
    const rig = buildFisher(this.seat, colorName, this.mats);
    rig.root.visible = old.root.visible;
    rig.tag.visible = old.tag.visible;
    rig.root.position.copy(old.root.position);
    rig.root.rotation.copy(old.root.rotation);
    rig.root.scale.copy(old.root.scale);
    this.parent?.remove(old.root, old.tag);
    old.dispose();
    this.rig = rig;
    this.parent?.add(rig.root, rig.tag);
  }

  /** Everything visible for the shader prewarm. */
  showAllForPrewarm(): void {
    this.rig.root.visible = true;
    this.rig.root.position.set(0, -20, 0);
    for (const r of this.rig.rods) r.root.visible = true;
    this.bobber.visible = true;
    this.bobber.position.set(0, -20, 0);
    this.line.visible = true;
    this.card.group.visible = true;
    this.card.group.position.set(0, -20, 0);
    this.rig.tag.visible = true;
    this.pillar.visible = true;
    this.pillar.position.set(0, -20, 0);
  }

  hideAll(): void {
    this.rig.root.visible = false;
    this.bobber.visible = false;
    this.line.visible = false;
    this.card.group.visible = false;
    this.rig.tag.visible = false;
    this.pillar.visible = false;
  }

  frame(
    f: Fisher | undefined,
    lake: Lake,
    sn: number,
    t: number,
    dt: number,
    camera: Camera,
    fx: Fx,
    shadows: FishShadows,
    campSeat: { x: number; z: number; facing: number } | undefined,
    ride: { x: number; y: number; z: number; facing: number } | null = null,
  ): void {
    if (!f) {
      if (this.present) {
        this.appear = Math.max(0, this.appear - dt * 3);
        if (this.appear <= 0) {
          this.present = false;
          this.hideAll();
        } else this.rig.root.scale.setScalar(FISHER_SCALE * this.appear);
      }
      return;
    }
    if (f.color !== this.colorName) this.recolor(f.color);
    const rig = this.rig;
    rig.setName(f.name);
    // ---- position ----
    let tx: number;
    let tz: number;
    let tFacing: number;
    if (ride) {
      tx = ride.x;
      tz = ride.z;
      tFacing = ride.facing;
    } else if (lake.campfire && campSeat) {
      tx = campSeat.x;
      tz = campSeat.z;
      tFacing = campSeat.facing;
    } else {
      predict(f, sn, predicted);
      tx = predicted.x;
      tz = predicted.z;
      tFacing = f.facing;
    }
    if (!this.present) {
      this.present = true;
      this.appear = 0;
      this.x = tx;
      this.z = tz;
      this.facing = tFacing;
      this.missSeq = f.missSeq;
      this.catchSeq = f.catch?.seq ?? -1;
      rig.root.visible = true;
      rig.tag.visible = true;
      fx.sparkle(tx, groundY(tx, tz) + 1, tz, 14, 1, 1, 1, 1.5);
    }
    this.appear = Math.min(1, this.appear + dt * 2.5);
    const px = this.x;
    const pz = this.z;
    const far = Math.hypot(tx - this.x, tz - this.z) > 9;
    const k = far || ride ? 1 : damp(lake.campfire ? 3 : 9, dt);
    this.x += (tx - this.x) * k;
    this.z += (tz - this.z) * k;
    if (lake.campfire && campSeat && !far && !ride) {
      // Round the fire to the seat, never through it.
      const p = aroundFire({ x: px, z: pz }, { x: this.x, z: this.z }, campSeat, CAMPFIRE);
      this.x = p.x;
      this.z = p.z;
    }
    const sp = dt > 0 ? Math.hypot(this.x - px, this.z - pz) / dt : 0;
    this.speed += (sp - this.speed) * damp(10, dt);
    const moving = this.speed > 0.4;
    if (moving && !lake.campfire && !ride) tFacing = Math.atan2(this.z - pz, this.x - px);
    this.facing = angleLerp(this.facing, tFacing, damp(10, dt));
    this.y = ride ? ride.y : groundY(this.x, this.z);
    const root = rig.root;
    root.position.set(this.x, this.y, this.z);
    root.rotation.y = Math.PI / 2 - this.facing;
    const pop = this.appear < 1 ? 1 + Math.sin(this.appear * Math.PI) * 0.25 : 1;
    root.scale.setScalar(FISHER_SCALE * Math.min(1, this.appear * 1.4) * pop);

    // ---- events ----
    if (f.castAt !== this.castKey) {
      this.castKey = f.castAt;
      this.plopped = sn > f.castAt + CAST_FLIGHT_MS + 400;
      this.nibbleIdx = 0;
    }
    while (this.nibbleIdx < f.nibbles.length && f.nibbles[this.nibbleIdx]! < sn - 600) this.nibbleIdx++;
    const target = this.target;
    // Base pose: idle breathing.
    target.legL = 0; target.legR = 0; target.lean = 0; target.tilt = Math.sin(t * 1.6 + this.seat) * 0.03; target.headX = 0;
    target.armLx = -0.15; target.armLz = 0.18; target.armRx = -0.15; target.armRz = -0.18; target.bodyY = Math.sin(t * 2 + this.seat) * 0.008; target.bend = 0; target.sit = 0;
    target.sq = Math.sin(t * 2 + this.seat) * 0.02;
    // The face reads from the group camera: the head turns toward it (a glance back now and then).
    const toCam = Math.atan2(camera.position.z - this.z, camera.position.x - this.x);
    let rel = toCam - this.facing;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const glance = 0.5 + 0.5 * Math.sin(t * 0.45 + this.seat * 1.9);
    target.headY = -Math.max(-1.1, Math.min(1.1, rel)) * (0.35 + 0.5 * glance * glance);
    target.headX = 0.12;
    let rodVisible = true;
    let showBobber = false;
    let sag = 0.5;
    let shake = 0;
    const bob = this.bob;
    const mode = lake.campfire ? "walk" : f.mode;
    if (moving && mode === "walk") {
      this.walkPhase += dt * (4 + this.speed * 2.2);
      const s = Math.sin(this.walkPhase);
      target.legL = s * 0.75; target.legR = -s * 0.75;
      target.armLx = -s * 0.6; target.armRx = s * 0.6 - 0.1;
      const hop = Math.abs(Math.cos(this.walkPhase));
      target.bodyY = hop * 0.06;
      // Squash at the bottom of each step, stretch at the top.
      target.sq = (hop - 0.5) * 0.16;
      target.lean = 0.14;
      target.headY *= 0.3;
    }
    if (lake.campfire) {
      target.sit = 1; target.legL = -1.45; target.legR = -1.45; target.armLx = -0.6; target.armRx = -0.6; target.armLz = 0.3; target.armRz = -0.3;
      target.headX = Math.sin(t * 0.8 + this.seat) * 0.06;
      rodVisible = false;
    }
    if (mode === "cast" && f.bobber) {
      const c = (sn - f.castAt) / CAST_FLIGHT_MS;
      if (c < 0.22) target.armRx = -2.9;
      else if (c < 0.5) target.armRx = -0.45;
      else target.armRx = -0.8;
      target.armLx = -0.9; target.armLz = -0.45;
      target.bend = c < 0.22 ? -0.4 : c < 0.5 ? 0.6 : 0.15;
      target.lean = c < 0.22 ? -0.22 : c < 0.5 ? 0.26 : 0.08;
      target.sq = c < 0.22 ? -0.06 : c < 0.5 ? 0.08 : 0;
      target.headY *= 0.2;
      showBobber = true;
      const fl = Math.min(1, Math.max(0, (c - 0.3) / 0.7));
      this.tipWorld();
      bob.set(this.tip.x + (f.bobber.x - this.tip.x) * fl, 0, this.tip.z + (f.bobber.z - this.tip.z) * fl);
      bob.y = this.tip.y * (1 - fl) + Math.sin(fl * Math.PI) * 3.2 + 0.05 * fl;
      sag = 0.05;
      if (c >= 1 && !this.plopped) {
        this.plopped = true;
        fx.plop(f.bobber.x, f.bobber.z, t);
      }
    }
    if ((mode === "wait" || mode === "bite") && f.bobber) {
      if (!this.plopped && sn >= f.castAt + CAST_FLIGHT_MS) {
        this.plopped = true;
        fx.plop(f.bobber.x, f.bobber.z, t);
      }
      showBobber = true;
      target.armRx = -0.8; target.armLx = -0.95; target.armLz = -0.45; target.bend = 0.12;
      bob.set(f.bobber.x, 0.06 + Math.sin(t * 2.4 + this.seat) * 0.03, f.bobber.z);
      // Nibbles: a little dip and ring.
      const n = f.nibbles[this.nibbleIdx];
      if (n !== undefined && sn >= n) {
        fx.nibble(f.bobber.x, f.bobber.z, t);
        this.nibbleIdx++;
      }
      for (const nt of f.nibbles) {
        const age = sn - nt;
        if (age > 0 && age < 450) bob.y -= Math.sin((age / 450) * Math.PI) * 0.16;
      }
      if (mode === "bite" || sn >= f.biteAt) {
        if (this.biteKey !== f.biteAt && sn < f.biteAt + 2500) {
          this.biteKey = f.biteAt;
          fx.biteSplash(f.bobber.x, f.bobber.z, t);
          this.biteAcc = 0;
        }
        if (mode === "bite") {
          // The bobber dives and shakes; spray keeps coming.
          const age = (sn - f.biteAt) / 1000;
          bob.y = -0.22 + Math.sin(t * 22) * 0.06 + Math.max(0, 0.4 - age * 2) * -0.3;
          bob.x += Math.sin(t * 17) * 0.07;
          bob.z += Math.cos(t * 13) * 0.07;
          target.bend = 0.75 + Math.sin(t * 25) * 0.15;
          target.armRx = -0.65;
          target.lean = 0.12;
          sag = 0.05;
          this.biteAcc += dt;
          if (this.biteAcc > 0.28) {
            this.biteAcc = 0;
            fx.thrash(f.bobber.x, f.bobber.z, t, 0.6);
          }
          shadows.add(f.bobber.x + 0.3, f.bobber.z, t * 4, 1.6, Math.sin(t * 20) * 0.4, 0.04, 0.16, 0.2);
        }
      }
    }
    if (mode === "reel" && f.reel && f.bobber) {
      const def = fishById(f.reel.fishId);
      const thrash = def ? thrashingAt(def.fight, f.reel, sn) : false;
      this.dispProgress += (f.reel.progress - this.dispProgress) * damp(4, dt);
      const pr = Math.max(0, (this.dispProgress - REEL_START) / (1 - REEL_START));
      const dx = f.bobber.x - this.x;
      const dz = f.bobber.z - this.z;
      const near = 0.28;
      showBobber = true;
      bob.set(f.bobber.x - dx * (1 - near) * pr * 0.85, 0, f.bobber.z - dz * (1 - near) * pr * 0.85);
      const hold = f.reel.holding;
      target.armRx = -1.05 + (hold ? Math.sin(t * 9) * 0.06 : 0);
      target.armLx = hold ? -1.0 + Math.sin(t * 12) * 0.35 : -0.9;
      target.armLz = -0.45;
      target.lean = thrash ? -0.34 + Math.sin(t * 18) * 0.05 : -0.24;
      target.headY *= 0.25;
      target.bend = thrash ? 1.45 + Math.sin(t * 30) * 0.12 : hold ? 0.95 : 0.55;
      sag = 0;
      shake = thrash ? 0.16 : hold ? 0.035 : 0.015;
      bob.y = thrash ? -0.12 + Math.sin(t * 26) * 0.08 : 0.02 + Math.sin(t * 5) * 0.03;
      if (thrash) {
        bob.x += Math.sin(t * 19) * 0.12;
        bob.z += Math.cos(t * 15) * 0.12;
        this.thrashAcc += dt;
        if (this.thrashAcc > 0.11) {
          this.thrashAcc = 0;
          fx.thrash(bob.x, bob.z, t, 1);
        }
      }
      const head = Math.atan2(dz, dx) + Math.sin(t * (thrash ? 14 : 4)) * (thrash ? 0.8 : 0.4);
      const big = def ? 0.9 + Math.min(1.6, f.reel.cm / 60) : 1.2;
      shadows.add(bob.x + Math.cos(head) * 0.35, bob.z + Math.sin(head) * 0.35, head, big * 1.25, Math.sin(t * (thrash ? 24 : 8)) * 0.25, 0.03, 0.14, 0.18);
    }
    if (showBobber) {
      this.lastBobX = bob.x;
      this.lastBobZ = bob.z;
    }
    // Got away: a splash and a shadow darting off.
    if (f.missSeq !== this.missSeq) {
      if (this.missSeq >= 0 && f.missSeq > this.missSeq && f.bobber) fx.missSplash(f.bobber.x, f.bobber.z, t, Math.atan2(f.bobber.z - f.pos.z, f.bobber.x - f.pos.x));
      this.missSeq = f.missSeq;
    }
    // ---- the catch ----
    const cseq = f.catch?.seq ?? -1;
    if (cseq !== this.catchSeq) {
      this.catchSeq = cseq;
      if (f.catch && sn - f.catch.at < CATCH_SHOW_MS - 400) {
        const def = fishById(f.catch.fishId);
        this.catchStart = t - Math.max(0, Math.min(0.3, (sn - f.catch.at) / 1000));
        const from = liftFrom({ x: this.x, z: this.z }, { x: this.lastBobX || this.x + Math.cos(this.facing) * 2, z: this.lastBobZ || this.z + Math.sin(this.facing) * 2 }, LIFT_REACH);
        this.catchFromX = from.x;
        this.catchFromZ = from.z;
        this.catchId = f.catch.fishId;
        this.catchNew = f.catch.isNew;
        this.catchGolden = f.catch.golden;
        this.catchJunk = def?.rarity === "junk";
        const rar = def?.rarity ?? "common";
        this.catchTier = rar === "legendary" ? 2 : rar === "rare" || rar === "treasure" ? 1 : 0;
        this.catchCm = f.catch.cm;
        this.catchEnd = -1;
        this.catchAspect = this.card.paint(this.textures.image(this.catchId), def?.glow ? (def.colors.accent) : "rgba(255,255,255,0.95)");
        fx.leap(this.catchFromX, this.catchFromZ, t, this.catchJunk);
      }
    }
    this.turnToCamera = 0;
    this.reachTarget.l = 1;
    this.reachTarget.r = 1;
    const inCatch = this.catchStart >= 0;
    if (inCatch) {
      const age = t - this.catchStart;
      const still = f.mode === "catch" && !lake.campfire;
      // Held up for ~2 s (in time with the camera's push-in), then tucked away.
      if ((!still || age > TUCK_AT) && this.catchEnd < 0) this.catchEnd = t;
      const out = this.catchEnd >= 0 ? Math.min(1, (t - this.catchEnd) / TUCK_S) : 0;
      if (out >= 1) {
        this.catchStart = -1;
        this.card.group.visible = false;
        this.pillar.visible = false;
        fx.sparkle(this.x, this.y + 1.6, this.z, 8, 1, 0.95, 0.8, 1.2, 0.25);
      } else {
        this.updateCard(age, out, t, dt, camera, fx);
        if (still) {
          rodVisible = age < LEAP_S * 0.6;
          const up = Math.min(1, age / LEAP_S) * (1 - out);
          // Round 13: both arms out in front at chest height, a mitten under each end of the fish (overhead
          // read as a sprite over the head). The arms reach a little longer to get round it.
          target.armLx = -0.8 + (HOLD_ARM_X + 0.8) * up;
          target.armRx = target.armLx;
          target.armLz = HOLD_ARM_Z * up;
          target.armRz = -HOLD_ARM_Z * up;
          this.reachTarget.l = 1 + HOLD_REACH * up;
          this.reachTarget.r = 1 + HOLD_REACH * up;
          target.lean = -0.06 * up;
          target.headX = -0.1 * up;
          target.headY = 0;
          target.sq = -0.05 * up;
          this.turnToCamera = up;
          const hop = age > LEAP_S ? Math.max(0, Math.sin((age - LEAP_S) * 9)) * Math.max(0, 1 - (age - LEAP_S) * 0.6) : 0;
          target.bodyY = hop * 0.12;
        }
      }
    }
    // ---- apply the pose (smoothed) ----
    const pz2 = this.pose;
    const kk = damp(mode === "cast" ? 22 : 12, dt);
    pz2.legL += (target.legL - pz2.legL) * kk;
    pz2.legR += (target.legR - pz2.legR) * kk;
    pz2.armLx += (target.armLx - pz2.armLx) * kk;
    pz2.armLz += (target.armLz - pz2.armLz) * kk;
    pz2.armRx += (target.armRx - pz2.armRx) * kk;
    pz2.armRz += (target.armRz - pz2.armRz) * kk;
    pz2.bodyY += (target.bodyY - pz2.bodyY) * kk;
    pz2.lean += (target.lean - pz2.lean) * kk;
    pz2.tilt += (target.tilt - pz2.tilt) * kk;
    pz2.headX += (target.headX - pz2.headX) * kk;
    pz2.headY += (target.headY - pz2.headY) * damp(4, dt);
    pz2.sq += (target.sq - pz2.sq) * kk;
    pz2.bend += (target.bend - pz2.bend) * kk;
    pz2.sit += (target.sit - pz2.sit) * kk;
    rig.legL.rotation.x = pz2.legL;
    rig.legR.rotation.x = pz2.legR;
    rig.armL.rotation.set(pz2.armLx, 0, pz2.armLz);
    rig.armR.rotation.set(pz2.armRx, 0, pz2.armRz);
    this.reach.l += (this.reachTarget.l - this.reach.l) * kk;
    this.reach.r += (this.reachTarget.r - this.reach.r) * kk;
    rig.armL.scale.set(1, this.reach.l, 1);
    rig.armR.scale.set(1, this.reach.r, 1);
    rig.body.position.y = pz2.bodyY - pz2.sit * 0.16;
    rig.body.rotation.set(pz2.lean, 0, pz2.tilt);
    rig.head.rotation.set(pz2.headX, pz2.headY, 0);
    rig.body.scale.set(1 - pz2.sq * 0.5, 1 + pz2.sq, 1 - pz2.sq * 0.5);
    this.turnW += (this.turnToCamera - this.turnW) * damp(5, dt);
    if (this.turnW > 0.001) {
      const toCam = Math.atan2(camera.position.z - this.z, camera.position.x - this.x);
      root.rotation.y = Math.PI / 2 - angleLerp(this.facing, toCam, this.turnW * 0.85);
    }
    const tier = Math.max(0, Math.min(3, lake.rodTier));
    for (let i = 0; i < rig.rods.length; i++) rig.rods[i]!.root.visible = rodVisible && i === tier;
    const rod = rig.rods[tier]!;
    for (let s = 0; s < ROD_SEGMENTS; s++) rod.pivots[s]!.rotation.x = (pz2.bend / ROD_SEGMENTS) * (0.4 + s * 0.45);
    // Marker ring pulse (brighter on a bite so the kid sees it's his).
    const biting = mode === "bite";
    rig.markerMat.opacity = biting ? 0.6 + 0.4 * Math.sin(t * 16) : 0.55 + 0.1 * Math.sin(t * 2);
    rig.marker.scale.setScalar(biting ? 1.25 : 1);
    if (!inCatch) this.tagLift = 0;
    rig.tag.position.set(this.x, this.y + (lake.campfire ? 3.0 + (this.seat % 2) * 0.5 : 3.4) * Math.min(1, this.appear * 1.4) + this.tagLift, this.z);
    // The name tag stays up through a catch, lifted over the fish held overhead.
    rig.tag.visible = true;
    rig.tag.scale.set(0.17, 0.0374, 1);

    // ---- bobber + line ----
    this.bobberVisible = showBobber;
    this.bobber.visible = showBobber;
    if (showBobber) this.bobber.position.copy(bob);
    root.updateMatrixWorld(true);
    let lineTo: Vector3 | null = showBobber ? bob : null;
    if (inCatch && this.card.group.visible && t - this.catchStart < LEAP_S * 0.6 && rodVisible) lineTo = this.card.group.position;
    if (lineTo && rod.root.visible) {
      this.tipWorld();
      this.lineShake += (shake - this.lineShake) * damp(10, dt);
      this.lineT = t;
      this.updateLine(this.tip, lineTo, sag, camera);
      this.line.visible = true;
    } else this.line.visible = false;
    if (this.upgradeFlash > 0) this.upgradeFlash = Math.max(0, this.upgradeFlash - dt);
  }

  private tipWorld(): void {
    let rod = this.rig.rods[0]!;
    for (const r of this.rig.rods) if (r.root.visible) rod = r;
    this.rig.root.updateMatrixWorld(true);
    rod.tip.getWorldPosition(this.tip);
  }

  private updateCard(age: number, out: number, t: number, dt: number, camera: Camera, fx: Fx): void {
    const g = this.card.group;
    g.visible = true;
    const s = Math.min(1, age / LEAP_S);
    const tier = this.catchTier;
    const w = (2.3 + Math.min(1.4, this.catchCm / 60)) * (this.catchNew ? 1.12 : 1) * (tier === 2 ? 1.15 : 1);
    // Round 13: held in both hands across the chest (overhead it read as a sprite hovering over the head):
    // the card sits on the hands, just behind them, sized so its top stays under the chin (holdCard.ts).
    let screenW = 0;
    if (camera instanceof PerspectiveCamera) {
      const dist = Math.hypot(camera.position.x - this.x, camera.position.y - this.y - 1.5, camera.position.z - this.z);
      screenW = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist * camera.aspect;
    }
    const held = holdCard({ base: w * (CARD_PX / FISH_PX) * 0.8, aspect: this.catchAspect, headHalf: HEAD_HALF, screenW });
    this.rig.hand.getWorldPosition(this.handA);
    this.handB.set(0, -0.18, 0);
    this.rig.armL.localToWorld(this.handB);
    this.toCam.copy(camera.position).sub(this.handA).setY(0).normalize();
    const chest = chestHold({ size: held.size, aspect: this.catchAspect, handsY: (this.handA.y + this.handB.y) / 2, chinY: this.y + CHIN_Y, feetY: this.y });
    const W0 = chest.size;
    // In front of the body, slid toward the lens along the view ray through the chest point (so on screen
    // it sits exactly where chestHold put it, top under the chin), just behind the mittens.
    this.hold.set(this.x, chest.centreY, this.z);
    this.tmp.copy(camera.position).sub(this.hold).normalize();
    // Round 16: the plane runs through the mittens (their mid point's depth along the view ray, never into
    // the belly), so each mitten is half in front of the fish, gripping it, instead of a sticker on top.
    const handsDepth = (this.handA.x + this.handB.x) / 2 - this.hold.x;
    const hd = handsDepth * this.tmp.x + ((this.handA.y + this.handB.y) / 2 - this.hold.y) * this.tmp.y + ((this.handA.z + this.handB.z) / 2 - this.hold.z) * this.tmp.z;
    this.hold.addScaledVector(this.tmp, Math.min(HOLD_FRONT + 0.25, Math.max(HOLD_FRONT, hd)));
    this.tagLift = 0;
    // The lift: out of the water on the way to the bobber (never more than LIFT_REACH out, so a double
    // catch never puts a fish between two fishers), a short arc into the hands.
    const e = s * s * (3 - 2 * s);
    let gx = this.catchFromX + (this.hold.x - this.catchFromX) * e;
    let gz = this.catchFromZ + (this.hold.z - this.catchFromZ) * e;
    let gy = -0.35 + (this.hold.y + 0.35) * e + Math.sin(s * Math.PI) * 0.45;
    // Tucked away: down into the fisher's pack.
    const o = out * out * (3 - 2 * out);
    gx += (this.x - gx) * o;
    gz += (this.z - gz) * o;
    gy += (this.y + 1.4 - gy) * o;
    g.position.set(gx, gy, gz);
    g.quaternion.copy(camera.quaternion);
    // Grows out of the splash quickly (never pops in, never reads as a thumbnail), a little overshoot on
    // landing; tucked away by fading, not by shrinking to a speck.
    const grow = Math.min(1, age / 0.22);
    const emerge = 0.45 + 0.55 * (1 - (1 - grow) * (1 - grow));
    const land = age >= LEAP_S ? Math.max(0, 0.16 - (age - LEAP_S) * 0.5) * Math.sin(Math.min(Math.PI, (age - LEAP_S) * 9)) : 0;
    const scale = (age < LEAP_S ? emerge * (0.8 + 0.2 * s) : 1 + land) * (1 - 0.25 * o);
    this.card.cardMat.opacity = 1 - o;
    const W = W0 * Math.max(0.001, scale);
    this.card.card.scale.set(W, W, 1);
    const wiggle = age < LEAP_S ? (this.catchJunk ? s * Math.PI * 2 : Math.sin(age * 22) * 0.2) : Math.sin(age * 6) * 0.05;
    // Held, not pinned: tilted a touch, head up, toward the catcher's side of the frame.
    this.card.card.rotation.z = wiggle * (1 - o) + HOLD_TILT * Math.min(1, age / LEAP_S) * (1 - o);
    // Rays behind rare catches and new species (gold); legendary: bigger, brighter.
    const rayOn = tier >= 1 || this.catchNew || this.catchGolden;
    const rayK = rayOn && age > LEAP_S * 0.8 ? Math.min(1, (age - LEAP_S * 0.8) * 3) * (1 - out) : 0;
    this.card.rays.visible = rayK > 0;
    this.card.rays.rotation.z = t * (tier === 2 ? 0.9 : 0.6);
    // Kept tight round the fish and soft, so they never wash over the catcher beside it.
    this.card.rays.scale.setScalar(W0 * (FISH_PX / CARD_PX) * (tier === 2 ? 0.95 : this.catchNew ? 0.85 : 0.75) * (0.85 + 0.15 * Math.sin(t * 3)) * (1 - o));
    this.card.raysMat.color.setRGB(1, 0.9, 0.6).multiplyScalar(rayK * (tier === 2 ? 0.55 : 0.45));
    // Legendary: a soft gold light pillar over the fisher.
    const pil = tier === 2 && age > LEAP_S * 0.7 ? Math.min(1, (age - LEAP_S * 0.7) * 2) * (1 - out) : 0;
    this.pillar.visible = pil > 0.001;
    if (this.pillar.visible) {
      this.pillar.position.set(this.x, this.y, this.z);
      this.pillarMat.uniforms.uStrength!.value = pil * 0.5;
      this.pillarMat.uniforms.uTime!.value = t;
    }
    if (age < LEAP_S && Math.random() < 0.7) fx.drip(gx, gy - 0.3, gz);
    if (age >= LEAP_S && age - dt < LEAP_S) {
      // Lands in the hands: the burst grows with rarity.
      // Round 11: capped (a legendary's 100-odd sparkles hid Juneau's face at night).
      const n = tier === 2 ? 36 : tier === 1 ? 22 : 10;
      const gold = tier >= 1 || this.catchNew;
      fx.sparkle(gx, gy, gz, n, 1, gold ? 0.88 : 1, gold ? 0.45 : 0.95, tier === 2 ? 6 : tier === 1 ? 3.6 : 2.0, tier === 2 ? 0.6 : 0.4);
      if (this.catchGolden || tier === 2) fx.confetti(gx, gy + 0.5, gz);
      if (this.catchNew) fx.sparkle(gx, gy, gz, 14, 1, 1, 1, 6, 0.3);
      if (tier === 2) fx.upgradeBurst(gx, gy - 1.6, gz);
    }
    if (age >= LEAP_S && out === 0) {
      this.sparkAcc += dt * (tier === 2 ? 12 : tier === 1 || this.catchNew ? 8 : 4);
      while (this.sparkAcc > 1) {
        this.sparkAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const rr = w * 0.7;
        const gold = tier >= 1 || this.catchNew;
        fx.sparkle(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr * 0.6, gz, 1, 1, gold ? 0.88 : 1, gold ? 0.5 : 0.95, 0.6, 0.35);
      }
    }
  }

  private updateLine(a: Vector3, b: Vector3, sag: number, camera: Camera): void {
    const p = this.linePos;
    const width = 0.035;
    for (let i = 0; i <= LINE_SEGS; i++) {
      const s = i / LINE_SEGS;
      const x = a.x + (b.x - a.x) * s;
      const z = a.z + (b.z - a.z) * s;
      const y = a.y + (b.y - a.y) * s - sag * 4 * s * (1 - s) * 1.2;
      // Side vector: perpendicular to the line and the view direction.
      this.tmp.set(b.x - a.x, b.y - a.y, b.z - a.z);
      this.camDir.set(camera.position.x - x, camera.position.y - y, camera.position.z - z);
      this.side.crossVectors(this.tmp, this.camDir);
      const l = this.side.length();
      if (l > 1e-6) this.side.multiplyScalar(width / l);
      else this.side.set(width, 0, 0);
      // A taut line shivers and, with a fighting fish, thrashes in a travelling wave (perpendicular to the view).
      const wave = this.lineShake * Math.sin(s * Math.PI * 3 - this.lineT * 38) * 4 * s * (1 - s) / width;
      const ox = this.side.x * wave;
      const oy = this.side.y * wave;
      const oz = this.side.z * wave;
      const k = i * 6;
      p[k] = x + ox - this.side.x;
      p[k + 1] = y + oy - this.side.y;
      p[k + 2] = z + oz - this.side.z;
      p[k + 3] = x + ox + this.side.x;
      p[k + 4] = y + oy + this.side.y;
      p[k + 5] = z + oz + this.side.z;
    }
    this.lineGeo.attributes.position!.needsUpdate = true;
  }

  dispose(): void {
    this.rig.dispose();
    this.lineGeo.dispose();
    this.card.dispose();
    this.pillar.geometry.dispose();
    this.pillarMat.dispose();
  }
}

export type CatchFocus = { x: number; y: number; z: number; age: number };

export class FisherViews {
  readonly group = new Group();
  private readonly views: FisherView[];
  private readonly bobberGeo: BufferGeometry;
  private readonly lineMat: MeshBasicMaterial;
  private upgradeSeq = -1;
  private readonly bySeat: (Fisher | undefined)[] = [undefined, undefined, undefined, undefined];
  private readonly tagBoxes: TagBox[] = [];
  private readonly tv = new Vector3();
  /** The catch the camera is pushing toward (the first one, held until it ends). */
  private focusView: FisherView | null = null;

  constructor(
    mats: RigMaterials,
    cardGeo: { rays: BufferGeometry; plane: PlaneGeometry },
    textures: FishTextures,
    private readonly fx: Fx,
    private readonly shadows: FishShadows,
  ) {
    this.group.name = "fishers";
    this.bobberGeo = bobberGeometry();
    this.lineMat = new MeshBasicMaterial({ color: 0xf4f8ff, side: DoubleSide, transparent: true, opacity: 0.9, depthWrite: false });
    this.views = [0, 1, 2, 3].map((s) => new FisherView(s, mats, this.bobberGeo, mats.body, this.lineMat, cardGeo, textures));
    for (const v of this.views) v.attach(this.group);
  }

  showAllForPrewarm(): void {
    for (const v of this.views) v.showAllForPrewarm();
  }

  hideAll(): void {
    for (const v of this.views) v.hideAll();
  }

  /** Where a riding seat stands on its boat or zeppelin (set by the scene). */
  rideOf: ((seat: number, out: { x: number; y: number; z: number; facing: number }) => boolean) | null = null;
  private readonly ridePose = { x: 0, y: 0, z: 0, facing: 0 };

  frame(lake: Lake | null, sn: number, t: number, dt: number, camera: Camera, campSeats: { x: number; z: number; facing: number }[]): void {
    for (let i = 0; i < 4; i++) this.bySeat[i] = undefined;
    if (lake) for (const f of lake.fishers) if (f.seat >= 0 && f.seat < 4) this.bySeat[f.seat] = f;
    if (lake) {
      if (this.upgradeSeq >= 0 && lake.upgradeSeq > this.upgradeSeq) {
        for (const v of this.views) if (v.present) {
          this.fx.upgradeBurst(v.x, v.y, v.z);
          v.upgradeFlash = 1.5;
        }
      }
      this.upgradeSeq = lake.upgradeSeq;
    }
    let ci = 0;
    for (let i = 0; i < 4; i++) {
      const f = this.bySeat[i];
      const seat = f ? campSeats[ci++ % campSeats.length] : undefined;
      const riding = f && this.rideOf ? this.rideOf(i, this.ridePose) : false;
      if (lake) this.views[i]!.frame(f, lake, sn, t, dt, camera, this.fx, this.shadows, seat, riding ? this.ridePose : null);
    }
    this.spreadCards(camera, dt);
    this.spreadTags(camera, dt);
  }

  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly cards: { v: FisherView; along: number; h: number; hw: number; dx: number }[] = [];

  /**
   * Two catches at once are shown side by side, never stacked: held fish cards that overlap on screen
   * are pushed apart along the camera's right axis (eased, so they glide apart).
   */
  private spreadCards(camera: Camera, dt: number): void {
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const list = this.cards;
    list.length = 0;
    for (const v of this.views) {
      const g = v.card.group;
      if (!v.present || !g.visible || v.catchStart < 0) continue;
      const hw = Math.abs(v.card.card.scale.x) * 0.5 * 0.92;
      list.push({ v, along: g.position.dot(this.right), h: g.position.dot(this.up), hw, dx: 0 });
    }
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          const ax = a.along + a.dx;
          const bx = b.along + b.dx;
          const ox = a.hw + b.hw - Math.abs(ax - bx);
          const oy = a.hw * 0.8 + b.hw * 0.8 - Math.abs(a.h - b.h);
          if (ox <= 0 || oy <= 0) continue;
          const sgn = ax < bx || (ax === bx && a.v.seat < b.v.seat) ? 1 : -1;
          a.dx -= (sgn * ox) / 2;
          b.dx += (sgn * ox) / 2;
        }
      }
    }
    const k = damp(6, dt);
    for (const v of this.views) {
      const c = list.find((x) => x.v === v);
      v.cardDx += ((c ? c.dx : 0) - v.cardDx) * k;
      if (c) v.card.group.position.addScaledVector(this.right, v.cardDx);
    }
  }

  private readonly tagShift: TagShift[] = [];
  private readonly tagViews: FisherView[] = [];

  /** Name tags never overlap: close fishers' tags are staggered into two rows and pushed apart (tagLayout.ts). */
  private spreadTags(camera: Camera, dt: number): void {
    const P = camera.projectionMatrix.elements;
    const p00 = P[0]!;
    const p11 = P[5]!;
    const tags = this.tagBoxes;
    const views = this.tagViews;
    tags.length = 0;
    views.length = 0;
    for (const v of this.views) {
      const tag = v.rig.tag;
      if (!v.present || !tag.visible) continue;
      this.tv.copy(tag.position).project(camera);
      tags.push({ x: this.tv.x, y: this.tv.y, hw: (v.rig.tagFrac * tag.scale.x * p00) / 2, h: tag.scale.y * p11, seat: v.seat });
      views.push(v);
    }
    layoutTags(tags, this.tagShift);
    const k = damp(16, dt);
    for (let i = 0; i < views.length; i++) {
      const v = views[i]!;
      const s = this.tagShift[i]!;
      v.tagDx += (s.dx - v.tagDx) * k;
      v.tagDy += (s.dy - v.tagDy) * k;
      v.rig.tag.center.set(0.5 - v.tagDx / Math.max(1e-6, v.rig.tag.scale.x * p00), -v.tagDy / Math.max(1e-6, v.rig.tag.scale.y * p11));
    }
  }

  /** Points to frame: every present fisher (and their bobbers). */
  forEachFocus(fn: (x: number, y: number, z: number) => void): void {
    for (const v of this.views) {
      if (!v.present) continue;
      fn(v.x, v.y, v.z);
      if (v.bobberVisible) fn(v.bob.x, Math.max(0, v.bob.y), v.bob.z);
    }
  }

  /** Every present fisher by seat, with their colour name and bobber (null when none is out). */
  forEachSeat(fn: (seat: number, x: number, y: number, z: number, color: string, bob: Vector3 | null) => void): void {
    for (const v of this.views) if (v.present) fn(v.seat, v.x, v.y, v.z, v.color, v.bobberVisible ? v.bob : null);
  }

  /** Every shown name tag (drawn over the finished frame, after the painterly post chain). */
  /** Every present fisher's face (head centre, world): sparkles keep off it. */
  forEachFace(fn: (x: number, y: number, z: number) => void): void {
    for (const v of this.views) {
      if (!v.present) continue;
      v.rig.head.getWorldPosition(this.faceTmp);
      fn(this.faceTmp.x, this.faceTmp.y, this.faceTmp.z);
    }
  }
  private readonly faceTmp = new Vector3();

  forEachTag(fn: (tag: Object3D) => void): void {
    for (const v of this.views) if (v.rig.tag.visible && v.rig.tag.parent) fn(v.rig.tag);
  }

  forEachFisher(fn: (x: number, y: number, z: number) => void): void {
    for (const v of this.views) if (v.present) fn(v.x, v.y, v.z);
  }

  /** The catch the camera pushes toward: the first to start, held until it ends (null when none). */
  /** The current catch shared the screen with another: no push-in for it. */
  private focusShared = false;

  catchFocus(t: number, out: CatchFocus): CatchFocus | null {
    const cur = this.focusView;
    if (cur && (!cur.present || cur.catchStart < 0)) {
      this.focusView = null;
      this.focusShared = false;
    }
    if (!this.focusView) {
      // Only a fresh catch takes the camera; one already under way when another ends does not.
      let best: FisherView | null = null;
      for (const v of this.views) {
        if (v.present && v.catchStart >= 0 && t - v.catchStart < 0.4 && (!best || v.catchStart < best.catchStart)) best = v;
      }
      this.focusView = best;
    }
    const found = this.focusView;
    if (!found) return null;
    // Only one catch at a time gets the push-in: with two fish up the camera keeps both catchers.
    let up = 0;
    for (const v of this.views) if (v.present && v.catchStart >= 0) up++;
    if (up > 1) this.focusShared = true;
    if (this.focusShared) return null;
    out.x = found.x;
    out.y = found.y + 1.8;
    out.z = found.z;
    out.age = t - found.catchStart;
    return out;
  }

  debug(): unknown[] {
    return this.views.map((v) => {
      return {
        seat: v.seat,
        present: v.present,
        cardVisible: v.card.group.visible,
        cardPos: v.card.group.position.toArray(),
        cardScale: v.card.card.scale.toArray(),
        catchStart: v.catchStart,
        tag: { visible: v.rig.tag.visible, dx: v.tagDx, dy: v.tagDy },
      };
    });
  }

  presentCount(): number {
    return this.views.filter((v) => v.present).length;
  }

  dispose(): void {
    for (const v of this.views) v.dispose();
    this.bobberGeo.dispose();
    this.lineMat.dispose();
  }
}

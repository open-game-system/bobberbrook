import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  CylinderGeometry,
  Vector3,
  type Camera,
  type PlaneGeometry,
} from "three";
import { CAST_FLIGHT_MS, CATCH_SHOW_MS, type Fisher, type Lake } from "../../game/lake";
import { REEL_START, thrashingAt } from "../../game/reel";
import { fishById } from "../../game/fish";
import { onDock, walkable, type Vec } from "../../game/world";
import { FISHER_SCALE, ROD_SEGMENTS, buildFisher, type FisherRig, type RigMaterials } from "./character";
import { CatchCard, type FishShadows, type FishTextures } from "./fishviz";
import type { Fx } from "./fx";
import { damp } from "./noise";
import { heightAt } from "./terrain";
import { merge, paint, prep } from "./geo";

const DECK_Y = 0.42;
const LINE_SEGS = 18;
const LEAP_S = 0.95;
const COLORS = ["green", "yellow", "blue", "pink"] as const;

const scratch: Vec = { x: 0, z: 0 };
const predicted: Vec = { x: 0, z: 0 };

/** Dead reckoning with the room's own walkability (no allocation). Capped at 1.2 s of prediction. */
function predict(f: Fisher, serverNow: number, out: Vec): void {
  let x = f.pos.x;
  let z = f.pos.z;
  const vx = f.vel.x;
  const vz = f.vel.z;
  if (vx !== 0 || vz !== 0) {
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
  return onDock(scratch) ? DECK_Y : Math.max(heightAt(x, z), -0.25);
}

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function bobberGeometry(): BufferGeometry {
  const top = paint(prep(new SphereGeometry(0.15, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2)), 0xffffff, 0xffffff);
  const bottom = paint(prep(new SphereGeometry(0.15, 14, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), 0xe02a2a, 0xff4a3a);
  const band = paint(prep(new CylinderGeometry(0.152, 0.152, 0.03, 14)), 0x2a2a2a);
  const stick = paint(prep(new CylinderGeometry(0.018, 0.018, 0.16, 6).translate(0, 0.2, 0)), 0xe02a2a);
  return merge([top, bottom, band, stick]);
}

type Pose = { legL: number; legR: number; armLx: number; armLz: number; armRx: number; armRz: number; bodyY: number; lean: number; tilt: number; headX: number; bend: number; sit: number };
const zeroPose = (): Pose => ({ legL: 0, legR: 0, armLx: 0, armLz: 0, armRx: 0, armRz: 0, bodyY: 0, lean: 0, tilt: 0, headX: 0, bend: 0, sit: 0 });

class FisherView {
  readonly rig: FisherRig;
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
  private catchFromX = 0;
  private catchFromZ = 0;
  private catchId = "";
  private catchNew = false;
  private catchGolden = false;
  private catchJunk = false;
  private catchCm = 30;
  private catchEnd = -1;
  private sparkAcc = 0;
  readonly hold = new Vector3();
  private readonly tip = new Vector3();
  private readonly tmp = new Vector3();
  private readonly side = new Vector3();
  private readonly camDir = new Vector3();
  upgradeFlash = 0;

  constructor(
    readonly seat: number,
    mats: RigMaterials,
    bobberGeo: BufferGeometry,
    bobberMat: MeshBasicMaterial | import("three").MeshLambertMaterial,
    lineMat: MeshBasicMaterial,
    cardGeo: { rays: BufferGeometry; plane: PlaneGeometry },
    private readonly textures: FishTextures,
  ) {
    this.rig = buildFisher(seat, COLORS[seat]!, mats);
    this.bobber = new Mesh(bobberGeo, bobberMat);
    this.bobber.scale.setScalar(1.6);
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
    this.card = new CatchCard(textures.placeholder, cardGeo.rays, cardGeo.plane);
  }

  attach(parent: Group): void {
    parent.add(this.rig.root, this.bobber, this.line, this.card.group, this.rig.tag);
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
  }

  hideAll(): void {
    this.rig.root.visible = false;
    this.bobber.visible = false;
    this.line.visible = false;
    this.card.group.visible = false;
    this.rig.tag.visible = false;
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
    const rig = this.rig;
    rig.setName(f.name);
    // ---- position ----
    let tx: number;
    let tz: number;
    let tFacing: number;
    if (lake.campfire && campSeat) {
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
    const k = far ? 1 : damp(lake.campfire ? 3 : 9, dt);
    this.x += (tx - this.x) * k;
    this.z += (tz - this.z) * k;
    const sp = dt > 0 ? Math.hypot(this.x - px, this.z - pz) / dt : 0;
    this.speed += (sp - this.speed) * damp(10, dt);
    const moving = this.speed > 0.4;
    if (moving && !lake.campfire) tFacing = Math.atan2(this.z - pz, this.x - px);
    this.facing = angleLerp(this.facing, tFacing, damp(10, dt));
    this.y = groundY(this.x, this.z);
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
    let rodVisible = true;
    let showBobber = false;
    let sag = 0.5;
    const bob = this.bob;
    const mode = lake.campfire ? "walk" : f.mode;
    if (moving && mode === "walk") {
      this.walkPhase += dt * (4 + this.speed * 2.2);
      const s = Math.sin(this.walkPhase);
      target.legL = s * 0.75; target.legR = -s * 0.75;
      target.armLx = -s * 0.6; target.armRx = s * 0.6 - 0.1;
      target.bodyY = Math.abs(Math.cos(this.walkPhase)) * 0.045;
      target.lean = 0.14;
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
      target.lean = -0.18;
      target.bend = thrash ? 1.45 + Math.sin(t * 30) * 0.12 : hold ? 0.95 : 0.55;
      sag = 0;
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
      if (this.missSeq >= 0 && f.missSeq > this.missSeq && f.bobber) fx.missSplash(f.bobber.x, f.bobber.z, t);
      this.missSeq = f.missSeq;
    }
    // ---- the catch ----
    const cseq = f.catch?.seq ?? -1;
    if (cseq !== this.catchSeq) {
      this.catchSeq = cseq;
      if (f.catch && sn - f.catch.at < CATCH_SHOW_MS - 400) {
        const def = fishById(f.catch.fishId);
        this.catchStart = t - Math.max(0, Math.min(0.3, (sn - f.catch.at) / 1000));
        this.catchFromX = this.lastBobX || this.x + Math.cos(this.facing) * 4;
        this.catchFromZ = this.lastBobZ || this.z + Math.sin(this.facing) * 4;
        this.catchId = f.catch.fishId;
        this.catchNew = f.catch.isNew;
        this.catchGolden = f.catch.golden;
        this.catchJunk = def?.rarity === "junk";
        this.catchCm = f.catch.cm;
        this.catchEnd = -1;
        this.card.cardMat.map = this.textures.get(this.catchId);
        fx.leap(this.catchFromX, this.catchFromZ, t, this.catchJunk);
      }
    }
    const inCatch = this.catchStart >= 0;
    if (inCatch) {
      const age = t - this.catchStart;
      const still = f.mode === "catch" && !lake.campfire;
      if (!still && this.catchEnd < 0) this.catchEnd = t;
      const out = this.catchEnd >= 0 ? Math.min(1, (t - this.catchEnd) / 0.35) : 0;
      if (out >= 1) {
        this.catchStart = -1;
        this.card.group.visible = false;
      } else {
        this.updateCard(age, out, t, dt, camera, fx);
        if (still) {
          rodVisible = age < LEAP_S * 0.6;
          const up = Math.min(1, age / LEAP_S);
          target.armRx = -0.8 - 2.0 * up; target.armLx = -0.8 - 2.0 * up;
          target.armRz = -0.32 * up; target.armLz = 0.32 * up;
          target.lean = -0.08 * up;
          target.headX = -0.25 * up;
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
    pz2.bend += (target.bend - pz2.bend) * kk;
    pz2.sit += (target.sit - pz2.sit) * kk;
    rig.legL.rotation.x = pz2.legL;
    rig.legR.rotation.x = pz2.legR;
    rig.armL.rotation.set(pz2.armLx, 0, pz2.armLz);
    rig.armR.rotation.set(pz2.armRx, 0, pz2.armRz);
    rig.body.position.y = pz2.bodyY - pz2.sit * 0.16;
    rig.body.rotation.set(pz2.lean, 0, pz2.tilt);
    rig.head.rotation.x = pz2.headX;
    const tier = Math.max(0, Math.min(3, lake.rodTier));
    for (let i = 0; i < rig.rods.length; i++) rig.rods[i]!.root.visible = rodVisible && i === tier;
    const rod = rig.rods[tier]!;
    for (let s = 0; s < ROD_SEGMENTS; s++) rod.pivots[s]!.rotation.x = (pz2.bend / ROD_SEGMENTS) * (0.4 + s * 0.45);
    // Marker ring pulse (brighter on a bite so the kid sees it's his).
    const biting = mode === "bite";
    rig.markerMat.opacity = biting ? 0.6 + 0.4 * Math.sin(t * 16) : 0.55 + 0.1 * Math.sin(t * 2);
    rig.marker.scale.setScalar(biting ? 1.25 : 1);
    rig.tag.position.set(this.x, this.y + (lake.campfire ? 2.4 : 2.75) * Math.min(1, this.appear * 1.4), this.z);
    rig.tag.scale.set(0.15, 0.033, 1);

    // ---- bobber + line ----
    this.bobberVisible = showBobber;
    this.bobber.visible = showBobber;
    if (showBobber) this.bobber.position.copy(bob);
    root.updateMatrixWorld(true);
    let lineTo: Vector3 | null = showBobber ? bob : null;
    if (inCatch && this.card.group.visible && t - this.catchStart < LEAP_S * 0.6 && rodVisible) lineTo = this.card.group.position;
    if (lineTo && rod.root.visible) {
      this.tipWorld();
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
    this.hold.set(this.x, this.y + 3.35, this.z);
    const e = s * s * (3 - 2 * s);
    const gx = this.catchFromX + (this.hold.x - this.catchFromX) * e;
    const gz = this.catchFromZ + (this.hold.z - this.catchFromZ) * e;
    const gy = 0.1 + (this.hold.y - 0.1) * e + Math.sin(s * Math.PI) * 3.0;
    g.position.set(gx, gy, gz);
    g.quaternion.copy(camera.quaternion);
    const aspect = this.textures.aspectOf(this.catchId);
    const w = (1.3 + Math.min(1.5, this.catchCm / 70)) * (this.catchNew ? 1.15 : 1);
    const scale = (age < LEAP_S ? 0.55 + 0.45 * s : 1 + Math.max(0, 0.18 - (age - LEAP_S) * 0.6)) * (1 - out);
    this.card.card.scale.set(w * scale, (w / aspect) * scale, 1);
    const wiggle = age < LEAP_S ? (this.catchJunk ? s * Math.PI * 4 : Math.sin(age * 22) * 0.35) : Math.sin(age * 7) * 0.12;
    this.card.card.rotation.z = wiggle;
    // Rays behind a new species (gold), soft white otherwise.
    const rayK = age > LEAP_S * 0.8 ? Math.min(1, (age - LEAP_S * 0.8) * 3) * (1 - out) : 0;
    this.card.rays.visible = rayK > 0;
    this.card.rays.rotation.z = t * 0.6;
    this.card.rays.scale.setScalar(w * (this.catchNew ? 2.2 : 1.3) * (0.8 + 0.2 * Math.sin(t * 3)));
    this.card.raysMat.color.setRGB(1, this.catchNew || this.catchGolden ? 0.9 : 1, this.catchNew || this.catchGolden ? 0.6 : 1).multiplyScalar(rayK * (this.catchNew ? 1.2 : 0.45));
    if (age < LEAP_S && Math.random() < 0.6) fx.drip(gx, gy - 0.3, gz);
    if (age >= LEAP_S && age - dt < LEAP_S) {
      // Lands in the hands.
      fx.sparkle(gx, gy, gz, this.catchNew ? 46 : 22, 1, this.catchNew ? 0.88 : 1, this.catchNew ? 0.45 : 0.95, this.catchNew ? 4.2 : 2.6, this.catchNew ? 0.55 : 0.4);
      if (this.catchGolden) fx.confetti(gx, gy + 0.5, gz);
      if (this.catchNew) fx.sparkle(gx, gy, gz, 30, 1, 1, 1, 6, 0.3);
    }
    if (age >= LEAP_S && out === 0) {
      this.sparkAcc += dt * (this.catchNew ? 22 : 7);
      while (this.sparkAcc > 1) {
        this.sparkAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const rr = w * 0.7;
        fx.sparkle(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr * 0.6, gz, 1, 1, this.catchNew ? 0.88 : 1, this.catchNew ? 0.5 : 0.95, 0.6, 0.35);
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
      const k = i * 6;
      p[k] = x - this.side.x;
      p[k + 1] = y - this.side.y;
      p[k + 2] = z - this.side.z;
      p[k + 3] = x + this.side.x;
      p[k + 4] = y + this.side.y;
      p[k + 5] = z + this.side.z;
    }
    this.lineGeo.attributes.position!.needsUpdate = true;
  }

  dispose(): void {
    this.rig.dispose();
    this.lineGeo.dispose();
    this.card.dispose();
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
      if (lake) this.views[i]!.frame(f, lake, sn, t, dt, camera, this.fx, this.shadows, seat);
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

  /** The one catch happening now (null when none, or more than one at once). */
  catchFocus(t: number, out: CatchFocus): CatchFocus | null {
    let found: FisherView | null = null;
    for (const v of this.views) {
      if (v.present && v.catchStart >= 0) {
        if (found) return null;
        found = v;
      }
    }
    if (!found) return null;
    out.x = found.x;
    out.y = found.y + 1.6;
    out.z = found.z;
    out.age = t - found.catchStart;
    return out;
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

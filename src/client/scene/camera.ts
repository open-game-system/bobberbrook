import { PerspectiveCamera, Vector3 } from "three";
import { CAMPFIRE, DOCK, EAST, NORTH, WEST, lakeRadius } from "../../game/world";
import { damp } from "./noise";

export const VIEWS = ["auto", "group", "establish", "campfire", "dock", "falls", "lily", "reeds", "overview", "top"] as const;
export type ViewName = (typeof VIEWS)[number];

export function isView(v: string): v is ViewName {
  return (VIEWS as readonly string[]).includes(v);
}

/** Group camera orbit elevation: a high three-quarter, low enough that faces read. */
const EL = 0.44;
/** Pitch the view up a little after aiming: the fishers sit in the lower half, the lake above them. */
const PITCH_UP = 0.07;
/** The establishing view sits lower and looks up more, so the sky (and the moon) is in frame. */
const EST_EL = 0.3;
const EST_PITCH = 0.19;
/** Group framing limits (metres from the target). */
const MIN_DIST = 17;
const MAX_DIST = 64;
/** Where the fishers' box must fit, in NDC (x: ±, y: bottom..top; the top leaves room for name tags). */
const FIT_X = 0.8;
const FIT_Y0 = -0.82;
const FIT_Y1 = 0.5;
/** Seconds the camera takes to settle in after the scene starts (from the establishing view). */
const INTRO_S = 3.2;

export type CatchAt = { x: number; y: number; z: number; age: number };

const MAX_POINTS = 24;
/** Heights above each focus point that must be in frame: the foot ring's front edge and the name tag. */
const LIFTS = [-0.7, 4.0];

/** The group camera: from the south, high three-quarter, eased, yaw roughly fixed. */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly probe: PerspectiveCamera;
  // Current pose and the eased goal it follows (two stages: smooth start and smooth stop).
  private readonly target = new Vector3(0, 0, -1);
  private readonly goalTarget = new Vector3(0, 0, -1);
  private readonly wantTarget = new Vector3();
  private dist = 60;
  private goalDist = 60;
  private wantDist = 60;
  private yaw = 0;
  private goalYaw = 0;
  private wantYaw = 0;
  private el = EST_EL;
  private goalEl = EST_EL;
  private wantEl = EST_EL;
  private pitch = EST_PITCH;
  private catchW = 0;
  private override: ViewName = "auto";
  private readonly pts: Vector3[] = Array.from({ length: MAX_POINTS }, () => new Vector3());
  private n = 0;
  private first = true;
  private startT = -1;
  private readonly tmp = new Vector3();
  private readonly cx = new Vector3();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(36, aspect, 0.5, 1200);
    this.probe = new PerspectiveCamera(36, aspect, 0.5, 1200);
  }

  setView(v: ViewName): void {
    this.override = v;
    this.first = true;
  }

  debug(): { dist: number; catchW: number; n: number; target: number[] } {
    return { dist: this.dist, catchW: this.catchW, n: this.n, target: this.target.toArray() };
  }

  get view(): ViewName {
    return this.override;
  }

  beginFocus(): void {
    this.n = 0;
  }

  /** A point that must stay in frame (feet; the rig adds the head and name tag above it). */
  addFocus(x: number, y: number, z: number): void {
    if (this.n >= MAX_POINTS - 1) return;
    this.pts[this.n++]!.set(x, y, z);
  }

  /** The point the camera is about (for occlusion fading). */
  get focus(): Vector3 {
    return this.target;
  }

  /** Places a camera at the orbit pose (no smoothing). */
  private pose(cam: PerspectiveCamera, target: Vector3, dist: number, yaw: number, el: number, pitch: number): void {
    const ce = Math.cos(el);
    cam.position.set(target.x + Math.sin(yaw) * ce * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(yaw) * ce * dist);
    cam.lookAt(target);
    cam.rotateX(pitch);
    cam.updateMatrixWorld(true);
  }

  /**
   * Fits every focus point (feet to name tag) inside the safe box: a few rounds of "recentre, then
   * scale the distance by how much too big or small the box is". Writes wantTarget / wantDist.
   */
  private fitGroup(): void {
    const cam = this.probe;
    cam.fov = this.camera.fov;
    cam.aspect = this.camera.aspect;
    cam.updateProjectionMatrix();
    // Start from the box centre.
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, ym = 0;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i]!;
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); ym += p.y;
    }
    const t = this.cx.set((x0 + x1) / 2, ym / this.n + 1.2, (z0 + z1) / 2);
    let d = Math.min(MAX_DIST, Math.max(MIN_DIST, 0.9 * Math.max(x1 - x0, (z1 - z0) * 1.4) + 14));
    for (let iter = 0; iter < 4; iter++) {
      this.pose(cam, t, d, 0, EL, PITCH_UP);
      let nx0 = Infinity, nx1 = -Infinity, ny0 = Infinity, ny1 = -Infinity;
      for (let i = 0; i < this.n; i++) {
        const p = this.pts[i]!;
        for (const lift of LIFTS) {
          this.tmp.set(p.x, p.y + lift, p.z).project(cam);
          nx0 = Math.min(nx0, this.tmp.x); nx1 = Math.max(nx1, this.tmp.x);
          ny0 = Math.min(ny0, this.tmp.y); ny1 = Math.max(ny1, this.tmp.y);
        }
      }
      // Scale: how full the safe box is.
      const sx = (nx1 - nx0) / (2 * FIT_X);
      const sy = (ny1 - ny0) / (FIT_Y1 - FIT_Y0);
      const s = Math.max(sx, sy, 1e-3);
      // Recentre: move the target by the NDC offset, in world units at this distance.
      const halfH = Math.tan((cam.fov * Math.PI) / 360) * d;
      const halfW = halfH * cam.aspect;
      const offX = (nx0 + nx1) / 2;
      const offY = (ny0 + ny1) / 2 - (FIT_Y0 + FIT_Y1) / 2;
      t.x += offX * halfW;
      // Screen-up on the ground is "away from the camera" (−z) foreshortened by the elevation.
      t.z -= (offY * halfH) / Math.max(0.35, Math.sin(EL + PITCH_UP));
      d = Math.min(MAX_DIST, Math.max(MIN_DIST, d * (0.35 + 0.65 * s)));
    }
    this.wantTarget.copy(t);
    this.wantDist = d;
  }

  update(t: number, dt: number, campfire: boolean, catchAt: CatchAt | null): void {
    const cam = this.camera;
    const v = this.override;
    let rate = 1.4;
    this.wantYaw = 0;
    this.wantEl = EL;
    const groupMode = v === "auto" || v === "group";
    const est = v === "establish" || (v === "auto" && this.n === 0 && !campfire);
    if (est) {
      this.wantTarget.set(Math.sin(t * 0.045) * 3, 0, -2 + Math.cos(t * 0.03) * 2);
      this.wantDist = 60 + Math.sin(t * 0.05) * 3;
      this.wantYaw = Math.sin(t * 0.035) * 0.18;
      this.wantEl = EST_EL + Math.sin(t * 0.04) * 0.03;
      rate = 0.8;
    } else if (v === "campfire" || (v === "auto" && campfire)) {
      // The family on its logs, the fire at the focal point.
      this.wantTarget.set(CAMPFIRE.x + 0.5, 1.0, CAMPFIRE.z + 0.9);
      this.wantDist = 14.5;
      this.wantEl = 0.36;
      this.wantYaw = Math.PI + 0.1;
      rate = 1.1;
    } else if (groupMode) {
      this.fitGroup();
    } else {
      const R = (th: number, k: number) => lakeRadius(th) * k;
      switch (v) {
        case "dock": this.wantTarget.set(0, 0.6, (DOCK.rootZ + DOCK.tipZ) / 2 - 1); this.wantDist = 18; this.wantEl = 0.55; break;
        case "falls": this.wantTarget.set(0, 3, -R(NORTH, 1) - 3); this.wantDist = 26; this.wantEl = 0.35; break;
        case "lily": this.wantTarget.set(Math.cos(WEST) * R(WEST, 0.85), 0, 0); this.wantDist = 20; this.wantEl = 0.7; this.wantYaw = -0.5; break;
        case "reeds": this.wantTarget.set(R(EAST, 0.9), 0.4, 0); this.wantDist = 20; this.wantEl = 0.6; this.wantYaw = 0.5; break;
        case "overview": this.wantTarget.set(0, 0, -2); this.wantDist = 70; this.wantEl = 0.75; break;
        case "top": this.wantTarget.set(0, 0, 0); this.wantDist = 85; this.wantEl = 1.5; break;
        default: break;
      }
    }
    // The catch moment: an eased push toward the catcher (~0.7 s in), held while the fish is up, then back.
    let cw = 0;
    if (catchAt && groupMode && !campfire) {
      const a = catchAt.age;
      cw = a < 0.7 ? a / 0.7 : a < 2.4 ? 1 : Math.max(0, 1 - (a - 2.4) / 0.9);
      cw = cw * cw * (3 - 2 * cw);
    }
    this.catchW += (cw - this.catchW) * damp(6, dt);
    if (catchAt && this.catchW > 0.001) {
      const w = this.catchW * 0.8;
      this.wantTarget.lerp(this.tmp.set(catchAt.x, catchAt.y, catchAt.z), w);
      this.wantDist += (Math.min(this.wantDist, 14) - this.wantDist) * w;
      this.wantEl += (0.4 - this.wantEl) * w;
    }
    const wantPitch = est ? EST_PITCH : groupMode ? PITCH_UP * (1 - this.catchW * 0.6) : 0;
    if (this.first) {
      // Start on the establishing view; a scene that starts with fishers eases in from it.
      this.first = false;
      this.startT = t;
      const startEst = groupMode || est;
      const tx = startEst ? 0 : this.wantTarget.x;
      const tz = startEst ? -2 : this.wantTarget.z;
      this.target.set(tx, startEst ? 0 : this.wantTarget.y, tz);
      this.goalTarget.copy(this.target);
      this.dist = this.goalDist = startEst ? 60 : this.wantDist;
      this.yaw = this.goalYaw = startEst ? 0 : this.wantYaw;
      this.el = this.goalEl = startEst ? EST_EL : this.wantEl;
      this.pitch = startEst ? EST_PITCH : wantPitch;
    }
    // Ease-in after the start: the follow rate ramps up over the intro.
    const intro = Math.min(1, Math.max(0, (t - this.startT) / INTRO_S));
    const r = rate * (0.25 + 0.75 * intro * intro);
    const k1 = damp(r * 1.6, dt);
    const k2 = damp(r * 2.2, dt);
    this.goalTarget.lerp(this.wantTarget, k1);
    this.goalDist += (this.wantDist - this.goalDist) * k1;
    this.goalYaw += (this.wantYaw - this.goalYaw) * k1;
    this.goalEl += (this.wantEl - this.goalEl) * k1;
    this.target.lerp(this.goalTarget, k2);
    this.dist += (this.goalDist - this.dist) * k2;
    this.yaw += (this.goalYaw - this.yaw) * k2;
    this.el += (this.goalEl - this.el) * k2;
    this.pitch += (wantPitch - this.pitch) * k2;
    this.pose(cam, this.target, this.dist, this.yaw, this.el, this.pitch);
  }
}

import { PerspectiveCamera, Vector3 } from "three";
import { CAMPFIRE, DOCK, EAST, NORTH, WEST, lakeRadius } from "../../game/world";
import { damp } from "./noise";
import { Lineup, type Blocker, type Ground } from "./lineup";

/** Critically damped spring toward a goal (exact step: no overshoot, stable at any dt). */
export function spring(x: number, v: number, goal: number, omega: number, dt: number, out: { x: number; v: number }): void {
  const y = x - goal;
  const e = Math.exp(-omega * dt);
  const k = (v + omega * y) * dt;
  out.x = goal + (y + k) * e;
  out.v = (v - omega * k) * e;
}
const S = { x: 0, v: 0 };

/** A place being revealed (the discovery moment). */
/** A place being discovered: its centre, the pond radius (framed whole, round 13) and the reveal age (s). */
export type Reveal = { x: number; z: number; age: number; r?: number };
/** Round 17: 2.6 -> 5.0 s. The session's 2.6 s reveal (eased in and out through the follow springs) never
 * visibly left the family's framing (round 16, 287 s): now ~1.2 s in, a held look, ~1.2 s back. */
export const REVEAL_S = 5.0;
/** The reveal swings round behind the family (the new pond beyond them) by at most this much (rad). */
const REVEAL_YAW_MAX = 1.6;
/** The reveal looks down a little more steeply, so the new pond reads over the trees. */
const REVEAL_EL = 0.5;

export const VIEWS = ["auto", "group", "wide", "establish", "campfire", "dock", "falls", "lily", "reeds", "overview", "top"] as const;
export type ViewName = (typeof VIEWS)[number];

export function isView(v: string): v is ViewName {
  return (VIEWS as readonly string[]).includes(v);
}

/**
 * Group camera orbit elevation: a low three-quarter (round 09: down from 0.44), the eye nearer the
 * fishers' own level, like WoW's play camera: faces and the water read, the ground under the lens doesn't.
 */
const EL = 0.32;
/** Pitch the view up a little after aiming: the fishers sit low, the lake and far bank above them. */
const PITCH_UP = 0.08;
/** The establishing view sits lower and looks up more, so the sky (and the moon) is in frame. */
const EST_EL = 0.3;
const EST_PITCH = 0.19;
/** Group framing limits (metres from the target). */
const MIN_DIST = 17;
const MAX_DIST = 64;
/** Round 18: past LOOM_GAP m of depth between the nearest and farthest fisher, the framing steps back up to LOOM_BACK. */
const LOOM_GAP = 2.5;
const LOOM_BACK = 0.16;
const LOOM_LAT = 4;
/** Where the fishers' box must fit, in NDC (x: ±, y: bottom..top; the top leaves room for name tags). */
/** 0.78: every fisher (feet to name tag) stays inside a 10% safe margin, with a little room to ease. */
// Round 13: 0.78 -> 0.70. The fit works on each fisher's centre line, but a name tag and a body reach about
// 0.08 NDC to either side of it, so 0.78 let tags and shoulders past the 10 % safe margin (night-catch,
// session 141 s and 228 s).
const FIT_X = 0.7;
/** The safe margin a catch push-in may never break (NDC). */
const SAFE = 0.8;
/** The fishers' feet sit on this line (a short foreground band below them), not centred in the box. */
const FIT_Y0 = -0.74;
const FIT_Y1 = 0.6;
/** The calm dead zone: the framing goal holds until the want leaves DEAD_M + DEAD_K x distance (m), the
 * distance until it is off by DEAD_DIST of itself, the yaw and elevation by DEAD_ANG (rad). */
const DEAD_M = 0.6;
const DEAD_K = 0.035;
const DEAD_DIST = 0.06;
const DEAD_ANG = 0.03;
/** Follows `want` only by how far it is outside a band of half-width `band` round `held`. */
function deadBand(held: number, want: number, band: number): number {
  return want > held + band ? want - band : want < held - band ? want + band : held;
}
/** Seconds the camera takes to settle in after the scene starts (from the establishing view). */
const INTRO_S = 3.2;

export type CatchAt = { x: number; y: number; z: number; age: number };

const MAX_POINTS = 24;
/** Push-in strengths tried in turn (the first that keeps the family in the safe margin wins). */
const PUSH_STEPS = [1, 0.8, 0.6, 0.4, 0.2, 0];
/** Heights above each focus point that must be in frame: the foot ring's front edge and the name tag. */
const LIFTS = [-0.7, 4.0];
/** How far above the catcher's feet the scene puts the catch focus (fishers.ts catchFocus). */
const CATCH_UP = 1.8;

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
  /** Spring velocities: target xyz, dist, yaw, el, pitch. */
  private readonly vel = new Float32Array(7);
  /** Smoothed group motion (m/s) for looking ahead along a trail. */
  private readonly motion = new Vector3();
  private readonly lastCentre = new Vector3();
  private haveCentre = false;
  private ahead = 0;
  private revealW = 0;
  /** The reveal's yaw offset from the place's view (set when a reveal starts) and its last age. */
  private revealYaw = 0;
  private revealAge = -1;
  /** The lineup's lift at the reveal's look (every fisher readable in the reveal too). */
  private revealLift = 0;
  private catchW = 0;
  private override: ViewName = "auto";
  /** The closest the group framing comes (further out when framing one place of a split family, so the place reads). */
  minDist = MIN_DIST;
  /** Follow-rate multiplier (a ride needs a camera that keeps up). */
  rateK = 1;
  /** On a ride: the vehicle's heading (radians, atan2(z, x)) and kind (1 boat, 2 zeppelin), for a side-on travelling shot. */
  ride: { heading: number; kind: number } | null = null;
  /** The yaw the group camera prefers at the place the family is in (eased by the rig's springs). */
  placeYaw = 0;
  /** Gathered at a mooring: the way from it to the vehicle (unit), and its kind (1 boat, 2 zeppelin). */
  board: { ux: number; uz: number; kind: number } | null = null;
  /** The place the establishing view looks over (where the family last was; Moonwell at first). */
  readonly anchor = new Vector3();
  private readonly pts: Vector3[] = Array.from({ length: MAX_POINTS }, () => new Vector3());
  private readonly softPt = new Uint8Array(MAX_POINTS);
  private n = 0;
  /** The fishers' feet on the ground (for the lineup: nobody hidden behind another). */
  private readonly feet: Ground[] = Array.from({ length: MAX_POINTS }, () => ({ x: 0, z: 0 }));
  private nf = 0;
  private readonly lineup = new Lineup();
  private first = true;
  /** A cut that lands on the family itself (framed, a little wide and high) instead of the establishing view. */
  private soft = false;
  private wasCamp = false;
  /** Round 19: when the camera last cut into or out of the campfire (the post chain dissolves over it). */
  campCutAt = -1e9;
  /** 0..1: how hard the follow hurries because a framed point is outside the safe margin right now. */
  private urge = 0;
  private readonly revealT = new Vector3();
  /** The dead-zoned framing goal (the family shuffling about inside it does not move the camera). */
  private readonly held = new Vector3();
  private heldDist = 0;
  private heldYaw = 0;
  private heldEl = 0;
  private haveHeld = false;
  private startT = -1;
  private readonly tmp = new Vector3();
  private readonly cx = new Vector3();
  private readonly base = new Vector3();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(36, aspect, 0.5, 1200);
    this.probe = new PerspectiveCamera(36, aspect, 0.5, 1200);
  }

  setView(v: ViewName): void {
    this.override = v;
    this.first = true;
  }

  debug(): { dist: number; catchW: number; revealW: number; n: number; target: number[]; ahead: number; yaw: number; el: number; feet: number[][]; blockers: number[][] } {
    return { blockers: this.blockers.map((b) => [b.x, b.z, b.r]), dist: this.dist, catchW: this.catchW, revealW: this.revealW, n: this.n, target: this.target.toArray(), ahead: this.ahead, yaw: this.yaw, el: this.el, feet: this.feet.slice(0, this.nf).map((f) => [f.x, f.z]) };
  }

  get view(): ViewName {
    return this.override;
  }

  beginFocus(): void {
    this.n = 0;
    this.nf = 0;
  }

  /** A framed fisher's feet (the camera yaws a little so nobody stands hidden behind another). */
  addFisher(x: number, z: number): void {
    if (this.nf >= MAX_POINTS) return;
    const f = this.feet[this.nf++]!;
    f.x = x;
    f.z = z;
  }

  /** Solid things near the family the camera must not look through at them (tower decks), set each frame. */
  readonly blockers: Blocker[] = [];

  private lineUp(yaw: number, el: number): { yaw: number; el: number } {
    return this.lineup.update(this.feet, yaw, el, this.nf, this.blockers, this.wantDist);
  }

  /**
   * A point that must stay in frame (feet; the rig adds the head and name tag above it). Round 20: `soft`
   * points (bobbers, the water in front of the family) shape the group framing but a catch push-in may
   * leave them (round 19 session 229/236 s at Mistmarsh: a bobber and the pond point kept every push
   * strength from fitting, so the catch got no push-in at all).
   */
  addFocus(x: number, y: number, z: number, soft = false): void {
    if (this.n >= MAX_POINTS - 1) return;
    this.softPt[this.n] = soft ? 1 : 0;
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

  /** Whether any focus point (feet to name tag) is past the safe margin in the camera's current shot. */
  private outside(cam: PerspectiveCamera): boolean {
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i]!;
      for (const lift of LIFTS) {
        this.tmp.set(p.x, p.y + lift, p.z).project(cam);
        if (this.tmp.z < 1 && (Math.abs(this.tmp.x) > SAFE || Math.abs(this.tmp.y) > SAFE)) return true;
      }
    }
    return false;
  }

  /** Whether every focus point (feet to name tag) sits inside the safe margin from this pose. */
  private fits(target: Vector3, dist: number, yaw: number, el: number, pitch: number, hardOnly = false): boolean {
    const cam = this.probe;
    cam.fov = this.camera.fov;
    cam.aspect = this.camera.aspect;
    cam.updateProjectionMatrix();
    this.pose(cam, target, dist, yaw, el, pitch);
    for (let i = 0; i < this.n; i++) {
      if (hardOnly && this.softPt[i]) continue;
      const p = this.pts[i]!;
      for (const lift of LIFTS) {
        this.tmp.set(p.x, p.y + lift, p.z).project(cam);
        if (Math.abs(this.tmp.x) > SAFE || Math.abs(this.tmp.y) > SAFE) return false;
      }
    }
    return true;
  }

  /**
   * Fits every focus point (feet to name tag) inside the safe box: a few rounds of "recentre, then
   * scale the distance by how much too big or small the box is". Writes wantTarget / wantDist.
   */
  private fitGroup(yaw = 0, el = EL): void {
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
    let d = Math.min(MAX_DIST, Math.max(this.minDist, 0.9 * Math.max(x1 - x0, (z1 - z0) * 1.4) + 14));
    for (let iter = 0; iter < 8; iter++) {
      this.pose(cam, t, d, yaw, el, PITCH_UP);
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
      // Feet on the bottom line when the box has height to spare (the slack goes to the lake above
      // them, not to ground below them); centred only when the family is taller than the box.
      const offY = sy >= 1 ? (ny0 + ny1) / 2 - (FIT_Y0 + FIT_Y1) / 2 : ny0 - FIT_Y0;
      // Screen-right on the ground is (cos yaw, -sin yaw); screen-up is "away from the camera"
      // (-sin yaw, -cos yaw) foreshortened by the elevation.
      // Damped (0.6): at a low elevation a full step overshoots and the fit see-saws between iterations.
      const up = (0.6 * offY * halfH) / Math.max(0.35, Math.sin(el + PITCH_UP));
      t.x += offX * halfW * Math.cos(yaw) - up * Math.sin(yaw);
      t.z += -offX * halfW * Math.sin(yaw) - up * Math.cos(yaw);
      d = Math.min(MAX_DIST, Math.max(this.minDist, d * (0.35 + 0.65 * s)));
    }
    // Round 18 (round 17 session 15-21 s): in a tight framing, a fisher standing a few metres nearer the lens
    // just in front of another let the near one's back loom over the middle of the TV (about a quarter of the
    // frame tall) and cover the other: step back a little, by how far in front and how nearly in line they
    // stand. Fishers' feet only (bobbers out on the water are no one's back); spread families are unchanged.
    let deep = 0;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    for (let i = 0; i < this.nf; i++) {
      const a = this.feet[i]!;
      for (let j = 0; j < this.nf; j++) {
        if (i === j) continue;
        const b = this.feet[j]!;
        // a is the nearer one: depth grows away from the lens (the camera sits at +(sin yaw, cos yaw)).
        const gap = (a.x - b.x) * sy + (a.z - b.z) * cy;
        const lat = Math.abs((a.x - b.x) * cy - (a.z - b.z) * sy);
        deep = Math.max(deep, Math.min(1, Math.max(0, (gap - LOOM_GAP) / 3)) * Math.max(0, 1 - lat / LOOM_LAT));
      }
    }
    deep *= 1 - Math.min(1, Math.max(0, (d - 22) / 6));
    d = Math.min(MAX_DIST, d * (1 + LOOM_BACK * deep));
    this.wantTarget.copy(t);
    this.wantDist = d;
  }

  /**
   * trail: 0..1, how much the family is out on a trail (look ahead along it); reveal: a place being
   * discovered (the camera eases up and out to show it, unless a catch push-in is running).
   */
  update(t: number, dt: number, campfire: boolean, catchAt: CatchAt | null, trail = 0, reveal: Reveal | null = null): void {
    const cam = this.camera;
    const v = this.override;
    let rate = 1.4;
    this.wantYaw = 0;
    this.wantEl = EL;
    const groupMode = v === "auto" || v === "group";
    const est = v === "establish" || (v === "auto" && this.n === 0 && !campfire);
    // The discovery reveal's weight (a catch push-in wins): up, out and round behind the family so the new
    // pond lies beyond them, for REVEAL_S.
    let rw = 0;
    if (reveal && groupMode && !campfire && this.catchW < 0.1) {
      const a = reveal.age;
      rw = a < 1.2 ? a / 1.2 : a < REVEAL_S - 1.2 ? 1 : Math.max(0, 1 - (a - (REVEAL_S - 1.2)) / 1.2);
      rw = rw * rw * (3 - 2 * rw);
    }
    if (reveal && (this.revealAge < 0 || reveal.age < this.revealAge) && this.n > 0) {
      // A new reveal: look from the family's side of the pond across it.
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < this.n; i++) {
        cx += this.pts[i]!.x;
        cz += this.pts[i]!.z;
      }
      cx /= this.n;
      cz /= this.n;
      const behind = Math.hypot(cx - reveal.x, cz - reveal.z) > 1 ? Math.atan2(cx - reveal.x, cz - reveal.z) : this.placeYaw;
      // Round behind them, but three-quarter enough that nobody stands behind anyone (a family walking in
      // single file off the trail lines up straight behind each other): the yaw near "behind" whose
      // narrowest sideways gap between two fishers is widest.
      let best = 0;
      let bestScore = -Infinity;
      for (let k = -4; k <= 4; k++) {
        const y = behind + k * 0.2;
        const dy = Math.atan2(Math.sin(y - this.placeYaw), Math.cos(y - this.placeYaw));
        if (Math.abs(dy) > REVEAL_YAW_MAX) continue;
        let gap = 2.5;
        for (let i = 0; i < this.nf; i++) for (let j = i + 1; j < this.nf; j++) {
          const a = this.feet[i]!;
          const b = this.feet[j]!;
          gap = Math.min(gap, Math.abs((a.x - b.x) * Math.cos(y) - (a.z - b.z) * Math.sin(y)));
        }
        const score = gap - 0.35 * Math.abs(k * 0.2) - 0.15 * Math.abs(dy);
        if (score > bestScore) {
          bestScore = score;
          best = dy;
        }
      }
      this.revealYaw = best;
    }
    this.revealAge = reveal ? reveal.age : -1;
    // Where the family is heading: smoothed centroid motion.
    if (this.n > 0) {
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < this.n; i++) {
        cx += this.pts[i]!.x;
        cz += this.pts[i]!.z;
      }
      cx /= this.n;
      cz /= this.n;
      if (this.haveCentre && dt > 0) {
        const k = damp(1.6, dt);
        this.motion.x += ((cx - this.lastCentre.x) / dt - this.motion.x) * k;
        this.motion.z += ((cz - this.lastCentre.z) / dt - this.motion.z) * k;
      }
      this.lastCentre.set(cx, 0, cz);
      this.haveCentre = true;
      // Look ahead: a point in front of the walkers joins the framing (further out on a trail).
      const speed = Math.hypot(this.motion.x, this.motion.z);
      const wantAhead = Math.min(1, Math.max(0, (speed - 0.8) / 2.5)) * (3 + 9 * trail);
      this.ahead += (wantAhead - this.ahead) * damp(1.2, dt);
      if (this.ahead > 0.3 && speed > 0.05 && this.n < MAX_POINTS - 1) {
        const p = this.pts[this.n - 1]!;
        this.softPt[this.n] = 1;
        this.pts[this.n++]!.set(cx + (this.motion.x / speed) * this.ahead, p.y, cz + (this.motion.z / speed) * this.ahead);
      }
    } else this.haveCentre = false;
    if (est) {
      this.wantTarget.set(this.anchor.x + Math.sin(t * 0.045) * 3, 0, this.anchor.z - 2 + Math.cos(t * 0.03) * 2);
      this.wantDist = 60 + Math.sin(t * 0.05) * 3;
      this.wantYaw = Math.sin(t * 0.035) * 0.18;
      this.wantEl = EST_EL + Math.sin(t * 0.04) * 0.03;
      rate = 0.8;
    } else if (v === "campfire" || (v === "auto" && campfire)) {
      // The family on its logs, the fire at the focal point.
      // Pushed in on the circle: seated fishers fill the frame, faces lit by the fire.
      this.wantTarget.set(CAMPFIRE.x + 0.4, 1.05, CAMPFIRE.z + 0.7);
      this.wantDist = 12.0;
      this.wantEl = 0.3;
      this.wantYaw = Math.PI + 0.1;
      rate = 1.1;
    } else if (groupMode && this.ride) {
      // The travelling shot: from the side and a little behind, so the vehicle sails across the frame.
      const h = this.ride.heading;
      let px = -Math.sin(h);
      let pz = Math.cos(h);
      if (pz < 0) {
        px = -px;
        pz = -pz;
      }
      const ox = px * 0.85 - Math.cos(h) * 0.5;
      const oz = pz * 0.85 - Math.sin(h) * 0.5;
      this.wantYaw = Math.atan2(ox, oz);
      this.wantEl = this.ride.kind === 2 ? 0.2 : 0.3;
      // Round 20: the lineup runs on the travelling shot too (arrival.png: stepping off the airship the family
      // stood in a row along the lens, Sis behind Dad, Juneau behind Mom).
      const lu = this.lineUp(this.wantYaw, this.wantEl);
      this.wantYaw += lu.yaw;
      this.wantEl += lu.el;
      this.fitGroup(this.wantYaw, this.wantEl);
      rate = 1.6;
    } else if (groupMode && this.board) {
      // Boarding: a three-quarter view across the mooring, the family in front of their vehicle.
      const { ux, uz, kind } = this.board;
      // Boats: from over the harbour, off to one flank and high (the family on the dock, the boat beside them).
      // Airships: broadside, a little past the tower, so the mast stands behind the family, never between.
      let sx = -uz;
      let sz = ux;
      if (sz < 0) {
        sx = -sx;
        sz = -sz;
      }
      const side = kind === 1 ? 0.75 : 0.85;
      const back = kind === 1 ? 0.55 : 0.25;
      const yaw0 = Math.atan2(sx * side + ux * back, sz * side + uz * back);
      const el0 = kind === 1 ? 0.5 : 0.4;
      // Round 14: the lineup runs here too (the boarding huddle stacked four fishers on one body, session
      // 128-166 s): a yaw and above all a higher look down on the deck spread the huddle on screen.
      const lu = this.lineUp(yaw0, el0);
      this.wantYaw = yaw0 + lu.yaw;
      this.wantEl = el0 + lu.el;
      this.fitGroup(this.wantYaw, this.wantEl);
      rate = 1.2;
    } else if (groupMode) {
      // Each generated place is framed from its own side (home places keep the classic view).
      // Nobody hidden behind another fisher: a slight yaw (and lift) when one stands behind another.
      // The reveal swings the base view round behind the family; the lineup then works on that view.
      const yaw0 = this.placeYaw + this.revealYaw * this.revealW;
      const el0 = EL + (REVEAL_EL - EL) * this.revealW;
      const lu = this.lineUp(yaw0, el0);
      this.wantYaw = yaw0 + lu.yaw;
      this.wantEl = el0 + lu.el;
      this.revealLift = lu.el;
      this.fitGroup(this.wantYaw, this.wantEl);
    } else if (v === "wide" && this.n > 0) {
      // High and far over the family: the lie of the land round them (the fog's edge, the sea).
      this.fitGroup();
      this.wantDist = Math.max(this.wantDist, 95);
      this.wantEl = 0.72;
    } else {
      const R = (th: number, k: number) => lakeRadius(th) * k;
      switch (v) {
        case "dock": this.wantTarget.set(0, 0.6, (DOCK.rootZ + DOCK.tipZ) / 2 - 1); this.wantDist = 18; this.wantEl = 0.55; break;
        case "falls": this.wantTarget.set(0, 3, -R(NORTH, 1) - 3); this.wantDist = 26; this.wantEl = 0.35; break;
        case "lily": this.wantTarget.set(Math.cos(WEST) * R(WEST, 0.85), 0, 0); this.wantDist = 20; this.wantEl = 0.7; this.wantYaw = -0.5; break;
        case "reeds": this.wantTarget.set(R(EAST, 0.9), 0.4, 0); this.wantDist = 20; this.wantEl = 0.6; this.wantYaw = 0.5; break;
        case "overview": this.wantTarget.set(0, 0, -20); this.wantDist = 150; this.wantEl = 0.9; break;
        case "top": this.wantTarget.set(0, 0, -20); this.wantDist = 230; this.wantEl = 1.5; break;
        default: break;
      }
    }
    // A calm camera: a soft dead zone round the framing goal (the family's small moves and the fit's
    // recentring do not drift the shot; past the zone it follows by the excess only, no step).
    if (groupMode && !campfire && !this.ride && !this.board && !est && this.n > 0) {
      if (!this.haveHeld) {
        this.held.copy(this.wantTarget);
        this.heldDist = this.wantDist;
        this.heldYaw = this.wantYaw;
        this.heldEl = this.wantEl;
        this.haveHeld = true;
      }
      // The calm hold never keeps a framing that has let someone out of the safe box (round 13: on the
      // trail the hold kept the shot while a walker left it).
      if (!this.fits(this.held, this.heldDist, this.heldYaw, this.heldEl, PITCH_UP)) {
        this.held.copy(this.wantTarget);
        this.heldDist = this.wantDist;
        this.heldYaw = this.wantYaw;
        this.heldEl = this.wantEl;
      }
      const zone = DEAD_M + DEAD_K * this.wantDist;
      const dx = this.wantTarget.x - this.held.x;
      const dy = this.wantTarget.y - this.held.y;
      const dz = this.wantTarget.z - this.held.z;
      const len = Math.hypot(dx, dy, dz);
      if (len > zone) this.held.addScaledVector(this.tmp.set(dx, dy, dz), (len - zone) / len);
      this.heldDist = deadBand(this.heldDist, this.wantDist, this.heldDist * DEAD_DIST);
      this.heldYaw = deadBand(this.heldYaw, this.wantYaw, DEAD_ANG);
      this.heldEl = deadBand(this.heldEl, this.wantEl, DEAD_ANG);
      this.wantTarget.copy(this.held);
      this.wantDist = this.heldDist;
      this.wantYaw = this.heldYaw;
      this.wantEl = this.heldEl;
    } else this.haveHeld = false;
    // Out of the campfire: straight to the family, framed (round 10 swung half round the fire and on
    // over the tower and its airship before finding them).
    const camp = v === "auto" && campfire;
    if (this.wasCamp && !camp && groupMode && this.n > 0) {
      this.first = true;
      this.soft = true;
      this.campCutAt = t;
    }
    // Into the campfire likewise (round 17 session 259-262 s: from a place under the 150 m cut the camera flew
    // over the land for ~1.5 s while the family already sat at the fire, an empty grassy slope on the TV):
    // land on the fire with the family round it, a little wide and high, and settle in.
    if (camp && !this.wasCamp) {
      this.first = true;
      this.soft = true;
      this.campCutAt = t;
    }
    this.wasCamp = camp;
    // The catch moment: an eased push toward the catcher (~0.7 s in), held while the fish is up, then back.
    let cw = 0;
    if (catchAt && groupMode && !campfire) {
      const a = catchAt.age;
      // Round 17: ~1 s in, held while the fish is up, ~1 s back out (a deeper push, below).
      cw = a < 1.0 ? a / 1.0 : a < 2.6 ? 1 : Math.max(0, 1 - (a - 2.6) / 1.0);
      cw = cw * cw * (3 - 2 * cw);
    }
    this.catchW += (cw - this.catchW) * damp(6, dt);
    if (catchAt && this.catchW > 0.001) {
      // Close in on a lone catcher; with others spread round the water, a gentler push.
      // Round 09: only as far as keeps every fisher inside the safe margin (a full push first, then
      // weaker ones until the whole family fits; none if nothing does).
      const tight = this.wantDist < 24;
      const t0 = this.base.copy(this.wantTarget);
      const d0 = this.wantDist;
      const e0 = this.wantEl;
      const pitch = PITCH_UP * (1 - this.catchW * 0.6);
      for (const k of PUSH_STEPS) {
        const cw = this.catchW * k;
        const w = cw * (tight ? 0.8 : 0.62);
        // Round 20: aimed at the catcher 1.2 m up, like the group framing (it aimed 3 m up, at the fish held
        // overhead, so a close push dropped the feet out of the safe box and only the weakest push fitted).
        this.wantTarget.copy(t0).lerp(this.tmp.set(catchAt.x, catchAt.y - CATCH_UP + 1.2, catchAt.z), w);
        // Round 17: deeper (tight 14 -> min(12, 0.62 d), spread 0.58 d / 17 m -> 0.5 d / 13 m): the round-16
        // session showed no readable push at 320-332 s.
        this.wantDist = d0 + ((tight ? Math.min(d0 * 0.62, 12) : Math.max(13, d0 * 0.5)) - d0) * (tight ? w : cw);
        this.wantEl = e0 + (0.36 - e0) * cw * 0.8;
        if (k === 0 || this.fits(this.wantTarget, this.wantDist, this.wantYaw, this.wantEl, pitch, true)) break;
      }
    }
    // The discovery reveal (weight worked out above).
    this.revealW += (rw - this.revealW) * damp(5, dt);
    if (reveal && this.revealW > 0.001) {
      const w = this.revealW;
      if (reveal.r !== undefined && this.n > 0) {
        // Round 13: frame the new pond whole with the family (it used to look half at the forest): its rim
        // joins the fit, from a little higher so the water reads over the trees.
        const t0 = this.base.copy(this.wantTarget);
        const d0 = this.wantDist;
        const e0 = this.wantEl;
        const n0 = this.n;
        for (let k = 0; k < 8 && this.n < MAX_POINTS - 1; k++) {
          const a = (k / 8) * Math.PI * 2;
          this.softPt[this.n] = 1;
          this.pts[this.n++]!.set(reveal.x + Math.cos(a) * reveal.r, 0, reveal.z + Math.sin(a) * reveal.r);
        }
        this.fitGroup(this.wantYaw, REVEAL_EL + this.revealLift);
        this.revealT.copy(this.wantTarget);
        const dR = this.wantDist;
        this.n = n0;
        this.wantTarget.copy(t0).lerp(this.revealT, w);
        this.wantDist = d0 + (dR - d0) * w;
        this.wantEl = e0 + (REVEAL_EL + this.revealLift - e0) * w;
      } else {
        this.wantTarget.lerp(this.tmp.set(reveal.x, 0.5, reveal.z), w * 0.55);
        this.wantDist += (Math.max(this.wantDist * 1.25, 44) - this.wantDist) * w;
        this.wantEl += (0.62 - this.wantEl) * w;
      }
    }
    // A jump across the world (a new scene, a far place): cut there instead of flying over it.
    if (!this.first && Math.hypot(this.wantTarget.x - this.target.x, this.wantTarget.z - this.target.z) > 150) {
      this.first = true;
      this.soft = groupMode && this.n > 0;
    }
    const wantPitch = est ? EST_PITCH : groupMode ? PITCH_UP * (1 - this.catchW * 0.6) * (1 - this.revealW * 0.5) : 0;
    if (this.first) {
      // Start on an establishing view over wherever the family is; it eases in from there.
      this.first = false;
      this.startT = t;
      if (this.soft) {
        // Land on the family: their own framing, a little wider and higher, then a slow settle in.
        this.soft = false;
        this.target.copy(this.wantTarget);
        this.goalTarget.copy(this.target);
        this.dist = this.goalDist = this.wantDist * 1.25;
        this.yaw = this.goalYaw = this.wantYaw;
        this.el = this.goalEl = this.wantEl + 0.08;
        this.pitch = wantPitch;
        this.vel.fill(0);
      } else {
        const startEst = groupMode || est;
        if (startEst && this.n > 0 && !est) this.target.set(this.wantTarget.x, 0, this.wantTarget.z - 2);
        else if (startEst) this.target.set(this.anchor.x, 0, this.anchor.z - 2);
        else this.target.copy(this.wantTarget);
        this.goalTarget.copy(this.target);
        this.dist = this.goalDist = startEst ? 60 : this.wantDist;
        this.yaw = this.goalYaw = startEst ? 0 : this.wantYaw;
        this.el = this.goalEl = startEst ? EST_EL : this.wantEl;
        this.pitch = startEst ? EST_PITCH : wantPitch;
        this.vel.fill(0);
      }
    }
    // Two stages: the goal is low-passed (no sudden goal jumps), then a critically damped spring follows
    // it (continuous velocity and acceleration: no jerk, no overshoot).
    const intro = Math.min(1, Math.max(0, (t - this.startT) / INTRO_S));
    // A catch push-in arrives while the fish is still up (the hold is only ~2.4 s).
    // Someone at or past the safe margin in the shot as it stands: the follow hurries (round 13: walkers on
    // the trail were cropped at the edge while the springs caught up).
    const out = groupMode && !campfire && !this.ride && !this.board && !est && this.n > 0 && this.outside(cam);
    this.urge += ((out ? 1 : 0) - this.urge) * damp(out ? 6 : 1.5, dt);
    const r = rate * this.rateK * (0.25 + 0.75 * intro * intro) * (1 + this.catchW * 1.3) * (1 + 0.8 * this.revealW) * (1 + 2.2 * this.urge);
    const k1 = damp(r * 2.2, dt);
    this.goalTarget.lerp(this.wantTarget, k1);
    this.goalDist += (this.wantDist - this.goalDist) * k1;
    this.goalYaw += (this.wantYaw - this.goalYaw) * k1;
    this.goalEl += (this.wantEl - this.goalEl) * k1;
    const om = r * 2.4;
    const V = this.vel;
    spring(this.target.x, V[0]!, this.goalTarget.x, om, dt, S); this.target.x = S.x; V[0] = S.v;
    spring(this.target.y, V[1]!, this.goalTarget.y, om, dt, S); this.target.y = S.x; V[1] = S.v;
    spring(this.target.z, V[2]!, this.goalTarget.z, om, dt, S); this.target.z = S.x; V[2] = S.v;
    spring(this.dist, V[3]!, this.goalDist, om * 0.9, dt, S); this.dist = S.x; V[3] = S.v;
    spring(this.yaw, V[4]!, this.goalYaw, om, dt, S); this.yaw = S.x; V[4] = S.v;
    spring(this.el, V[5]!, this.goalEl, om, dt, S); this.el = S.x; V[5] = S.v;
    spring(this.pitch, V[6]!, wantPitch, om * 1.2, dt, S); this.pitch = S.x; V[6] = S.v;
    this.pose(cam, this.target, this.dist, this.yaw, this.el, this.pitch);
  }
}

import { PerspectiveCamera, Vector3 } from "three";
import { CAMPFIRE, DOCK, EAST, NORTH, WEST, lakeRadius } from "../../game/world";
import { damp } from "./noise";

export const VIEWS = ["auto", "group", "establish", "campfire", "dock", "falls", "lily", "reeds", "overview", "top"] as const;
export type ViewName = (typeof VIEWS)[number];

export function isView(v: string): v is ViewName {
  return (VIEWS as readonly string[]).includes(v);
}

const EL = (40 * Math.PI) / 180;

/** The group camera: from the south, high three-quarter, eased, yaw roughly fixed. */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly target = new Vector3(0, 0, -1);
  private readonly wantTarget = new Vector3();
  private dist = 58;
  private wantDist = 58;
  private yaw = 0;
  private wantYaw = 0;
  private el = EL;
  private wantEl = EL;
  private catchW = 0;
  private override: ViewName = "auto";
  private readonly min = new Vector3();
  private readonly max = new Vector3();
  private n = 0;
  private first = true;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(36, aspect, 0.5, 1200);
  }

  setView(v: ViewName): void {
    this.override = v;
    this.first = true;
  }

  get view(): ViewName {
    return this.override;
  }

  beginFocus(): void {
    this.n = 0;
    this.min.set(Infinity, Infinity, Infinity);
    this.max.set(-Infinity, -Infinity, -Infinity);
  }

  addFocus(x: number, y: number, z: number): void {
    this.n++;
    this.min.x = Math.min(this.min.x, x);
    this.min.y = Math.min(this.min.y, y);
    this.min.z = Math.min(this.min.z, z);
    this.max.x = Math.max(this.max.x, x);
    this.max.y = Math.max(this.max.y, y);
    this.max.z = Math.max(this.max.z, z);
  }

  update(t: number, dt: number, campfire: boolean, catchAt: { x: number; y: number; z: number; age: number } | null): void {
    const cam = this.camera;
    const v = this.override;
    let rate = 1.6;
    this.wantYaw = 0;
    this.wantEl = EL;
    const groupMode = v === "auto" || v === "group";
    if (v === "establish" || (v === "auto" && this.n === 0 && !campfire)) {
      this.wantTarget.set(Math.sin(t * 0.045) * 3, 0, -2 + Math.cos(t * 0.03) * 2);
      this.wantDist = 60 + Math.sin(t * 0.05) * 3;
      this.wantYaw = Math.sin(t * 0.035) * 0.22;
      this.wantEl = EL - 0.06 + Math.sin(t * 0.04) * 0.04;
      rate = 0.8;
    } else if (v === "campfire" || (v === "auto" && campfire)) {
      this.wantTarget.set(CAMPFIRE.x - 0.5, 0.6, CAMPFIRE.z - 0.5);
      this.wantDist = 17;
      this.wantEl = 0.6;
      this.wantYaw = -0.25;
      rate = 1.2;
    } else if (groupMode) {
      const cx = (this.min.x + this.max.x) / 2;
      const cz = (this.min.z + this.max.z) / 2;
      const w = this.max.x - this.min.x + 9;
      const d = this.max.z - this.min.z + 7;
      const vf = (cam.fov * Math.PI) / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
      const needW = w / 2 / Math.tan(hf / 2);
      const needH = ((d * Math.sin(EL) + 3) / 2) / Math.tan(vf / 2);
      this.wantDist = Math.min(66, Math.max(31, Math.max(needW, needH)));
      // Pull the centre a little toward the lake so the water stays in the frame.
      this.wantTarget.set(cx * 0.85, 0.6, cz * 0.7 - 2.5);
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
    // The catch moment: an eased push toward the catcher, then back.
    let cw = 0;
    if (catchAt && groupMode) {
      const a = catchAt.age;
      cw = a < 0.7 ? a / 0.7 : a < 2.3 ? 1 : Math.max(0, 1 - (a - 2.3) / 0.9);
      cw = cw * cw * (3 - 2 * cw);
    }
    this.catchW += (cw - this.catchW) * damp(5, dt);
    if (catchAt && this.catchW > 0.001) {
      const w = this.catchW * 0.85;
      this.wantTarget.lerp(this.min.set(catchAt.x, catchAt.y, catchAt.z), w);
      this.wantDist += (Math.min(this.wantDist, 17) - this.wantDist) * w;
      this.wantEl += (0.62 - this.wantEl) * w;
    }
    const k = this.first ? 1 : damp(rate, dt);
    this.first = false;
    this.target.lerp(this.wantTarget, k);
    this.dist += (this.wantDist - this.dist) * k;
    this.yaw += (this.wantYaw - this.yaw) * k;
    this.el += (this.wantEl - this.el) * k;
    const ce = Math.cos(this.el);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * ce * this.dist,
      this.target.y + Math.sin(this.el) * this.dist,
      this.target.z + Math.cos(this.yaw) * ce * this.dist,
    );
    cam.lookAt(this.target);
  }
}

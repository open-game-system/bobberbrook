import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CameraRig, catchWeight, type CatchAt, type Reveal, type RigFrame } from "./camera";
import { MOONWELL_TRACE } from "./fixtures/cameraTraceMoonwell";
import { panReversals, turnReversals, zoomReversals, type Pose } from "./cameraJudder";

/**
 * Round 23: the group camera never swings one way and straight back (round 22 session 35-37 s and 57-59 s,
 * critic "the camera wobbles", 279 camera_jerk flags). Thresholds: 0.4 degrees of pan or turn, 8 % of zoom,
 * back within 1 s.
 */
const ZOOM = 0.08;

function pose(rig: CameraRig, t: number): Pose {
  const d = rig.debug();
  return { t, x: d.target[0] ?? 0, z: d.target[2] ?? 0, dist: d.dist, yaw: d.yaw, el: d.el };
}

function judder(poses: readonly Pose[]): string[] {
  const deg = 180 / Math.PI;
  return [
    ...panReversals(poses).map((r) => `pan ${r.a.from.toFixed(2)}s ${(r.a.amount * deg).toFixed(2)} -> ${(r.b.amount * deg).toFixed(2)} deg`),
    ...turnReversals(poses).map((r) => `turn ${r.a.from.toFixed(2)}s ${(r.a.amount * deg).toFixed(2)} -> ${(r.b.amount * deg).toFixed(2)} deg`),
    ...zoomReversals(poses, ZOOM).map((r) => `zoom ${r.a.from.toFixed(2)}s ${r.a.amount.toFixed(3)} -> ${r.b.amount.toFixed(3)}`),
  ];
}

type Fisher = { x: number; z: number; bob: { x: number; y: number; z: number } | null };

/**
 * One frame as the scene feeds it (index.ts): feet, bobbers (soft) and, by a pond centred at `pond`, the water
 * up to 10 m in front of the family (soft).
 */
function feed(rig: CameraRig, family: readonly Fisher[], t: number, catchAt: CatchAt | null, reveal: Reveal | null = null, pond: { x: number; z: number } | null = null): void {
  rig.beginFocus();
  let gx = 0;
  let gz = 0;
  for (const f of family) {
    rig.addFocus(f.x, 0.4, f.z);
    rig.addFisher(f.x, f.z);
    if (f.bob) rig.addFocus(f.bob.x, f.bob.y, f.bob.z, true);
    gx += f.x / family.length;
    gz += f.z / family.length;
  }
  if (pond) {
    const wd = Math.hypot(pond.x - gx, pond.z - gz);
    const k = Math.min(wd, 10) / wd;
    rig.addFocus(gx + (pond.x - gx) * k, 0, gz + (pond.z - gz) * k, true);
  }
  rig.update(t, 1 / 60, false, catchAt, 0, reveal);
}

describe("the judder measure", () => {
  it("finds a pan one way and straight back", () => {
    const poses: Pose[] = [];
    for (let i = 0; i <= 120; i++) poses.push({ t: i / 60, x: Math.sin((i / 120) * Math.PI) * 0.6, z: 0, dist: 20, yaw: 0, el: 0.3 });
    expect(panReversals(poses)).toHaveLength(1);
  });
  it("ignores a slow pan that later comes back", () => {
    const poses: Pose[] = [];
    for (let i = 0; i <= 600; i++) poses.push({ t: i / 60, x: Math.sin((i / 600) * Math.PI) * 2, z: 0, dist: 20, yaw: 0, el: 0.3 });
    expect(panReversals(poses)).toHaveLength(0);
  });
});

describe("a steady group camera", () => {
  it("casts, catches, recasts and walks off without swinging back and forth", () => {
    const rig = new CameraRig(16 / 9);
    // Dad on the dock, Juneau on the bank beside it (Moonwell, round 22 session 22-60 s).
    const dad: Fisher = { x: -0.3, z: 17, bob: null };
    const kid: Fisher = { x: -3.7, z: 14.8, bob: null };
    const fam = [dad, kid];
    const poses: Pose[] = [];
    const cast = (f: Fisher, t: number, t0: number, tx: number, tz: number) => {
      const k = Math.min(1, (t - t0) / 0.8);
      if (k < 0) return;
      f.bob = { x: f.x + (tx - f.x) * k, y: 0.5 + Math.sin(k * Math.PI) * 3, z: f.z + (tz - f.z) * k };
    };
    for (let i = 0; i < 60 * 30; i++) {
      const t = i / 60;
      // 4 s: both cast; 9 s: Juneau's fish comes up (3.1 s, then the scene drops the focus), the bobber with it;
      // 14 s: Juneau casts again; 18 s: Dad walks off the dock and along the shore, Juneau tags along.
      if (t >= 4 && t < 9) {
        cast(dad, t, 4, -2, 7);
        cast(kid, t, 4.2, -6, 8);
      }
      if (t >= 9 && t < 14) kid.bob = null;
      if (t >= 14) cast(kid, t, 14, -5, 8);
      if (t >= 18) {
        dad.bob = null;
        kid.bob = null;
        const w = Math.min(t - 18, 9);
        dad.x = -0.3 - 1.6 * w;
        dad.z = 17 + 0.9 * w;
        const lag = Math.max(0, w - 1.2);
        kid.x = -3.7 - 1.5 * lag;
        kid.z = 14.8 + 1.0 * lag;
      }
      const catchAt = t >= 9 && t < 12.1 ? { x: kid.x, y: 2.2, z: kid.z, age: t - 9 } : null;
      feed(rig, fam, t, catchAt, null, { x: 0, z: 0 });
      if (t > 3) poses.push(pose(rig, t));
    }
    expect(judder(poses)).toEqual([]);
  });

  it("pushes in for a catch and eases out after the scene drops the catch (no snap back)", () => {
    const rig = new CameraRig(16 / 9);
    // Dad's bobber stays out on the water while Juneau's fish is up (the push leaves it out of the shot).
    const fam: Fisher[] = [{ x: 0, z: 0, bob: null }, { x: 3, z: 0.5, bob: { x: 1, y: 0.2, z: -9 } }];
    const dists: number[] = [];
    for (let i = 0; i < 60 * 10; i++) {
      const t = i / 60;
      const catchAt = t >= 5 && t < 8.1 ? { x: 0, y: 2.2, z: 0, age: t - 5 } : null;
      feed(rig, fam, t, catchAt, null, { x: 1, z: -15 });
      if (t >= 5) dists.push(rig.debug().dist);
    }
    const before = dists[0] ?? 0;
    expect(Math.min(...dists)).toBeLessThan(before * 0.8);
    // Never faster than ~a fifth of the push depth in 0.1 s on the way out (round 22: half of it in 0.3 s).
    let worst = 0;
    for (let i = 6; i < dists.length; i++) worst = Math.max(worst, (dists[i] ?? 0) - (dists[i - 6] ?? 0));
    expect(worst).toBeLessThan((before - Math.min(...dists)) * 0.2);
    expect(dists[dists.length - 1]).toBeCloseTo(before, 0);
  });

  it("does not wobble its yaw while a fisher walks past behind another", () => {
    const rig = new CameraRig(16 / 9);
    const kid: Fisher = { x: -1.9, z: 15.8, bob: null };
    const dad: Fisher = { x: 1.5, z: 12, bob: null };
    const poses: Pose[] = [];
    for (let i = 0; i < 60 * 14; i++) {
      const t = i / 60;
      // Dad strolls across behind Juneau (right to left, 2.5 m further from the lens), then stops.
      if (t > 4) dad.x = Math.max(-6, 1.5 - (t - 4) * 1.4);
      feed(rig, [kid, dad], t, null);
      if (t > 3) poses.push(pose(rig, t));
    }
    expect(turnReversals(poses)).toEqual([]);
  });

  it("keeps the discovery look where it began when the place's own side changes mid-reveal", () => {
    const rig = new CameraRig(16 / 9);
    const fam: Fisher[] = [{ x: -50, z: 30, bob: null }, { x: -46, z: 27, bob: null }];
    const poses: Pose[] = [];
    rig.placeYaw = -0.1;
    for (let i = 0; i < 60 * 14; i++) {
      const t = i / 60;
      const reveal = t >= 5 && t < 10.4 ? { x: -64, z: 40, age: t - 5, r: 13 } : null;
      // Stepping into the new place's clearing 2 s into the reveal swings the place's side round (index.ts).
      if (t >= 7) rig.placeYaw = 1.4;
      feed(rig, fam, t, null, reveal);
      if (t > 4) poses.push(pose(rig, t));
    }
    expect(turnReversals(poses)).toEqual([]);
    // Never further round than straight behind the family as seen from the new pond (the old offset from the
    // place's side doubled up: 1.4 + the reveal's 1.6 rad).
    const behind = Math.atan2(-48 + 64, 28.5 - 40);
    expect(Math.max(...poses.map((p) => p.yaw))).toBeLessThan(behind + 0.2);
  });
});

const nums = z.array(z.array(z.number()));
const TraceFile = z.object({
  frames: z.array(
    z.object({
      t: z.number(),
      dt: z.number(),
      campfire: z.boolean(),
      catchAt: z.object({ x: z.number(), y: z.number(), z: z.number(), age: z.number() }).nullable(),
      trail: z.number(),
      reveal: z.object({ x: z.number(), z: z.number(), age: z.number(), r: z.number().optional() }).nullable(),
      pts: nums,
      feet: nums,
      blockers: nums,
      placeYaw: z.number(),
      minDist: z.number(),
      rateK: z.number(),
      ride: z.object({ heading: z.number(), kind: z.number() }).nullable(),
      board: z.object({ ux: z.number(), uz: z.number(), kind: z.number() }).nullable(),
      out: z.array(z.number()),
    }),
  ),
});

describe("the recorded Moonwell session (camera-trace.mts)", () => {
  it("replays cast, two catches and a recast with no back-and-forth", () => {
    const frames: RigFrame[] = TraceFile.parse(JSON.parse(MOONWELL_TRACE)).frames;
    expect(frames.length).toBeGreaterThan(2000);
    const rig = new CameraRig(16 / 9);
    const poses: Pose[] = [];
    for (const f of frames) {
      rig.replay(f);
      poses.push(pose(rig, f.t));
    }
    expect(judder(poses.slice(120))).toEqual([]);
  });
});

describe("catchWeight", () => {
  // Round 27: in over 1.4 s (was 0.9 s: the round 26 session's camera_jerk flags clustered in the push-in).
  it("eases in over 1.4 s, holds to 3.4 s, and is out by 4.4 s", () => {
    expect(catchWeight(0)).toBe(0);
    expect(catchWeight(0.7)).toBeCloseTo(0.5, 2);
    expect(catchWeight(1.5)).toBe(1);
    // Round 26: held to 3.4 s and out by 4.4 s (was held to 2.2 s, out by 3.2 s: the round 25 critic's abrupt pull-out).
    expect(catchWeight(3.3)).toBe(1);
    expect(catchWeight(3.9)).toBeCloseTo(0.5, 2);
    expect(catchWeight(4.4)).toBe(0);
  });
});

import { readFileSync } from "node:fs";
import { CameraRig, type RigFrame } from "/Users/jonathanmumm/src/bobberbrook/.claude/worktrees/hillclimb-207936/src/client/scene/camera.ts";
import { panReversals, turnReversals, zoomReversals, type Pose } from "/Users/jonathanmumm/src/bobberbrook/.claude/worktrees/hillclimb-207936/src/client/scene/cameraJudder.ts";
const file = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const frames: RigFrame[] = file.frames;
const rig = new CameraRig(16 / 9);
const poses: Pose[] = [];
const t0 = frames[0]!.t;
const speeds: { t: number; v: number; kind: string }[] = [];
let prev: Pose | null = null;
for (const f of frames) {
  rig.replay(f);
  const d = rig.debug();
  const p = { t: f.t - t0, x: d.target[0] ?? 0, z: d.target[2] ?? 0, dist: d.dist, yaw: d.yaw, el: d.el };
  poses.push(p);
  if (prev) {
    const dt = Math.max(1e-3, p.t - prev.t);
    // screen motion proxy: pan (rad) + turn + zoom log + el change, per second
    const pan = Math.hypot(p.x - prev.x, p.z - prev.z) / Math.max(1, p.dist);
    const v = (pan + Math.abs(p.yaw - prev.yaw) + Math.abs(Math.log(p.dist / prev.dist)) + Math.abs(p.el - prev.el)) / dt;
    speeds.push({ t: p.t, v, kind: f.catchAt ? "catch" : f.reveal ? "reveal" : f.trail > 0 ? "trail" : "" });
  }
  prev = p;
}
const deg = 180 / Math.PI;
const rs = [
  ...panReversals(poses).map((r) => `pan ${r.a.from.toFixed(2)}s ${(r.a.amount * deg).toFixed(2)} -> ${(r.b.amount * deg).toFixed(2)} deg`),
  ...turnReversals(poses).map((r) => `turn ${r.a.from.toFixed(2)}s ${(r.a.amount * deg).toFixed(2)} -> ${(r.b.amount * deg).toFixed(2)} deg`),
  ...zoomReversals(poses, 0.08).map((r) => `zoom ${r.a.from.toFixed(2)}s ${r.a.amount.toFixed(3)} -> ${r.b.amount.toFixed(3)}`),
];
console.log("reversals", rs.length);
for (const r of rs) console.log(" ", r);
const sorted = speeds.map((s) => s.v).sort((a, b) => a - b);
const med = sorted[Math.floor(sorted.length / 2)]!;
console.log("median speed", med.toFixed(4), "p95", sorted[Math.floor(sorted.length * 0.95)]!.toFixed(4), "max", sorted[sorted.length - 1]!.toFixed(4));
// peaks: windows of 0.5 s with max speed > 6x median
let last = -9;
for (const s of speeds) if (s.v > 8 * med && s.t - last > 0.5) { console.log(`fast ${s.t.toFixed(2)}s ${(s.v / med).toFixed(1)}x ${s.kind}`); last = s.t; }

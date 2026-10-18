import { readFileSync } from "node:fs";
import { Vector3 } from "/Users/jonathanmumm/src/bobberbrook/.claude/worktrees/hillclimb-207936/node_modules/three/build/three.module.js";
import { CameraRig, type RigFrame } from "/Users/jonathanmumm/src/bobberbrook/.claude/worktrees/hillclimb-207936/src/client/scene/camera.ts";
const file = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const frames: RigFrame[] = file.frames;
const rig = new CameraRig(16 / 9);
const t0 = frames[0]!.t;
const v = new Vector3(), side = new Vector3();
let worst = 0, cut = 0, n = 0; const where: string[] = [];
for (const f of frames) {
  rig.replay(f);
  if (f.campfire || f.ride || f.board) continue;
  const cam = rig.camera;
  cam.updateMatrixWorld(true);
  side.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize().multiplyScalar(0.6);
  let m = 0;
  for (const p of f.feet) for (const sd of [-1, 1]) for (const lift of [0, 2.2]) {
    v.set((p[0] ?? 0) + side.x * sd, lift, (p[1] ?? 0) + side.z * sd).project(cam);
    m = Math.max(m, Math.abs(v.x));
  }
  n++; worst = Math.max(worst, m);
  if (m > 0.97) { cut++; if (where.length === 0 || Number(where[where.length - 1]!.split(" ")[0]) < f.t - t0 - 1) where.push(`${(f.t - t0).toFixed(1)} ${m.toFixed(2)}`); }
}
console.log("frames", n, "body past 0.97 NDC:", cut, "worst", worst.toFixed(3), where.join(", "));

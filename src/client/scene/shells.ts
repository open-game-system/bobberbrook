import { Color, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, type BufferGeometry } from "three";
import type { Lake } from "../../game/lake";
import { merge, paint, prep } from "./geo";
import type { Fx } from "./fx";
import { heightAt } from "./terrain";
import type { TodState } from "./tod";

/**
 * Trail shells: pearly glowing scallop shells hovering over the path, turning slowly. One that's ready
 * (backAt passed) shows; picking one up pops it with a burst and a stream of motes to the picker.
 */

const MAX = 96;

function shellGeometry(): BufferGeometry {
  // A scallop: a flattened half-dome with ridges, and a little hinge.
  const g = new SphereGeometry(0.34, 14, 6, 0, Math.PI, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 0.35);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const a = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    pos.setZ(i, pos.getZ(i) + Math.sin(a * 9) * 0.025 * (r / 0.34));
  }
  g.computeVertexNormals();
  const shell = paint(prep(g), 0xf0d8f0, 0xfff8ff, (p, _n, c) => {
    const a = Math.atan2(p.y, p.x);
    if (Math.sin(a * 9) > 0.6) c.lerp(new Color(0xc8e8ff), 0.6);
  });
  const hinge = paint(prep(new SphereGeometry(0.08, 6, 4).scale(1.4, 0.7, 0.6).translate(0, -0.02, 0)), 0xe8c8e0);
  return merge([shell, hinge]);
}

export type Shells = { mesh: InstancedMesh; update(lake: Lake | null, sn: number, t: number, tod: TodState, fx: Fx, fishers: (seat: number) => { x: number; y: number; z: number } | null): void; dispose(): void };

export function buildShells(): Shells {
  const geo = shellGeometry();
  const mat = new MeshBasicMaterial({ vertexColors: true });
  const mesh = new InstancedMesh(geo, mat, MAX);
  mesh.name = "trail-shells";
  mesh.frustumCulled = false;
  // Instance colours (white) so it shares the trail mushrooms' shader.
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, new Color(1, 1, 1));
  mesh.count = 1;
  const d = new Object3D();
  let seq = -1;
  return {
    mesh,
    update(lake, sn, t, tod, fx, fisherAt) {
      mat.color.setScalar(0.95 + 0.9 * tod.glow);
      let n = 0;
      if (lake) {
        for (const s of lake.sparkles) {
          if (n >= MAX || s.backAt > sn) continue;
          const bob = Math.sin(t * 2 + s.id) * 0.12;
          d.position.set(s.pos.x, Math.max(0, heightAt(s.pos.x, s.pos.z)) + 0.95 + bob, s.pos.z);
          d.rotation.set(0.25, t * 1.2 + s.id, 0);
          d.scale.setScalar(1.25);
          d.updateMatrix();
          mesh.setMatrixAt(n++, d.matrix);
        }
        // A pickup: pop, and motes fly to whoever picked it up.
        const pk = lake.pickup;
        if (pk && pk.seq !== seq) {
          const fresh = seq !== -1 || sn - pk.at < 1500;
          seq = pk.seq;
          const s = lake.sparkles.find((x) => x.id === pk.sparkleId);
          if (fresh && s) {
            const y = Math.max(0, heightAt(s.pos.x, s.pos.z)) + 1;
            fx.sparkle(s.pos.x, y, s.pos.z, 22, 1, 0.92, 1, 3, 0.32);
            const f = fisherAt(pk.seat);
            if (f) fx.sparkle(f.x, f.y + 1.6, f.z, 12, 1, 0.9, 0.7, 1.4, 0.26);
          }
        } else if (!pk && seq === -1) seq = 0;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}

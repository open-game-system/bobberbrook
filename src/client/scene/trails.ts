import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, MeshBasicMaterial, SphereGeometry, type Material } from "three";
import { TRAILS, TRAIL_HALF_WIDTH } from "../../game/world";
import { instanced, mushroomGeometry, rockGeometry, type Inst } from "./kit";
import { merge, paint, prep } from "./geo";
import { rng } from "./noise";
import { heightAt } from "./terrain";
import type { TodState } from "./tod";

/**
 * Forest trails between the places: edge stones, little lanterns every few metres and clusters of
 * glowing mushrooms, so a trail reads as a way through the woods and leads the eye on.
 */
export type TrailDressing = { group: Group; update(tod: TodState, time: number): void; dispose(): void };

export function buildTrails(full: boolean, painted: Material): TrailDressing {
  const R = rng(2468);
  const stones: Inst[] = [];
  const lamps: Inst[] = [];
  const glass: Inst[] = [];
  const shrooms: Inst[] = [];
  const shroomCols = [new Color(0.5, 1.6, 2.2), new Color(0.9, 0.8, 2.4), new Color(0.4, 2.0, 1.8), new Color(1.6, 0.9, 2.2)];
  TRAILS.forEach((t, ti) => {
    const dx = t.to.x - t.from.x;
    const dz = t.to.z - t.from.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const at = (along: number, lat: number) => ({ x: t.from.x + ux * along - uz * lat, z: t.from.z + uz * along + ux * lat });
    for (let s = -4; s < len + 4; s += 1.6 + R() * 1.2) {
      for (const side of [-1, 1]) {
        if (R() < 0.35) continue;
        const p = at(s, side * (TRAIL_HALF_WIDTH + 0.1 + R() * 0.9));
        stones.push({ x: p.x, y: heightAt(p.x, p.z) - 0.05, z: p.z, s: 0.18 + R() * 0.32, ry: R() * 6, tint: new Color(1, 1, 1).multiplyScalar(0.8 + R() * 0.3) });
      }
    }
    // Lanterns, alternating sides: they lead the eye along the way.
    let side = ti % 2 === 0 ? 1 : -1;
    for (let s = 3; s < len - 1; s += 8.5) {
      const p = at(s, side * (TRAIL_HALF_WIDTH - 0.2));
      const y = heightAt(p.x, p.z) - 0.05;
      // Face the lamp arm over the path.
      const ry = Math.atan2(side * ux, side * uz);
      lamps.push({ x: p.x, y, z: p.z, s: 1, ry });
      glass.push({ x: p.x, y, z: p.z, s: 1, ry, tint: new Color(1, 0.7, 0.35) });
      side = -side;
    }
    for (let s = 2; s < len; s += 3 + R() * 4) {
      const lat = (R() < 0.5 ? -1 : 1) * (TRAIL_HALF_WIDTH + 0.3 + R() * 1.4);
      const c = shroomCols[Math.floor(R() * shroomCols.length)]!;
      const k = 2 + Math.floor(R() * 4);
      for (let i = 0; i < k; i++) {
        const p = at(s + (R() - 0.5) * 1.2, lat + (R() - 0.5) * 1.0);
        shrooms.push({ x: p.x, y: heightAt(p.x, p.z) - 0.02, z: p.z, s: 0.9 + R() * 1.5, ry: R() * 6, tint: c });
      }
    }
  });
  const group = new Group();
  group.name = "trails";
  const lampPost = prep(new CylinderGeometry(0.05, 0.07, 1.3, 6).translate(0, 0.65, 0));
  paint(lampPost, 0x3a2c38);
  const lampHook = prep(new BoxGeometry(0.32, 0.04, 0.04).translate(0.14, 1.28, 0));
  paint(lampHook, 0x3a2c38);
  const lampCap = prep(new ConeGeometry(0.13, 0.12, 6).translate(0.28, 1.2, 0));
  paint(lampCap, 0x2a2228);
  const posts = instanced(merge([lampPost, lampHook, lampCap]), painted, lamps, full);
  posts.name = "trail-lamps";
  const glassMat = new MeshBasicMaterial({ color: 0xffffff });
  const glassMesh = instanced(new SphereGeometry(0.1, 8, 6).scale(1, 1.3, 1).translate(0.28, 1.05, 0), glassMat, glass, false);
  glassMesh.name = "trail-lamp-glass";
  const stoneMesh = instanced(rockGeometry(11), painted, stones, full);
  stoneMesh.name = "trail-stones";
  const shroomMat = new MeshBasicMaterial({ vertexColors: true });
  const shroomMesh = instanced(mushroomGeometry(), shroomMat, shrooms, false);
  shroomMesh.name = "trail-mushrooms";
  group.add(posts, glassMesh, stoneMesh, shroomMesh);
  return {
    group,
    update(tod) {
      glassMat.color.setScalar(0.9 + 2.2 * tod.glow);
      shroomMat.color.setScalar(0.35 + 0.75 * tod.glow);
    },
    dispose() {
      for (const m of [posts, glassMesh, stoneMesh, shroomMesh]) m.geometry.dispose();
      glassMat.dispose();
      shroomMat.dispose();
    },
  };
}

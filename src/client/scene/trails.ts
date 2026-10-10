import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, SphereGeometry, type Material, type MeshLambertMaterial } from "three";
import { TRAIL_HALF_WIDTH } from "../../game/world";
import { instanced, rockGeometry, type Inst } from "./kit";
import { poolMesh } from "./pools";
import { matteTint, plantGeometry } from "./plants";
import { fadeGlowMaterial, fadeMaterial, merge, paint, prep } from "./geo";
import { hash2, rng } from "./noise";
import { trailsWithin, type SceneTrail } from "./worldQuery";
import type { Jobs } from "./stream";
import { heightAt } from "./terrain";
import type { TodState } from "./tod";

/**
 * Forest trails between the places: edge stones, little lanterns every few metres and clusters of
 * glowing mushrooms, so a trail reads as a way through the woods and leads the eye on.
 */
export type TrailDressing = { group: Group; update(tod: TodState, time: number, fx: number, fz: number): void; reset(): void; dispose(): void };

const SHOW_R = 230;

export function buildTrails(full: boolean, painted: Material, jobs: Jobs, plantMat: MeshLambertMaterial): TrailDressing {
  const group = new Group();
  group.name = "trails";
  const shroomCols = [new Color(0.5, 1.6, 2.2), new Color(0.9, 0.8, 2.4), new Color(0.4, 2.0, 1.8), new Color(1.6, 0.9, 2.2)].map(matteTint);
  const lampPost = prep(new CylinderGeometry(0.05, 0.07, 1.3, 6).translate(0, 0.65, 0));
  paint(lampPost, 0x3a2c38);
  const lampHook = prep(new BoxGeometry(0.32, 0.04, 0.04).translate(0.14, 1.28, 0));
  paint(lampHook, 0x3a2c38);
  const lampCap = prep(new ConeGeometry(0.13, 0.12, 6).translate(0.28, 1.2, 0));
  paint(lampCap, 0x2a2228);
  const postGeo = merge([lampPost, lampHook, lampCap]);
  const glassGeo = new SphereGeometry(0.1, 8, 6).scale(1, 1.3, 1).translate(0.28, 1.05, 0);
  const stoneGeo = rockGeometry(11);
  const capGeo = plantGeometry("glowcap");
  // Lamps dissolve between the camera and a fisher, glass and all.
  const glassMat = fadeGlowMaterial({ vertexColors: false });
  const postMat = fadeMaterial(painted);
  const live = new Map<string, { g: Group | null; alive: boolean }>();
  let lastX = 1e9;
  let lastZ = 1e9;

  function* dress(t: SceneTrail, slot: { g: Group | null; alive: boolean }): Generator<void, void> {
    let h = 0;
    for (let i = 0; i < t.key.length; i++) h = (h * 31 + t.key.charCodeAt(i)) | 0;
    const R = rng(Math.floor(hash2(h, 7, 2468) * 4294967296));
    const stones: Inst[] = [];
    const lamps: Inst[] = [];
    const glass: Inst[] = [];
    const shrooms: Inst[] = [];
    const pools: Inst[] = [];
    const { ux, uz, len } = t;
    const at = (along: number, lat: number) => ({ x: t.from.x + ux * along - uz * lat, z: t.from.z + uz * along + ux * lat });
    for (let s = -4; s < len + 4; s += 1.6 + R() * 1.2) {
      for (const side of [-1, 1]) {
        if (R() < 0.35) continue;
        const p = at(s, side * (TRAIL_HALF_WIDTH + 0.1 + R() * 0.9));
        stones.push({ x: p.x, y: heightAt(p.x, p.z) - 0.05, z: p.z, s: 0.18 + R() * 0.32, ry: R() * 6, tint: new Color(1, 1, 1).multiplyScalar(0.8 + R() * 0.3) });
      }
    }
    yield;
    // Lanterns, alternating sides: they lead the eye along the way.
    let side = h % 2 === 0 ? 1 : -1;
    for (let s = 3; s < len - 1; s += 8.5) {
      const p = at(s, side * (TRAIL_HALF_WIDTH - 0.2));
      const y = heightAt(p.x, p.z) - 0.05;
      const ry = Math.atan2(side * ux, side * uz);
      lamps.push({ x: p.x, y, z: p.z, s: 1, ry });
      glass.push({ x: p.x, y, z: p.z, s: 1, ry, tint: new Color(1, 0.7, 0.35) });
      pools.push({ x: p.x + Math.cos(ry) * 0.28, y, z: p.z - Math.sin(ry) * 0.28, s: 3.4, ry });
      side = -side;
    }
    for (let s = 2; s < len; s += 3 + R() * 4) {
      const lat = (R() < 0.5 ? -1 : 1) * (TRAIL_HALF_WIDTH + 0.3 + R() * 1.4);
      const c = shroomCols[Math.floor(R() * shroomCols.length)]!;
      const k = 2 + Math.floor(R() * 4);
      for (let i = 0; i < k; i++) {
        const p = at(s + (R() - 0.5) * 1.2, lat + (R() - 0.5) * 1.0);
        // Round 16: matte painted glow-cap cards (the 3D toadstools read as smooth glossy domes on the TV).
        shrooms.push({ x: p.x, y: heightAt(p.x, p.z) - 0.02, z: p.z, s: (0.9 + R() * 1.5) * 0.6, ry: R() * 6, tint: new Color(1, 1, 1).lerp(c, 0.55) });
      }
    }
    yield;
    if (!slot.alive) return;
    const g = new Group();
    g.name = `trail-${t.key}`;
    const posts = instanced(postGeo, postMat, lamps, full);
    posts.name = "trail-lamps";
    const glassMesh = instanced(glassGeo, glassMat, glass, false);
    glassMesh.name = "trail-lamp-glass";
    const stoneMesh = instanced(stoneGeo, painted, stones, full);
    stoneMesh.name = "trail-stones";
    const capMesh = instanced(capGeo, plantMat, shrooms, false);
    capMesh.name = "plants-glowcap";
    g.add(posts, glassMesh, stoneMesh, capMesh, poolMesh(pools));
    slot.g = g;
    group.add(g);
  }

  const drop = (slot: { g: Group | null; alive: boolean }) => {
    slot.alive = false;
    if (slot.g) {
      group.remove(slot.g);
      slot.g.traverse((o) => { if (o instanceof InstancedMesh) o.dispose(); });
    }
    slot.g = null;
  };

  return {
    group,
    update(tod, _time, fx, fz) {
      glassMat.color.setScalar(0.9 + 2.2 * tod.glow);
      if (Math.hypot(fx - lastX, fz - lastZ) < 6) return;
      lastX = fx;
      lastZ = fz;
      const near = new Set<string>();
      for (const t of trailsWithin(fx, fz, 2)) {
        const mx = (t.from.x + t.to.x) / 2;
        const mz = (t.from.z + t.to.z) / 2;
        const d = Math.hypot(mx - fx, mz - fz) - t.len / 2;
        if (d > SHOW_R) continue;
        near.add(t.key);
        if (live.has(t.key)) continue;
        const slot = { g: null, alive: true };
        live.set(t.key, slot);
        jobs.add(Math.max(0, d), dress(t, slot));
      }
      for (const [k, slot] of live) {
        if (near.has(k)) continue;
        drop(slot);
        live.delete(k);
      }
    },
    reset() {
      for (const slot of live.values()) drop(slot);
      live.clear();
      lastX = 1e9;
    },
    dispose() {
      for (const slot of live.values()) drop(slot);
      live.clear();
      for (const g of [postGeo, glassGeo, stoneGeo, capGeo]) g.dispose();
      glassMat.dispose();
    },
  };
}

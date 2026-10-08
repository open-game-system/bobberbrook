import { Color, Group, MeshBasicMaterial, MeshLambertMaterial, type Camera, type Material } from "three";
import { AREAS, pondRadius, type Area, type AreaId } from "../../game/world";
import { bellGeometry, fernGeometry, flowerGeometry, instanced, lilyGeometry, lupineGeometry, mushroomGeometry, padGeometry, reedGeometry, rockGeometry, tuftGeometry, type Inst } from "./kit";
import { rng, vnoise } from "./noise";
import { heightAt, trailWear } from "./terrain";
import type { TodState } from "./tod";

/**
 * The area kit: every far place's shore and clearing dressed from the same parts (rocks, reeds, lily
 * pads, grass, flowers, ferns, glowing mushrooms), in its own colours and amounts. Each place is one
 * group, hidden when the camera is far away.
 */

export type AreaMats = { painted: Material; paintedDouble: Material; sway: MeshLambertMaterial; tree: Material };

type Recipe = {
  flowers: number[];
  shrooms: Color[];
  /** Relative amounts. */
  grass: number;
  flower: number;
  fern: number;
  reed: number;
  pad: number;
  lily: number;
  shroom: number;
  rock: number;
  bell: number;
};

const RECIPES: Record<Exclude<AreaId, "moonwell">, Recipe> = {
  mistmarsh: {
    flowers: [0xc9a6ff, 0x9a7aff, 0xff9ee0, 0xffffff], shrooms: [new Color(0.9, 0.8, 2.4), new Color(1.6, 0.9, 2.2)],
    grass: 1.1, flower: 0.6, fern: 0.6, reed: 2.4, pad: 2.6, lily: 1.8, shroom: 0.5, rock: 0.5, bell: 0.6,
  },
  pools: {
    flowers: [0xffffff, 0xc9a6ff, 0x9ad8ff, 0xffe0f0], shrooms: [new Color(0.5, 1.6, 2.2)],
    grass: 1.0, flower: 1.3, fern: 1.0, reed: 0.4, pad: 0.3, lily: 0.2, shroom: 0.3, rock: 2.6, bell: 0.4,
  },
  hollow: {
    flowers: [0x7ae8e0, 0x9a6ae8], shrooms: [new Color(0.4, 2.0, 1.8), new Color(1.3, 0.8, 2.4), new Color(0.5, 1.6, 2.4)],
    grass: 0.6, flower: 0.3, fern: 2.2, reed: 0.3, pad: 0.6, lily: 0, shroom: 3.0, rock: 1.4, bell: 2.0,
  },
  tarn: {
    flowers: [0xb8c8ff, 0xffffff, 0x9a8aff], shrooms: [new Color(0.7, 1.2, 2.4)],
    grass: 0.9, flower: 0.6, fern: 0.4, reed: 0.5, pad: 0.4, lily: 0.3, shroom: 0.3, rock: 1.8, bell: 0.7,
  },
};

export type AreaDressing = {
  group: Group;
  byArea: Map<AreaId, Group>;
  update(tod: TodState, camera: Camera, glowBoost: Float32Array): void;
  dispose(): void;
};

const SHOW_DIST = 150;

function dress(a: Area, r: Recipe, full: boolean, m: AreaMats, glow: MeshBasicMaterial, lilyMat: Material): Group {
  const R = rng(a.center.x * 13 + a.center.z * 7 + 99);
  const g = new Group();
  g.name = `area-${a.id}`;
  const q = full ? 1 : 0.45;
  const outer = a.pond.r + a.clearing;
  const tufts: Inst[] = [];
  const flowers: Inst[] = [];
  const ferns: Inst[] = [];
  const shrooms: Inst[] = [];
  const bells: Inst[] = [];
  const lupines: Inst[] = [];
  const rocks: Inst[] = [];
  const reeds: Inst[] = [];
  const cattails: Inst[] = [];
  const pads: Inst[] = [];
  const lilies: Inst[] = [];
  const flowerCols = r.flowers.map((h) => new Color(h));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(R() * arr.length)]!;
  const land = (minD: number, maxD: number) => {
    const th = R() * Math.PI * 2;
    const edge = pondRadius(a, th);
    const rr = edge + minD + Math.pow(R(), 1.2) * (Math.min(maxD, outer + 4 - edge) - minD);
    return { th, x: a.center.x + Math.cos(th) * rr, z: a.center.z + Math.sin(th) * rr, d: rr - edge };
  };
  const n = (k: number) => Math.round(k * q);
  for (let i = 0; i < n(1500 * r.grass); i++) {
    const p = land(0.6, 30);
    if (trailWear(p.x, p.z) > 0.5 && R() < 0.85) continue;
    if (vnoise(p.x * 0.15, p.z * 0.15, 5) < 0.35 && R() < 0.6) continue;
    tufts.push({ x: p.x, y: heightAt(p.x, p.z) - 0.03, z: p.z, s: 0.8 + R() * 0.9, ry: R() * 6, tint: new Color(1, 1, 1).multiplyScalar(0.8 + R() * 0.35) });
  }
  for (let i = 0; i < n(500 * r.flower); i++) {
    const p = land(1.0, 22);
    if (trailWear(p.x, p.z) > 0.3 || vnoise(p.x * 0.18, p.z * 0.18, 31) < 0.5) continue;
    flowers.push({ x: p.x, y: heightAt(p.x, p.z) - 0.02, z: p.z, s: 0.9 + R() * 0.7, ry: R() * 6, tint: pick(flowerCols) });
  }
  for (let i = 0; i < n(110 * r.fern); i++) {
    const p = land(1.2, 24);
    if (trailWear(p.x, p.z) > 0.3) continue;
    ferns.push({ x: p.x, y: heightAt(p.x, p.z) - 0.03, z: p.z, s: 0.8 + R() * 1.0, ry: R() * 6, tint: new Color(1, 1, 1).multiplyScalar(0.8 + R() * 0.35) });
  }
  for (let i = 0; i < n(60 * r.lily + 40); i++) {
    const p = land(4, 24);
    if (trailWear(p.x, p.z) > 0.2) continue;
    lupines.push({ x: p.x, y: heightAt(p.x, p.z) - 0.03, z: p.z, s: 0.9 + R() * 0.7, ry: R() * 6, tint: pick(flowerCols) });
  }
  for (let i = 0; i < n(90 * r.shroom); i++) {
    const p = land(0.4, 26);
    if (trailWear(p.x, p.z) > 0.4 || vnoise(p.x * 0.3, p.z * 0.3, 55) < 0.4) continue;
    shrooms.push({ x: p.x, y: heightAt(p.x, p.z) - 0.02, z: p.z, s: 0.9 + R() * 1.4, ry: R() * 6, tint: pick(r.shrooms) });
  }
  for (let i = 0; i < n(80 * r.bell); i++) {
    const p = land(0.8, 20);
    if (trailWear(p.x, p.z) > 0.4) continue;
    bells.push({ x: p.x, y: heightAt(p.x, p.z) - 0.02, z: p.z, s: 0.9 + R() * 0.8, ry: R() * 6, tint: pick(r.shrooms) });
  }
  for (let i = 0; i < Math.round(30 * r.rock); i++) {
    const th = R() * Math.PI * 2;
    const rr = pondRadius(a, th) - 0.8 + R() * 1.8;
    const x = a.center.x + Math.cos(th) * rr;
    const z = a.center.z + Math.sin(th) * rr;
    rocks.push({ x, y: heightAt(x, z) + 0.02, z, s: 0.2 + R() * 0.55, ry: R() * 6 });
  }
  for (let i = 0; i < Math.round(60 * r.reed * (full ? 1 : 0.6)); i++) {
    const th = R() * Math.PI * 2;
    if (vnoise(Math.cos(th) * 3, Math.sin(th) * 3, 17) < 0.45) continue;
    const rr = pondRadius(a, th) - 1.4 + R() * 2.0;
    const x = a.center.x + Math.cos(th) * rr;
    const z = a.center.z + Math.sin(th) * rr;
    const it = { x, y: heightAt(x, z), z, s: 0.7 + R() * 0.6, ry: R() * 6, tint: new Color(1, 1, 1).multiplyScalar(0.85 + R() * 0.25) };
    (R() < 0.35 ? cattails : reeds).push(it);
  }
  for (let i = 0; i < 300 && pads.length < Math.round(30 * r.pad); i++) {
    const th = R() * Math.PI * 2;
    const rr = pondRadius(a, th) - 0.6 - Math.pow(R(), 0.8) * Math.min(7, a.pond.r * 0.55);
    const x = a.center.x + Math.cos(th) * rr;
    const z = a.center.z + Math.sin(th) * rr;
    if (vnoise(x * 0.35, z * 0.35, 12) < 0.4) continue;
    if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < 0.75 * Math.max(p.s, 1))) continue;
    const s = 0.65 + R() * 0.75;
    pads.push({ x, y: 0.025, z, s, ry: R() * 6, tint: new Color(1, 1, 1).multiplyScalar(0.85 + R() * 0.25) });
    if (R() < 0.3 * r.lily) lilies.push({ x: x + 0.1, y: 0.03, z: z - 0.05, s: 1.0 + R() * 0.7, ry: R() * 6 });
  }
  const add = (list: Inst[], geo: Parameters<typeof instanced>[0], mat: Material, shadows: boolean, name: string) => {
    if (list.length === 0) {
      geo.dispose();
      return;
    }
    const mesh = instanced(geo, mat, list, shadows && full);
    mesh.name = name;
    g.add(mesh);
  };
  add(tufts, tuftGeometry(), m.sway, false, "grass");
  add(flowers, flowerGeometry(), m.sway, false, "flowers");
  add(ferns, fernGeometry(), m.sway, false, "ferns");
  add(lupines, lupineGeometry(), m.sway, false, "lupines");
  add(reeds, reedGeometry(false), m.sway, true, "reeds");
  add(cattails, reedGeometry(true), m.sway, true, "cattails");
  add(pads, padGeometry(), m.paintedDouble, false, "pads");
  add(lilies, lilyGeometry(), lilyMat, false, "lilies");
  add(rocks, rockGeometry(a.pond.r), m.painted, true, "rocks");
  add(shrooms, mushroomGeometry(), glow, false, "mushrooms");
  add(bells, bellGeometry(), glow, false, "bells");
  return g;
}

export function buildAreaDressing(full: boolean, m: AreaMats): AreaDressing {
  const group = new Group();
  group.name = "areas";
  const byArea = new Map<AreaId, Group>();
  const glows: MeshBasicMaterial[] = [];
  // Water lilies glow softly pink at dusk and night (the marsh's signature).
  const lilyMat = new MeshLambertMaterial({ vertexColors: true });
  for (const a of AREAS) {
    if (a.id === "moonwell") continue;
    const glow = new MeshBasicMaterial({ vertexColors: true });
    glows.push(glow);
    const g = dress(a, RECIPES[a.id], full, m, glow, lilyMat);
    byArea.set(a.id, g);
    group.add(g);
  }
  return {
    group,
    byArea,
    update(tod, camera, glowBoost) {
      lilyMat.emissive.setRGB(0.9, 0.35, 0.7).multiplyScalar(0.15 + 0.6 * tod.glow);
      let i = 0;
      for (const a of AREAS) {
        if (a.id === "moonwell") continue;
        const g = byArea.get(a.id);
        if (g) g.visible = Math.hypot(camera.position.x - a.center.x, camera.position.z - a.center.z) < SHOW_DIST + a.clearing;
        const k = AREAS.indexOf(a);
        glows[i]!.color.setScalar(0.3 + 0.75 * Math.min(1, tod.glow + (glowBoost[k] ?? 0)));
        i++;
      }
    },
    dispose() {
      group.traverse((o) => {
        if ("geometry" in o && o.geometry && typeof o.geometry === "object" && "dispose" in o.geometry && typeof o.geometry.dispose === "function") o.geometry.dispose();
      });
      for (const gl of glows) gl.dispose();
      lilyMat.dispose();
    },
  };
}

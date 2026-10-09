import { Color, Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, type Camera, type Material } from "three";
import { pondRadius, type Area, type PondPlace } from "../../game/world";
import type { Biome, Place } from "../../game/regions";
import { bellGeometry, fernGeometry, flowerGeometry, instanced, lilyGeometry, lupineGeometry, mushroomGeometry, padGeometry, reedGeometry, rockGeometry, tuftGeometry, type Inst } from "./kit";
import { rng, vnoise } from "./noise";
import { heightAt, trailWear } from "./terrain";
import type { TodState } from "./tod";
import { buildLandmark, type Landmark, type LandmarkStyle } from "./landmarks";

/** The home valley's own landmark styles (Moonwell has none of its own). */
const HOME_STYLES: readonly LandmarkStyle[] = ["mistmarsh", "pools", "hollow", "tarn"];
import { placeHash } from "./valley";
import { LANDMARKS, landmarkFor, type LandmarkKind } from "./biomes";
import { placesWithin } from "./worldQuery";
import type { Jobs } from "./stream";

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

const RECIPES: Record<Exclude<Biome, "moonwell">, Recipe> = {
  marsh: {
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
  willow: {
    flowers: [0xe8d0ff, 0xffffff, 0xc9a6ff, 0xffd0f0], shrooms: [new Color(1.4, 1.0, 2.4), new Color(1.8, 1.2, 2.2)],
    grass: 1.2, flower: 0.9, fern: 0.8, reed: 1.6, pad: 2.0, lily: 2.2, shroom: 0.4, rock: 0.6, bell: 0.8,
  },
  crystal: {
    flowers: [0xc8f0ff, 0xffffff, 0xb0c8ff], shrooms: [new Color(0.7, 1.8, 2.4), new Color(1.6, 1.4, 2.4)],
    grass: 0.8, flower: 0.6, fern: 0.4, reed: 0.3, pad: 0.3, lily: 0.2, shroom: 0.8, rock: 2.4, bell: 1.2,
  },
  ember: {
    flowers: [0xffc070, 0xff9a60, 0xffe0a0, 0xd8a0ff], shrooms: [new Color(2.4, 1.3, 0.5), new Color(2.2, 1.0, 0.6)],
    grass: 1.0, flower: 1.2, fern: 1.4, reed: 0.5, pad: 0.6, lily: 0.4, shroom: 1.2, rock: 1.0, bell: 0.5,
  },
  frost: {
    flowers: [0xffffff, 0xd8e8ff, 0xb8c8ff], shrooms: [new Color(0.8, 1.4, 2.4)],
    grass: 0.6, flower: 0.4, fern: 0.2, reed: 0.4, pad: 0.1, lily: 0, shroom: 0.2, rock: 2.0, bell: 0.4,
  },
};

/** Which set-piece builder dresses a biome (home places use their own). */
const STYLE: Record<Exclude<Biome, "moonwell">, LandmarkStyle> = {
  marsh: "mistmarsh", pools: "pools", hollow: "hollow", tarn: "tarn", willow: "willow", crystal: "crystal", ember: "ember", frost: "frost",
};

export type AreaDressing = {
  group: Group;
  /** Plans the places round the focus; glowOf/pulseOf give each place's extra glow and reveal pulse. */
  update(tod: TodState, camera: Camera, time: number, fx: number, fz: number, glowOf: (p: Place) => number, pulseOf: (id: string) => number): void;
  has(id: string): boolean;
  /** Builds one place of every style and landmark at once, moved in front of the camera, so every material variant compiles up front; call again with false to drop them. */
  showroom(on: boolean, places: readonly Place[], at: { x: number; z: number }): void;
  reset(): void;
  dispose(): void;
};

const SHOW_DIST = 150;
/** Places are dressed within this distance of the focus, and dropped past KEEP_DIST. */
const BUILD_DIST = 200;
const KEEP_DIST = 260;

function* dress(a: PondPlace, r0: Recipe, full: boolean, m: AreaMats, glow: MeshBasicMaterial, lilyMat: Material, key: string, home: boolean): Generator<void, Group> {
  const R = rng(a.center.x * 13 + a.center.z * 7 + 99);
  // Each generated place leans its recipe its own way (more ferns here, more rocks there).
  const v = (salt: number) => (home ? 1 : 0.6 + 0.8 * placeHash(key, salt));
  const r: Recipe = { ...r0, grass: r0.grass * v(11), flower: r0.flower * v(12), fern: r0.fern * v(13), reed: r0.reed * v(14), pad: r0.pad * v(15), lily: r0.lily * v(16), shroom: r0.shroom * v(17), rock: r0.rock * v(18), bell: r0.bell * v(19) };
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
  yield;
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
  yield;
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
  yield;
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
  yield;
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

type Live = { place: Place; g: Group | null; lm: Landmark | null; glow: MeshBasicMaterial; alive: boolean };

export function buildAreaDressing(full: boolean, m: AreaMats, jobs: Jobs): AreaDressing {
  const group = new Group();
  group.name = "areas";
  // Water lilies glow softly pink at dusk and night (the marsh's signature).
  const lilyMat = new MeshLambertMaterial({ vertexColors: true });
  const live = new Map<string, Live>();
  let lastX = 1e9;
  let lastZ = 1e9;

  function* build(l: Live, forced: LandmarkKind | null = null): Generator<void, void> {
    const a = l.place;
    const recipe = RECIPES[a.biome === "moonwell" ? "tarn" : a.biome];
    const g: Group = yield* dress(a, recipe, full, m, l.glow, lilyMat, a.key, a.home);
    yield;
    const homeStyle = HOME_STYLES.find((st) => st === a.id);
    const style: LandmarkStyle = a.home && homeStyle ? homeStyle : STYLE[a.biome === "moonwell" ? "tarn" : a.biome];
    const lm = buildLandmark(a, style, a.home ? 0 : Math.floor(placeHash(a.key, 5) * 1000), full, m.painted, m.tree, a.home ? null : forced ?? landmarkFor(a.biome, placeHash(a.key, 6)));
    if (!l.alive) {
      disposeGroup(g);
      lm.dispose();
      return;
    }
    g.add(lm.group);
    l.g = g;
    l.lm = lm;
    group.add(g);
  }

  function disposeGroup(g: Group): void {
    g.traverse((o) => {
      if (o instanceof InstancedMesh) {
        o.geometry.dispose();
        o.dispose();
      }
    });
  }

  function drop(l: Live): void {
    l.alive = false;
    if (l.g) {
      group.remove(l.g);
      if (l.lm) l.g.remove(l.lm.group);
      disposeGroup(l.g);
    }
    l.lm?.dispose();
    l.glow.dispose();
    l.g = null;
    l.lm = null;
  }

  const shown: Live[] = [];
  return {
    group,
    has: (id) => live.get(id)?.g != null,
    showroom(on, places, at) {
      if (on) {
        places.forEach((p, i) => {
          const l: Live = { place: p, g: null, lm: null, glow: new MeshBasicMaterial({ vertexColors: true }), alive: true };
          const g = build(l, LANDMARKS[i % LANDMARKS.length]!);
          for (let r = g.next(); !r.done; r = g.next());
          if (l.g) {
            const lg: Group = l.g;
            lg.position.set(at.x - p.center.x + (i % 4) * 3, 0, at.z - p.center.z + Math.floor(i / 4) * 3);
          }
          shown.push(l);
        });
      } else {
        for (const l of shown) drop(l);
        shown.length = 0;
      }
    },
    update(tod, camera, time, fx, fz, glowOf, pulseOf) {
      lilyMat.emissive.setRGB(0.9, 0.35, 0.7).multiplyScalar(0.15 + 0.6 * tod.glow);
      if (Math.hypot(fx - lastX, fz - lastZ) > 6) {
        lastX = fx;
        lastZ = fz;
        for (const p of placesWithin(fx, fz, 3)) {
          if (p.id === "moonwell") continue;
          const d = Math.hypot(p.center.x - fx, p.center.z - fz) - p.pond.r - p.clearing;
          if (d > BUILD_DIST || live.has(p.id)) continue;
          const l: Live = { place: p, g: null, lm: null, glow: new MeshBasicMaterial({ vertexColors: true }), alive: true };
          live.set(p.id, l);
          jobs.add(Math.max(0, d) + 2, build(l));
        }
        for (const [id, l] of live) {
          const d = Math.hypot(l.place.center.x - fx, l.place.center.z - fz) - l.place.pond.r - l.place.clearing;
          if (d > KEEP_DIST) {
            drop(l);
            live.delete(id);
          }
        }
      }
      for (const l of live.values()) {
        const a = l.place;
        if (!l.g) continue;
        l.g.visible = Math.hypot(camera.position.x - a.center.x, camera.position.z - a.center.z) < SHOW_DIST + a.clearing + 40;
        if (l.g.visible) l.lm?.update(tod, time, pulseOf(a.id));
        l.glow.color.setScalar(0.3 + 0.75 * Math.min(1, tod.glow + glowOf(a)));
      }
    },
    reset() {
      for (const l of live.values()) drop(l);
      live.clear();
      lastX = 1e9;
    },
    dispose() {
      for (const l of live.values()) drop(l);
      live.clear();
      lilyMat.dispose();
    },
  };
}

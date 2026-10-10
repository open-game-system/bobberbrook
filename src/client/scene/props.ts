import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  BoxGeometry,
  TorusGeometry,
  TubeGeometry,
  LatheGeometry,
  Vector2,
  Vector3,
  type Material,
} from "three";
import { CAMPFIRE, DOCK, EAST, OBSTACLES, SOUTH, WEST, NORTH, angleGap, lakeRadius, outerRadius } from "../../game/world";
import { FALLS, PATH_D, heightAt } from "./terrain";
import { clearOfTrails } from "./valley";
import { fbm, rng, vnoise } from "./noise";
import { fadeGlowMaterial, jitter, merge, paint, paintedMaterial, prep, puffNormals, surf } from "./geo";
import { buildCampfireFx } from "./campfire";
import { PK } from "./painter";
import type { TodState } from "./tod";
import type { SceneQuality } from "./types";

import { moonPoolMesh, poolMesh, updatePools } from "./pools";
import { CANOPY, blob, bushGeometry, cliffRockGeometry, cottageGeometry, dummy, flowerGeometry, giantGeometry, instanced, lilyGeometry, oakGeometry, padGeometry, pineGeometry, reedGeometry, rockGeometry, tuftGeometry, type Inst } from "./kit";
import { matteTint, plantLists, plantMeshes, type PlantKind } from "./plants";

// ---------- the set ----------

/** Far-shore cottages and the woods kept clear around them. */
const COTTAGE_CLEAR: [number, number][] = [
  [Math.cos(-2.62) * 37, Math.sin(-2.62) * 37], [Math.cos(-0.82) * 36, Math.sin(-0.82) * 36], [-5, -41], [12, -40],
];

export type Props = {
  group: Group;
  /** Lights owned by props (fixed count: dock lantern, campfire). */
  lanternLight: PointLight;
  fireLight: PointLight;
  /** Seats around the campfire (world xz + facing). */
  campSeats: { x: number; z: number; facing: number }[];
  /** Rod-tip-free dock tip (for camera framing etc.). */
  update(tod: TodState, time: number, campfire: number): void;
  dispose(): void;
};

export function buildProps(quality: SceneQuality, swayMat: MeshLambertMaterial, treeMat: MeshLambertMaterial, plantMat: MeshLambertMaterial): Props {
  const full = quality === "full";
  const group = new Group();
  group.name = "props";
  const disposables: { dispose(): void }[] = [];
  const mat = paintedMaterial();
  const matDouble = paintedMaterial({ side: DoubleSide });
  disposables.push(mat, matDouble);
  const R = rng(1234);
  const add = (m: Mesh | InstancedMesh) => {
    group.add(m);
    disposables.push(m.geometry);
    return m;
  };

  // --- trees: the obstacles exactly, then forest on the hills ---
  const oaks: Inst[] = [];
  const pines: Inst[] = [];
  const tint = (a: number, b: number) => new Color(1, 1, 1).multiplyScalar(a + R() * (b - a));
  for (const o of OBSTACLES) {
    const y = heightAt(o.x, o.z) - 0.1;
    if (o.kind === "oak") oaks.push({ x: o.x, y, z: o.z, s: o.r / 1.15, ry: R() * 6, tint: tint(0.95, 1.05) });
    if (o.kind === "pine") pines.push({ x: o.x, y, z: o.z, s: o.r / 1.0, ry: R() * 6, tint: tint(0.95, 1.05) });
  }
  for (let v = 0; v < 3; v++) add(instanced(oakGeometry(v), treeMat, oaks.filter((_, i) => i % 3 === v), true)).name = `oaks-${v}`;
  // The giants: colossal ancient trees towering over the rim.
  const giants: Inst[][] = [[], [], []];
  const giantSpots: [number, number, number][] = [[-2.5, 9, 0], [-0.62, 10, 2], [3.0, 8, 1], [0.12, 9, 0], [-1.98, 6, 1], [-1.12, 6, 2], [2.45, 12, 2], [0.75, 13, 1]];
  for (const [th, e, v] of giantSpots) {
    const r = outerRadius(th) + e;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (!clearOfTrails(x, z, 16)) continue;
    giants[v]!.push({ x, y: heightAt(x, z) - 0.4, z, s: 0.95 + R() * 0.3, ry: R() * 6 });
  }
  for (let v = 0; v < 3; v++) if (giants[v]!.length) add(instanced(giantGeometry(v), treeMat, giants[v]!, true)).name = `giants-${v}`;
  add(instanced(pineGeometry(), treeMat, pines, true)).name = "pines";

  // --- rocks: obstacles, shore stones, the falls, the fire ring ---
  const rocks: Inst[] = [];
  for (const o of OBSTACLES) if (o.kind === "rock") {
    const y = heightAt(o.x, o.z);
    rocks.push({ x: o.x, y: y + 0.1, z: o.z, s: o.r * 0.95, ry: R() * 6, sy: 1.1 });
    rocks.push({ x: o.x + o.r * 0.9, y, z: o.z + 0.3, s: o.r * 0.45, ry: R() * 6 });
  }
  for (let i = 0; i < 70; i++) {
    const th = R() * Math.PI * 2;
    if (angleGap(th, SOUTH) < 0.12) continue; // the dock
    const d = -0.8 + R() * 1.6;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    rocks.push({ x, y: heightAt(x, z) + 0.02, z, s: 0.18 + R() * 0.4, ry: R() * 6 });
  }
  // The falls: boulders flanking the brook and the cliff foot.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = FALLS.footZ - 2.5 + R() * (FALLS.footZ - FALLS.topZ + 8.5);
    const x = side * (FALLS.brookHalf + 0.9 + R() * 2.6);
    const big = z < FALLS.footZ + 0.5;
    rocks.push({ x, y: heightAt(x, z) - 0.1, z, s: big ? 1.0 + R() * 1.1 : 0.35 + R() * 0.5, ry: R() * 6, sy: big ? 1.3 : 1 });
  }
  const cliff: Inst[] = [];
  // A real rock cliff behind the waterfall: tall stacked boulders either side of the falls and behind its lip.
  for (let i = 0; i < 34; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2) % 3;
    const x = side * (2.0 + R() * 7.5 + row * 0.8);
    const z = FALLS.footZ - 0.6 - row * 2.2 - R() * 1.2;
    const s2 = 1.7 + R() * 1.6;
    cliff.push({ x, y: heightAt(x, z) - 0.6 - row * 0.3, z, s: s2, ry: R() * 6, sy: 1.5 + R() * 0.7, tint: tint(0.85, 1.1) });
  }
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * 2.6 + (R() - 0.5);
    const z = FALLS.topZ - 2.5 - R() * 2;
    if (Math.abs(x) < 1.8) continue;
    cliff.push({ x, y: heightAt(x, z) - 0.8, z, s: 2.2 + R() * 1.2, ry: R() * 6, sy: 1.6, tint: tint(0.8, 1.0) });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = CAMPFIRE.x + Math.cos(a) * 0.72;
    const z = CAMPFIRE.z + Math.sin(a) * 0.72;
    rocks.push({ x, y: heightAt(x, z) + 0.02, z, s: 0.17 + R() * 0.05, ry: R() * 6, tint: new Color(0.85, 0.85, 0.85) });
  }
  add(instanced(rockGeometry(3), mat, rocks, true)).name = "rocks";
  add(instanced(cliffRockGeometry(5), mat, cliff, true)).name = "cliff";

  // --- bushes ---
  const bushes: Inst[] = [];
  for (let i = 0; i < 200 && bushes.length < (full ? 70 : 35); i++) {
    const th = R() * Math.PI * 2;
    const outer = outerRadius(th);
    const r = outer - 1 + R() * 6;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (angleGap(th, SOUTH) < 0.5) continue;
    if (Math.abs(x) < 3 && z < 0) continue;
    if (!clearOfTrails(x, z, 0.8)) continue;
    bushes.push({ x, y: heightAt(x, z) - 0.05, z, s: 0.7 + R() * 0.7, ry: R() * 6, tint: tint(0.85, 1.1) });
  }
  for (const o of OBSTACLES) if (o.kind !== "rock") {
    const a = R() * 6;
    const x = o.x + Math.cos(a) * (o.r + 0.6);
    const z = o.z + Math.sin(a) * (o.r + 0.6);
    bushes.push({ x, y: heightAt(x, z) - 0.05, z, s: 0.55, ry: a });
  }
  add(instanced(bushGeometry(), treeMat, bushes, true)).name = "bushes";

  // --- grass and a few flowers (swaying); foxgloves where the lupine spikes stood ---
  const tufts: Inst[] = [];
  const flowers: Inst[] = [];
  const foxgloves: Inst[] = [];
  const grassCards: Inst[] = [];
  const flowerCols = [0xffffff, 0xc9a6ff, 0x9ad8ff, 0xb08aff, 0xff9ee0, 0x7ae8e0].map((h) => new Color(h));
  const tuftN = full ? 5200 : 1800;
  for (let i = 0; i < tuftN * 3 && tufts.length < tuftN; i++) {
    const th = R() * Math.PI * 2;
    const edge = lakeRadius(th);
    const d = 0.7 + Math.pow(R(), 1.3) * 34;
    const r = edge + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (Math.abs(x) <= DOCK.halfWidth + 0.3 && z > DOCK.tipZ && z < DOCK.rootZ + 0.5) continue;
    if (Math.abs(d - PATH_D) < 0.7 && R() < 0.85) continue;
    if (Math.abs(x) < 2 && z < -edge + 1 && z > FALLS.topZ) continue;
    const dens = fbm(x * 0.15, z * 0.15, 2, 5);
    if (dens < 0.38 && R() < 0.6) continue;
    // Round 09: the band nearest the camera is painted grass cards (no 3D blades under the lens),
    // fewer and bigger than the tufts they replace.
    if (angleGap(th, SOUTH) < 1.2 && d < 18) {
      if (R() < 0.3 && Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) > 3.2) grassCards.push({ x, y: heightAt(x, z) - 0.04, z, s: 0.75 + R() * 0.55, ry: R() * 6, tint: tint(1.0, 1.25) });
      continue;
    }
    tufts.push({ x, y: heightAt(x, z) - 0.03, z, s: 0.8 + R() * 0.9, ry: R() * 6, tint: tint(0.8, 1.15) });
  }
  // Round 09-B: a third of the old carpet, and almost none in the band in front of the camera.
  const flowerN = full ? 330 : 130;
  for (let i = 0; i < flowerN * 4 && flowers.length < flowerN; i++) {
    const th = R() * Math.PI * 2;
    const edge = lakeRadius(th);
    const d = 1.0 + Math.pow(R(), 1.2) * 26;
    const r = edge + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (Math.abs(d - PATH_D) < 0.8) continue;
    if (angleGap(th, SOUTH) < 1.2 && d < 16 && R() < 0.85) continue;
    if (Math.abs(x) <= DOCK.halfWidth + 0.3 && z > DOCK.tipZ && z < DOCK.rootZ + 0.5) continue;
    const patch = vnoise(x * 0.18, z * 0.18, 31);
    if (patch < 0.55) continue;
    const col = flowerCols[Math.floor(vnoise(x * 0.07, z * 0.07, 8) * flowerCols.length * 0.999 + R() * 1.4) % flowerCols.length]!;
    flowers.push({ x, y: heightAt(x, z) - 0.02, z, s: 0.9 + R() * 0.7, ry: R() * 6, tint: col });
  }
  const foxCol = () => new Color(1, 1, 1).lerp(new Color(0xd8c0ff), R() * 0.5).multiplyScalar(0.85 + R() * 0.2);
  for (let i = 0; i < 600 && foxgloves.length < (full ? 50 : 24); i++) {
    const th = R() * Math.PI * 2;
    const outer = outerRadius(th);
    const r = outer - 3 + R() * 9;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (vnoise(x * 0.12, z * 0.12, 41) < 0.55) continue;
    if (Math.abs(x) < 2.5 && z < 0) continue;
    if (angleGap(th, SOUTH) < 0.6) continue;
    if (!clearOfTrails(x, z, 0.3)) continue;
    foxgloves.push({ x, y: heightAt(x, z) - 0.03, z, s: 0.9 + R() * 0.6, ry: R() * 6, tint: foxCol() });
  }
  // A pair round each obstacle (the camp keeps its own clearing).
  for (const o of OBSTACLES) {
    for (let k = 0; k < 2; k++) {
      const a = R() * 6.28;
      const x = o.x + Math.cos(a) * (o.r + 0.5 + R() * 1.0);
      const z = o.z + Math.sin(a) * (o.r + 0.5 + R() * 1.0);
      foxgloves.push({ x, y: heightAt(x, z) - 0.03, z, s: 0.85 + R() * 0.5, ry: R() * 6, tint: foxCol() });
    }
  }
  add(instanced(tuftGeometry(), swayMat, tufts, false)).name = "grass";
  add(instanced(flowerGeometry(), swayMat, flowers, false)).name = "flowers";

  // --- reeds (east) and cattails ---
  const reeds: Inst[] = [];
  const cattails: Inst[] = [];
  for (let i = 0; i < (full ? 260 : 130); i++) {
    const th = EAST + (R() - 0.5) * 1.5;
    const d = -1.5 + R() * 2.3;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const it = { x, y: heightAt(x, z), z, s: 0.75 + R() * 0.6, ry: R() * 6, tint: tint(0.85, 1.1) };
    if (R() < 0.35) cattails.push(it);
    else reeds.push(it);
  }
  // A few clumps round the rest of the shore (not in front of the dock).
  for (let i = 0; i < 70; i++) {
    const th = R() * Math.PI * 2;
    if (angleGap(th, SOUTH) < 0.4 || angleGap(th, NORTH) < 0.25) continue;
    const d = -0.6 + R() * 0.9;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    reeds.push({ x, y: heightAt(x, z), z, s: 0.55 + R() * 0.4, ry: R() * 6, tint: tint(0.85, 1.1) });
  }
  add(instanced(reedGeometry(false), swayMat, reeds, true)).name = "reeds";
  add(instanced(reedGeometry(true), swayMat, cattails, true)).name = "cattails";

  // --- lily pads + water lilies (west) ---
  const pads: Inst[] = [];
  const lilies: Inst[] = [];
  for (let i = 0; i < 400 && pads.length < (full ? 95 : 55); i++) {
    const th = WEST + (R() - 0.5) * 1.4;
    const d = -0.5 - Math.pow(R(), 0.8) * 6.5;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (vnoise(x * 0.35, z * 0.35, 12) < 0.35) continue;
    if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < 0.75 * Math.max(p.s, 1))) continue;
    const s = 0.65 + R() * 0.75;
    pads.push({ x, y: 0.025, z, s, ry: R() * 6, tint: tint(0.85, 1.1) });
    if (R() < 0.3) lilies.push({ x: x + 0.1, y: 0.03, z: z - 0.05, s: 0.9 + R() * 0.6, ry: R() * 6 });
  }
  // A few pads elsewhere along calm edges.
  for (let i = 0; i < 24; i++) {
    const th = R() * Math.PI * 2;
    if (angleGap(th, SOUTH) < 0.45 || angleGap(th, NORTH) < 0.4) continue;
    const r = lakeRadius(th) - 0.6 - R() * 1.6;
    pads.push({ x: Math.cos(th) * r, y: 0.025, z: Math.sin(th) * r, s: 0.55 + R() * 0.4, ry: R() * 6 });
  }
  add(instanced(padGeometry(), matDouble, pads, false)).name = "pads";
  add(instanced(lilyGeometry(), mat, lilies, false)).name = "lilies";

  // --- glowing mushrooms along the shore and round the giants (matte, rims glow) ---
  // Round 09-B: about a third of the old count, none in the camera's foreground (painted glow-caps there).
  const shrooms: Inst[] = [];
  const shroomCols = [new Color(0.5, 1.6, 2.2), new Color(0.9, 0.8, 2.4), new Color(0.4, 2.0, 1.8), new Color(1.6, 0.9, 2.2)].map(matteTint);
  for (let i = 0; i < (full ? 40 : 24); i++) {
    const th = R() * Math.PI * 2;
    if (angleGap(th, SOUTH) < 1.0) continue;
    const d = 0.4 + Math.pow(R(), 1.5) * 9;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (vnoise(x * 0.3, z * 0.3, 55) < 0.45) continue;
    shrooms.push({ x, y: heightAt(x, z) - 0.02, z, s: 0.9 + R() * 1.2, ry: R() * 6, tint: shroomCols[Math.floor(R() * shroomCols.length)]! });
  }
  for (const list of giants) for (const gt of list) for (let k = 0; k < 2; k++) {
    const a = R() * 6.28;
    const rr = 3 + R() * 4;
    const x = gt.x + Math.cos(a) * rr;
    const z = gt.z + Math.sin(a) * rr;
    shrooms.push({ x, y: heightAt(x, z) - 0.02, z, s: 1.6 + R() * 1.6, ry: R() * 6, tint: shroomCols[Math.floor(R() * shroomCols.length)]! });
  }
  // The near grass (the camera's foreground): clumps of painted plants over the painted grass cards
  // (ferns mostly, some bluebells and glow-caps, foxgloves off to the sides). Round 09: denser than
  // 09-B's (its lawn read bare), still one calm matte family of plants, no glossy props.
  const plants: Record<PlantKind, Inst[]> = { ...plantLists(), foxglove: foxgloves, grass: grassCards };
  const capCols = shroomCols;
  // Round 16: the shore and giants' glowing mushrooms are matte painted glow-cap cards (the 3D toadstools
  // read as smooth glossy domes on the TV).
  for (const m of shrooms) plants.glowcap.push({ ...m, s: m.s * 0.6, tint: new Color(1, 1, 1).lerp(m.tint ?? new Color(1, 1, 1), 0.55) });
  const plantTint = (k: PlantKind) => (k === "glowcap" ? new Color(1, 1, 1).lerp(capCols[Math.floor(R() * capCols.length)]!, 0.55) : new Color(1, 1, 1).multiplyScalar(0.82 + R() * 0.25));
  let clumps = 0;
  for (let i = 0; i < 900 && clumps < (full ? 72 : 30); i++) {
    const th = SOUTH + (R() - 0.5) * 3.4;
    const edge = lakeRadius(th);
    const d = 1.5 + R() * 21;
    const r = edge + d;
    const cx = Math.cos(th) * r;
    const cz = Math.sin(th) * r;
    if (Math.abs(d - PATH_D) < 1.6) continue;
    if (Math.abs(cx) <= DOCK.halfWidth + 1.5 && cz > DOCK.tipZ && cz < DOCK.rootZ + 2.5) continue;
    if (Math.hypot(cx - CAMPFIRE.x, cz - CAMPFIRE.z) < 4.2) continue;
    if (vnoise(cx * 0.22, cz * 0.22, 63) < 0.4) continue;
    const side = angleGap(th, SOUTH) > 0.55;
    const roll = R();
    const main: PlantKind = roll < 0.5 ? "fern" : roll < 0.72 ? "bluebell" : roll < 0.9 || !side ? "glowcap" : "foxglove";
    const n = main === "fern" ? 2 + Math.floor(R() * 3) : 3 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28;
      const rr = (main === "fern" ? 0.7 : 0.45) * Math.sqrt(R()) * (1 + n * 0.25);
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const kind: PlantKind = k > 0 && R() < 0.25 ? (main === "fern" ? "bluebell" : "fern") : main;
      const s = kind === "fern" ? 0.85 + R() * 0.5 : 0.8 + R() * 0.5;
      plants[kind].push({ x, y: heightAt(x, z) - 0.03, z, s, ry: R() * 6, tint: plantTint(kind) });
    }
    clumps++;
  }
  for (const m of plantMeshes(plants, plantMat)) add(m);

  // --- little amber lanterns along the path (warm accents) ---
  const lamps: Inst[] = [];
  for (let i = 0; i < 16; i++) {
    const th = (i / 16) * Math.PI * 2 + 0.2;
    // Not on the near shore either: a post there stands between the camera and the family.
    if (angleGap(th, NORTH) < 0.3 || angleGap(th, SOUTH) < 0.55) continue;
    const r = lakeRadius(th) + PATH_D + 1.0;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    lamps.push({ x, y: heightAt(x, z) - 0.05, z, s: 1, ry: R() * 6 });
  }
  const lampPost = prep(new CylinderGeometry(0.05, 0.07, 1.3, 6).translate(0, 0.65, 0));
  paint(lampPost, 0x3a2c38, 0x5a4652);
  surf(lampPost, PK.grain);
  const lampHook = prep(new BoxGeometry(0.32, 0.04, 0.04).translate(0.14, 1.28, 0));
  paint(lampHook, 0x3a2c38);
  surf(lampHook, PK.grain, 1);
  const lampCap = prep(new ConeGeometry(0.13, 0.12, 6).translate(0.28, 1.2, 0));
  paint(lampCap, 0x2a2228);
  // Lamp posts dissolve like the trees when they stand between the camera and a fisher.
  add(instanced(merge([lampPost, lampHook, lampCap]), treeMat, lamps, true)).name = "lamp-posts";
  // The glass dissolves with its post (round 10: it floated on where the post had gone).
  const lampGlassMat = fadeGlowMaterial({ vertexColors: false });
  disposables.push(lampGlassMat);
  const lampGlass = new SphereGeometry(0.1, 8, 6).scale(1, 1.3, 1).translate(0.28, 1.05, 0);
  add(instanced(lampGlass, lampGlassMat, lamps.map((l) => ({ ...l, tint: new Color(1, 0.7, 0.35) })), false)).name = "lamp-glass";
  const pools: Inst[] = lamps.map((l) => ({ x: l.x + Math.cos(l.ry) * 0.28, y: l.y, z: l.z - Math.sin(l.ry) * 0.28, s: 3.4, ry: l.ry }));

  // --- the dock ---
  const deckY = 0.42;
  const dockParts: BufferGeometry[] = [];
  const plankCols = [0xa0714a, 0x8f6440, 0xb07e52, 0x9a6c46];
  for (let z = DOCK.tipZ; z < DOCK.rootZ + 0.1; z += 0.44) {
    const g = new BoxGeometry(DOCK.halfWidth * 2 + 0.2, 0.12, 0.4);
    g.rotateY((R() - 0.5) * 0.03);
    g.translate((R() - 0.5) * 0.08, deckY - 0.06 + (R() - 0.5) * 0.02, z + 0.2);
    const p = prep(g);
    const pc = plankCols[Math.floor(R() * plankCols.length)]!;
    paint(p, pc, new Color(pc).lerp(new Color(0xffe8c8), 0.3), (pp, n, c) => {
      c.multiplyScalar(0.92 + 0.12 * vnoise(pp.x * 8, pp.z * 2, 3));
      if (n.y < 0.5) c.multiplyScalar(0.65);
    });
    dockParts.push(surf(p, PK.planks));
  }
  for (const sx of [-0.85, 0.85]) {
    const g = prep(new BoxGeometry(0.2, 0.22, DOCK.rootZ - DOCK.tipZ + 0.5).translate(sx, deckY - 0.22, (DOCK.rootZ + DOCK.tipZ) / 2));
    paint(g, 0x5a3e28);
    dockParts.push(surf(g, PK.planks));
  }
  const posts: [number, number][] = [];
  for (let z = DOCK.tipZ + 0.15; z < DOCK.rootZ; z += 2.1) for (const sx of [-1, 1]) posts.push([sx * (DOCK.halfWidth + 0.08), z]);
  for (const [px, pz] of posts) {
    const g = prep(new CylinderGeometry(0.15, 0.17, 2.4, 8).translate(px, deckY + 0.55 - 1.2, pz));
    paint(g, 0x4a3220, 0x7a5636);
    dockParts.push(surf(g, PK.grain));
    const cap = prep(new CylinderGeometry(0.16, 0.15, 0.06, 8).translate(px, deckY + 0.58, pz));
    paint(cap, 0x8a6642);
    dockParts.push(surf(cap, PK.grain));
    const rope = prep(new TorusGeometry(0.17, 0.035, 5, 12).rotateX(Math.PI / 2).translate(px, deckY + 0.42, pz));
    paint(rope, 0xd8b878);
    dockParts.push(surf(rope, PK.cloth));
  }
  // Ropes sagging between posts along each side.
  for (const sx of [-1, 1]) {
    const side = posts.filter(([px]) => Math.sign(px) === sx);
    for (let i = 0; i < side.length - 1; i++) {
      const [ax, az] = side[i]!;
      const [, bz] = side[i + 1]!;
      const curve = new CatmullRomCurve3([
        new Vector3(ax, deckY + 0.42, az),
        new Vector3(ax, deckY + 0.22, (az + bz) / 2),
        new Vector3(ax, deckY + 0.42, bz),
      ]);
      const t = prep(new TubeGeometry(curve, 10, 0.03, 4, false));
      paint(t, 0xd2b070);
      dockParts.push(surf(t, PK.cloth));
    }
  }
  // Lantern post at the tip.
  const lx = DOCK.halfWidth + 0.08;
  const lz = DOCK.tipZ + 0.15;
  const lpost = prep(new CylinderGeometry(0.09, 0.11, 1.5, 7).translate(lx, deckY + 1.2, lz));
  paint(lpost, 0x4a3220, 0x6a4a30);
  surf(lpost, PK.grain);
  const arm = prep(new BoxGeometry(0.6, 0.07, 0.07).translate(lx - 0.28, deckY + 1.9, lz));
  paint(arm, 0x4a3220);
  surf(arm, PK.grain, 1);
  const lanternFrame = prep(new BoxGeometry(0.3, 0.36, 0.3).translate(lx - 0.5, deckY + 1.62, lz));
  paint(lanternFrame, 0x2a2420);
  const lanternTop = prep(new ConeGeometry(0.24, 0.18, 4).rotateY(Math.PI / 4).translate(lx - 0.5, deckY + 1.89, lz));
  paint(lanternTop, 0x2a2420);
  // The lantern post dissolves between the camera and a fisher (like the path lamps).
  add(new Mesh(merge([lpost, arm, lanternFrame, lanternTop]), treeMat)).name = "dock-lantern";
  // Crates and a bucket on the deck.
  const crate = prep(new BoxGeometry(0.55, 0.45, 0.55).translate(-0.6, deckY + 0.22, DOCK.rootZ - 1.6));
  paint(crate, 0x8a5a32, 0xb07a48);
  surf(crate, PK.planks);
  const bucket = prep(new CylinderGeometry(0.2, 0.16, 0.3, 10).translate(-0.75, deckY + 0.15, DOCK.rootZ - 2.5));
  paint(bucket, 0x8a96a0, 0xb8c4cc);
  surf(bucket, PK.grain);
  dockParts.push(crate, bucket);
  const dock = add(new Mesh(merge(dockParts), mat));
  dock.name = "dock";
  dock.castShadow = true;
  dock.receiveShadow = true;
  const glassMat = fadeGlowMaterial({ vertexColors: false, color: 0x9af0ff });
  disposables.push(glassMat);
  const glass = add(new Mesh(new BoxGeometry(0.22, 0.28, 0.22), glassMat));
  glass.position.set(lx - 0.5, deckY + 1.62, lz);
  const lanternLight = new PointLight(0x8ae8ff, 0, 14, 1.6);
  lanternLight.position.set(lx - 0.5, deckY + 1.5, lz);
  group.add(lanternLight);

  // --- rowboat moored on the east side ---
  const boatParts: BufferGeometry[] = [];
  const hull = prep(new SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.75, 0.42, 1.85));
  paint(hull, 0x2f6f84, 0x3f93a4, (_p, n, c) => {
    if (n.y > 0.2) c.setHex(0xa77a4c);
  });
  surf(hull, PK.planks);
  const rim = prep(new TorusGeometry(1, 0.06, 5, 24).rotateX(Math.PI / 2).scale(0.75, 1, 1.85));
  paint(rim, 0xe8dcc0);
  const bench1 = prep(new BoxGeometry(1.35, 0.06, 0.28).translate(0, -0.08, 0.45));
  const bench2 = prep(new BoxGeometry(1.2, 0.06, 0.28).translate(0, -0.08, -0.65));
  paint(bench1, 0x9a6a40);
  paint(bench2, 0x9a6a40);
  surf(bench1, PK.planks);
  surf(bench2, PK.planks);
  const oar = prep(new CylinderGeometry(0.03, 0.03, 2.0, 5).rotateZ(1.35).rotateY(0.25).translate(0.2, 0.0, 0.0));
  paint(oar, 0xc49a62);
  surf(oar, PK.grain, 1);
  boatParts.push(hull, rim, bench1, bench2, oar);
  const boatInner = merge(boatParts);
  const boat = add(new Mesh(boatInner, matDouble));
  boat.name = "boat";
  // Riding high enough that its painted planks show above the water line.
  boat.position.set(DOCK.halfWidth + 1.35, 0.3, (DOCK.rootZ + DOCK.tipZ) / 2 - 0.5);
  boat.rotation.y = 0.08;
  boat.castShadow = true;

  // --- cottages on the east-north-east hill + two behind the falls ---
  // Round 09: the hamlet moved from the east-south-east (it stood between the boarding camera and the
  // zeppelin tower at (24.5, 4.5), its roofs filling the bottom of the tower shot) to behind the tower.
  const winParts: BufferGeometry[] = [];
  const bodyParts: BufferGeometry[] = [];
  const spots: [number, number, number, number][] = [
    [38, -6, 0, 1.1], [44, -12, 1, 1.0], [36, -15, 2, 1.0], [45, -2, 3, 1.0],
    // The far shore: big and close, framing the falls.
    [Math.cos(-2.62) * 37, Math.sin(-2.62) * 37, 4, 1.45], [Math.cos(-0.82) * 36, Math.sin(-0.82) * 36, 5, 1.45],
    [-5, -41, 6, 1.2], [12, -40, 7, 1.2],
  ];
  for (const [x, z, s, k] of spots) {
    const { body, windows } = cottageGeometry(s + 10);
    const face = Math.atan2(-x, -z); // front (+z local) toward the lake
    const y = heightAt(x, z) - 0.15;
    for (const g of [body, windows]) {
      g.scale(k, k, k);
      g.rotateY(face);
      g.translate(x, y, z);
    }
    bodyParts.push(body);
    winParts.push(windows);
    // Lamplight spilling from the windows onto the ground in front.
    const fx0 = x + Math.sin(face) * 3.2 * k;
    const fz0 = z + Math.cos(face) * 3.2 * k;
    pools.push({ x: fx0, y: heightAt(fx0, fz0), z: fz0, s: 4.2 * k, ry: face });
  }
  pools.push({ x: lx - 0.5, y: deckY - 0.12, z: lz, s: 3.2, ry: 0 });
  add(poolMesh(pools));
  // Pools of moonlight on the open lawn round the lake (round 12, night only).
  {
    const moon: Inst[] = [];
    for (const th of [-2.5, -1.15, -0.35, 0.95, 2.15, 2.7]) {
      const r = lakeRadius(th) + 3.5 + ((th * 7.3) % 1 + 1) % 1 * 3;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      moon.push({ x, y: heightAt(x, z), z, s: 3.2, ry: th * 3 });
    }
    const mp = moonPoolMesh(moon);
    if (mp) add(mp);
  }
  const village = add(new Mesh(merge(bodyParts), mat));
  village.name = "village";
  village.castShadow = true;
  village.receiveShadow = true;
  const windowMat = new MeshBasicMaterial({ vertexColors: true, color: 0xffd090 });
  disposables.push(windowMat);
  add(new Mesh(merge(winParts), windowMat)).name = "windows";

  // --- campfire: logs to sit on, fire, string lights ---
  const campParts: BufferGeometry[] = [];
  const campSeats: { x: number; z: number; facing: number }[] = [];
  // A horseshoe open in the middle (round 13: Mom sat straight behind the fire, so its flames, drawn over
  // her, read as her being see-through; seats were 2.3 m out, inside the flames' reach). The campfire camera
  // looks from the north (yaw pi + 0.1), so the far side is at angle FAR; nobody sits within 0.6 rad of it.
  // The inner pair comes first, so two fishers sit either side of the fire, not both on one side.
  const FAR = Math.atan2(Math.cos(Math.PI + 0.1), Math.sin(Math.PI + 0.1)) + Math.PI;
  const SEAT_R = 2.9;
  const seatAngles = [FAR - 0.62, FAR + 0.62, FAR - 1.4, FAR + 1.4];
  for (const a of seatAngles) {
    const sx = CAMPFIRE.x + Math.cos(a) * SEAT_R;
    const sz = CAMPFIRE.z + Math.sin(a) * SEAT_R;
    campSeats.push({ x: sx, z: sz, facing: Math.atan2(CAMPFIRE.z - sz, CAMPFIRE.x - sx) });
  }
  // A log behind each side's pair.
  for (const side of [-1, 1]) {
    const a = FAR + side * 1.01;
    const lx2 = CAMPFIRE.x + Math.cos(a) * (SEAT_R + 0.15);
    const lz2 = CAMPFIRE.z + Math.sin(a) * (SEAT_R + 0.15);
    const log = prep(new CylinderGeometry(0.22, 0.24, 2.4, 9).rotateZ(Math.PI / 2).rotateY(-a + Math.PI / 2).translate(lx2, heightAt(lx2, lz2) + 0.18, lz2));
    // Round 18: the painted rod wood's swirling grain, darker, with pale cut ends (a smooth orange
    // cylinder read as plastic by the fire).
    paint(log, 0x4a3020, 0x6a4a2c, (_p, n, c) => {
      // The log runs along (sin a, 0, -cos a): faces along it are the cut ends.
      if (Math.abs(Math.sin(a) * n.x - Math.cos(a) * n.z) > 0.8) c.setHex(0xb08a5a);
    });
    surf(log, PK.rodwood, 1);
    campParts.push(log);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const g = prep(new CylinderGeometry(0.07, 0.09, 0.9, 6).rotateZ(1.1).rotateY(a).translate(CAMPFIRE.x, heightAt(CAMPFIRE.x, CAMPFIRE.z) + 0.22, CAMPFIRE.z));
    paint(g, 0x3a2416, 0x6a4628);
    campParts.push(surf(g, PK.grain));
  }
  // String-light poles (they dissolve like the trees in front of a fisher).
  const poleParts: BufferGeometry[] = [];
  const poleA = new Vector3(CAMPFIRE.x - 3.4, 0, CAMPFIRE.z - 1.6);
  const poleB = new Vector3(CAMPFIRE.x + 3.4, 0, CAMPFIRE.z - 1.2);
  for (const p of [poleA, poleB]) {
    p.y = heightAt(p.x, p.z);
    // Tall enough that the string of lights hangs above the family's heads in the campfire shot.
    const g = prep(new CylinderGeometry(0.07, 0.09, 3.9, 6).translate(p.x, p.y + 1.95, p.z));
    paint(g, 0x5a3e28);
    poleParts.push(surf(g, PK.grain));
  }
  add(new Mesh(merge(campParts), mat)).castShadow = true;
  add(new Mesh(merge(poleParts), treeMat)).castShadow = true;
  const bulbN = 15;
  const bulbGeo = new SphereGeometry(0.075, 8, 6);
  const bulbMat = new MeshBasicMaterial({ color: 0xffffff });
  disposables.push(bulbMat);
  const bulbs = new InstancedMesh(bulbGeo, bulbMat, bulbN);
  const bulbCols = [0xffd27a, 0xff9a6a, 0xfff0a0, 0x9ad8ff, 0xffa8d0].map((h) => new Color(h));
  for (let i = 0; i < bulbN; i++) {
    const t = (i + 0.5) / bulbN;
    dummy.position.set(
      poleA.x + (poleB.x - poleA.x) * t,
      poleA.y + 3.8 + (poleB.y - poleA.y) * t - Math.sin(t * Math.PI) * 0.55,
      poleA.z + (poleB.z - poleA.z) * t,
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    bulbs.setColorAt(i, bulbCols[i % bulbCols.length]!);
  }
  add(bulbs).name = "bulbs";
  const wire = new CatmullRomCurve3(
    Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return new Vector3(poleA.x + (poleB.x - poleA.x) * t, poleA.y + 3.85 + (poleB.y - poleA.y) * t - Math.sin(t * Math.PI) * 0.55, poleA.z + (poleB.z - poleA.z) * t);
    }),
  );
  const wireGeo = prep(new TubeGeometry(wire, 24, 0.015, 3, false));
  paint(wireGeo, 0x2a2a2a);
  add(new Mesh(wireGeo, mat));

  // Flames and embers: painted flame cards licking and leaning, embers rising (one draw).
  const fy = heightAt(CAMPFIRE.x, CAMPFIRE.z) + 0.2;
  const flames = buildCampfireFx(CAMPFIRE.x, fy, CAMPFIRE.z);
  group.add(flames.mesh);
  disposables.push(flames);
  // The fire light reaches the faces round the circle and the ground (same light, warmer and further).
  const fireLight = new PointLight(0xff8a3a, 0, 16, 1.3);
  fireLight.position.set(CAMPFIRE.x, fy + 0.8, CAMPFIRE.z);
  group.add(fireLight);

  // A fallen log at the east shore.
  const fl = prep(new CylinderGeometry(0.3, 0.35, 3.2, 10).rotateZ(Math.PI / 2).rotateY(0.9));
  paint(fl, 0x5a3c24, 0x7a5434, (_p, n, c) => {
    if (n.y > 0.6) c.lerp(new Color(0x6f9a3c), 0.7);
  });
  surf(fl, PK.grain, 1);
  const fallen = add(new Mesh(fl, mat));
  const fth = EAST + 0.42;
  const fr = lakeRadius(fth) + 0.1;
  fallen.position.set(Math.cos(fth) * fr, 0.08, Math.sin(fth) * fr);
  fallen.castShadow = true;

  const winCol = windowMat.color;
  // Warm lamp-lit windows (the reference's cottages glow amber against the violet dusk).
  const day = new Color(1.0, 0.82, 0.55);
  const night = new Color(2.8, 1.9, 0.95);
  return {
    group,
    lanternLight,
    fireLight,
    campSeats,
    update(tod, time, campfire) {
      winCol.copy(day).lerp(night, tod.glow);
      updatePools(tod);
      lampGlassMat.color.setScalar(0.9 + 2.2 * tod.glow);
      plantMat.emissive.setScalar(0.3 + 1.9 * tod.glow);
      const g = tod.glow;
      glassMat.color.setRGB(0.5 + 0.8 * g, 1.1 + 1.6 * g, 1.3 + 1.8 * g);
      lanternLight.intensity = 1 + 5 * g;
      bulbMat.color.setScalar(0.75 + 1.9 * Math.max(g, campfire));
      const fire = 0.55 + 0.45 * Math.max(g, campfire);
      const fl1 = 0.85 + 0.15 * Math.sin(time * 13.0) * Math.sin(time * 7.3 + 1.0);
      // Round 10: the night exposure rose 1.32 -> 1.7, so the fire's light is scaled to keep faces warm, not orange.
      fireLight.intensity = (2 + 8 * Math.max(g, campfire) + 5 * campfire) * fl1;
      flames.update(time, fire * (1 + 0.3 * campfire));
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

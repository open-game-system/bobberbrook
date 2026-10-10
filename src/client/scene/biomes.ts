import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type Group,
  type Material,
} from "three";
import { pondRadius, type Area, type PondPlace } from "../../game/world";
import { crystalShard, instanced, giantGeometry, rockGeometry, type Inst } from "./kit";
import { jitter, merge, paint, prep, puffNormals, surf } from "./geo";
import { PK } from "./painter";
import { attachFoliage, coniferCards, leafCards, type Puff, type Tier } from "./foliage";
import { barked } from "./surfaces";
import { rng, vnoise } from "./noise";
import { heightAt } from "./terrain";
import { clearOfTrails } from "./valley";
import { activeWorld, platformsAround } from "./worldQuery";

/**
 * The four new biomes' set-pieces (no concept art: from the brief, in Ashenvale's twilight family) and
 * the landmarks that make each generated place memorable: one per place, chosen by its seed (a giant
 * ancient tree, a moon-gate stone arch, a little lantern shrine or a crystal spire), set on the far
 * shore where the group camera looks.
 */

export type KitCtx = { a: PondPlace; seed: number; wood: BufferGeometry[]; glow: BufferGeometry[]; /** Crystal shards (painted crystal glow, round 12). */ crystal: BufferGeometry[]; lamps: BufferGeometry[]; lampGlow: BufferGeometry[]; full: boolean; group: Group; painted: Material; tree: Material };

const at = (a: PondPlace, theta: number, d: number) => {
  const r = pondRadius(a, theta) + d;
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
};
const atR = (a: PondPlace, theta: number, r: number) => ({ x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r });

function put(g: BufferGeometry, x: number, z: number, ry: number, s = 1, dy = 0): BufferGeometry {
  g.scale(s, s, s);
  g.rotateY(ry);
  g.translate(x, heightAt(x, z) + dy, z);
  return g;
}

/**
 * Where a place's landmark stands, by its seed: straight across the water, off on the east or west
 * flank, or (giant trees and shrines) on an islet out in the pond. Clear of trails, docks and towers.
 */
function landmarkSpot(c: KitCtx, R: () => number, out: number, island: boolean): { x: number; z: number; th: number; island: boolean } {
  const side = R();
  const base = -Math.PI / 2 + (side < 0.4 ? 0 : side < 0.7 ? -1.05 : 1.05);
  if (island && R() < 0.4) {
    const th = base + (R() - 0.5) * 0.6;
    const p = at(c.a, th, -Math.min(5.5, c.a.pond.r * 0.36));
    const islet = paint(prep(new SphereGeometry(4.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.26, 1)), 0x4a5a5a, 0x5a8a6a, (pp, _n, cc) => cc.multiplyScalar(0.85 + 0.25 * vnoise(pp.x, pp.z, 3)));
    c.wood.push(put(islet, p.x, p.z, 0, 1, -heightAt(p.x, p.z) - 0.25));
    return { ...p, th, island: true };
  }
  const f = farSpot(c, R, out, base);
  return { ...f, island: false };
}

/** A free spot round `base` (default: the far, north side): clear of trails, docks and towers. */
function farSpot(c: KitCtx, R: () => number, out: number, base = -Math.PI / 2): { x: number; z: number; th: number } {
  const a = c.a;
  const plats = platformsAround(a.center.x, a.center.z).filter((p) => p.place === a.id);
  const place = activeWorld().placeById(a.id);
  const tower = place && plats.some((p) => p.kind === "zeppelin") ? activeWorld().towerAt(place) : null;
  let best = at(a, base, out);
  let th = base;
  for (let i = 0; i < 12; i++) {
    const t = base + (R() - 0.5) * (i < 6 ? 1.0 : 2.2);
    const p = at(a, t, out);
    if (!clearOfTrails(p.x, p.z, 4)) continue;
    if (plats.some((q) => Math.hypot(q.at.x - p.x, q.at.z - p.z) < 10)) continue;
    if (tower && Math.hypot(tower.x - p.x, tower.z - p.z) < 12) continue;
    best = p;
    th = t;
    break;
  }
  return { ...best, th };
}

// ---------- trees for the new biomes (pale canopies take the place's tint) ----------

/** An oak with a pale canopy: the place's sub-palette tints it (amber in ember woods, frost-blue, prism-violet). */
export function paleOakGeometry(seed: number): BufferGeometry {
  // Round 09-B: the ember woods read blocky (five even lumps, a bright core showing through). Now a
  // looser crown of seven uneven puffs at different heights, a dark core and denser leaf cards.
  const r = rng(seed);
  const trunk = prep(new CylinderGeometry(0.24, 0.5, 3.6, 8).translate(0, 1.8, 0));
  paint(trunk, 0x3a2c30, 0x6a5458);
  const limbs: BufferGeometry[] = [];
  const blobs: BufferGeometry[] = [];
  const puffs: Puff[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.8;
    const rr = i === 0 ? 0 : 1.2 + r() * 0.7;
    const rad = i === 0 ? 1.9 : 1.05 + r() * 0.5;
    const py = i === 0 ? 4.9 : 3.7 + r() * 1.4;
    const sy = 0.75 + r() * 0.2;
    const g = new SphereGeometry(rad * 0.8, 10, 8);
    g.scale(1, sy, 1);
    jitter(g, 0.2, seed + i);
    g.computeVertexNormals();
    g.translate(Math.cos(a) * rr, py, Math.sin(a) * rr);
    blobs.push(prep(g));
    puffs.push([Math.cos(a) * rr, py, Math.sin(a) * rr, rad, sy]);
    if (i > 0) {
      // A limb out to the puff (bark), so the crown hangs from branches, not a ball on a stick.
      const len = Math.hypot(rr, py - 3.0);
      const limb = new CylinderGeometry(0.07, 0.14, len, 5).translate(0, len / 2, 0);
      limb.rotateZ(-Math.atan2(rr, py - 3.0));
      limb.rotateY(-a);
      limb.translate(0, 3.0, 0);
      limbs.push(paint(prep(limb), 0x3a2c30, 0x5a4448));
    }
  }
  const canopy = merge(blobs);
  puffNormals(canopy, 0, 4.4, 0, 0.8);
  paint(canopy, 0x8a8090, 0xf4f0f8, (p, n, c) => {
    c.multiplyScalar((0.85 + 0.25 * vnoise(p.x * 2, p.z * 2 + p.y, 4)) * 0.38);
    if (n.y > 0.5) c.lerp(new Color(0xffffff).multiplyScalar(0.45), (n.y - 0.5) * 0.3);
  });
  const cards = leafCards(puffs, { cx: 0, cy: 4.4, cz: 0, size: 1.05, density: 3.0, inner: 0x6a6070, outer: 0xf4f0f8, top: 0xffffff, seed: seed * 5 + 2 });
  return attachFoliage(barked([trunk, ...limbs], [canopy]), cards, "violet");
}

/**
 * A pine heavy with snow (round 12): a dark core and tiers of painted snow-laden needle-spray boughs
 * (pine-snow), like the plain pines; the old snow-capped cones stay as its far stand-in.
 */
export function snowPineGeometry(): BufferGeometry {
  const trunk = prep(new CylinderGeometry(0.12, 0.32, 4.6, 7).translate(0, 2.3, 0));
  paint(trunk, 0x3a2c38, 0x5a4652);
  const tiers: Tier[] = [
    { y: 1.1, r: 1.95, h: 1.3 }, { y: 1.95, r: 1.66, h: 1.2 }, { y: 2.75, r: 1.36, h: 1.1 }, { y: 3.45, r: 1.04, h: 0.95 }, { y: 4.1, r: 0.72, h: 0.85 },
  ];
  const cones = tiers.map(({ y, r, h }, i) => {
    const g = new ConeGeometry(r * 0.62, h * 1.25, 9, 1);
    jitter(g, 0.06, i * 3.3 + 1);
    g.computeVertexNormals();
    g.translate(0, y + h * 0.62, 0);
    const p = prep(g);
    puffNormals(p, 0, y + h * 0.3, 0, 0.55);
    paint(p, 0x142c3c, 0x3a5a6c);
    return p;
  });
  // Lighter card colours than the green pine: the snow on the sheet stays white, the needles read dark under it.
  const cards = coniferCards(tiers, { inner: 0x3a5468, outer: 0x9ab4c8, top: 0xd8e6f4, seed: 317 });
  return attachFoliage(barked([trunk], cones), cards, "needleSnow");
}

/** The far stand-in for the snowy pine: snow-capped cones. */
export function snowPineLo(): BufferGeometry {
  const trunk = prep(new CylinderGeometry(0.16, 0.3, 1.6, 7).translate(0, 0.8, 0));
  paint(trunk, 0x3a2c38, 0x5a4652);
  const layers: [number, number, number][] = [[1.3, 1.8, 2.3], [2.35, 1.42, 2.0], [3.3, 1.06, 1.75], [4.15, 0.68, 1.4]];
  const cones = layers.map(([y, r, h], i) => {
    const g = new ConeGeometry(r, h, 10, 2);
    jitter(g, 0.08, i * 3.3 + 1);
    g.computeVertexNormals();
    g.translate(0, y + h / 2, 0);
    const p = prep(g);
    puffNormals(p, 0, y + h * 0.2, 0, 0.55);
    paint(p, 0x163a4a, 0x2f5e70, (pp, _n, c) => {
      // Snow sits on the upper part of each tier.
      const k = (pp.y - y) / h;
      if (k > 0.35 + 0.15 * vnoise(pp.x * 4, pp.z * 4, 2)) c.setHex(0xf0f6ff).multiplyScalar(0.92 + 0.08 * vnoise(pp.x * 6, pp.z * 6, 3));
    });
    return p;
  });
  return merge([trunk, ...cones]);
}

// ---------- the biome kits ----------

/** Weeping willows round the shore, hanging lanterns, a ring of pale stepping stones. */
export function willowKit(c: KitCtx, willowGeo: () => BufferGeometry): void {
  const { a } = c;
  const R = rng(301 + c.seed);
  const trees: Inst[] = [];
  const n = 4 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const th = -Math.PI / 2 + (i / (n - 1) - 0.5) * 3.6 + (R() - 0.5) * 0.3;
    if (Math.sin(th) > 0.45) continue;
    const p = atR(a, th, a.pond.r + a.clearing + 1.5 + R() * 2.5);
    if (!clearOfTrails(p.x, p.z, 2)) continue;
    trees.push({ x: p.x, y: heightAt(p.x, p.z) - 0.3, z: p.z, s: 0.9 + R() * 0.4, ry: R() * 6 });
  }
  const m = instanced(willowGeo(), c.tree, trees, c.full);
  m.name = "willow-kit";
  c.group.add(m);
  // Pearly stepping stones curving out into the water.
  const th0 = -Math.PI / 2 + (R() - 0.5) * 1.6;
  for (let i = 0; i < 6; i++) {
    const p = at(c.a, th0 + i * 0.12, -0.8 - i * 0.7);
    c.wood.push(put(paint(prep(new CylinderGeometry(0.55, 0.65, 0.4, 9)), 0xd8d0e8, 0xf4f0ff), p.x, p.z, 0, 0.9 + R() * 0.3, -heightAt(p.x, p.z) + 0.02));
  }
  // Lanterns hung from shepherd's crooks along the shore.
  for (let i = 0; i < 5; i++) {
    const th = R() * Math.PI * 2;
    if (Math.sin(th) > 0.5) continue;
    const p = at(a, th, 1.4);
    const crook = merge([
      paint(prep(new CylinderGeometry(0.05, 0.06, 2.2, 6).translate(0, 1.1, 0)), 0x3a2c38),
      paint(prep(new TorusGeometry(0.3, 0.04, 5, 10, Math.PI).translate(0.3, 2.2, 0)), 0x3a2c38),
    ]);
    c.lamps.push(put(crook, p.x, p.z, R() * 6));
    c.lampGlow.push(put(paint(prep(new SphereGeometry(0.16, 8, 6).translate(0.6, 1.85, 0)), 0xf0d8ff), p.x, p.z, 0));
  }
}

/** Clusters of pale glowing crystals on the shore and in the shallows. */
export function crystalKit(c: KitCtx): void {
  const { a } = c;
  const R = rng(401 + c.seed);
  const hues = [0xc0f0ff, 0xd8c8ff, 0xb8fff0, 0xffd8f8];
  for (let i = 0; i < 18; i++) {
    const th = R() * Math.PI * 2;
    const inWater = i < 6;
    const p = inWater ? at(a, th, -1.2 - R() * 2) : at(a, th, 0.4 + R() * (a.clearing - 2));
    if (!inWater && !clearOfTrails(p.x, p.z, 1)) continue;
    const cl: BufferGeometry[] = [];
    const k = 3 + Math.floor(R() * 5);
    const hue = hues[Math.floor(R() * hues.length)]!;
    for (let j = 0; j < k; j++) {
      const hh = 0.6 + R() * (inWater ? 1.2 : 2.2);
      const g = crystalShard(hh, 0.28 + R() * 0.1, R() * 6, new Color(hue).multiplyScalar(0.3).lerp(new Color(0x2e2c8a), 0.5), new Color(hue).multiplyScalar(0.72));
      cl.push(g.rotateZ((R() - 0.5) * 0.8).rotateX((R() - 0.5) * 0.8).translate((R() - 0.5) * 0.8, -hh * 0.12, (R() - 0.5) * 0.8));
    }
    c.crystal.push(put(merge(cl), p.x, p.z, R() * 6, 1, inWater ? -heightAt(p.x, p.z) - 0.2 : -0.05));
  }
  // Pale prism-lit rocks.
  const rocks: Inst[] = [];
  for (let i = 0; i < 10; i++) {
    const p = at(a, R() * Math.PI * 2, -0.4 + R());
    rocks.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, s: 0.5 + R() * 0.8, ry: R() * 6, tint: new Color(0.9, 0.95, 1.15) });
  }
  const rm = instanced(rockGeometry(41), c.painted, rocks, c.full);
  rm.name = "crystal-rocks";
  c.group.add(rm);
}

/** Warm lanterns on posts round the clearing and drifts of amber leaves. */
export function emberKit(c: KitCtx): void {
  const { a } = c;
  const R = rng(501 + c.seed);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + R() * 0.4;
    const p = atR(a, th, a.pond.r + a.clearing * (0.55 + R() * 0.3));
    if (!clearOfTrails(p.x, p.z, 1)) continue;
    // Not on the camera's side of the pond (round 08: posts stood between the camera and the family).
    if (Math.sin(th) > 0.1) continue;
    const h = 2.2 + R() * 0.6;
    const post = merge([
      paint(prep(new CylinderGeometry(0.08, 0.11, h, 7).translate(0, h / 2, 0)), 0x4a3220, 0x6a4a30),
      paint(prep(new BoxGeometry(0.5, 0.07, 0.07).translate(0.22, h - 0.05, 0)), 0x4a3220),
      paint(prep(new ConeGeometry(0.26, 0.22, 4).rotateY(Math.PI / 4).translate(0.42, h - 0.12, 0)), 0x2a2420),
    ]);
    c.lamps.push(put(post, p.x, p.z, R() * 6));
    c.lampGlow.push(put(paint(prep(new BoxGeometry(0.24, 0.3, 0.24).translate(0.42, h - 0.42, 0)), 0xffa040), p.x, p.z, 0));
  }
  // The leaf drifts are painted fallen-leaf cards now (areas.ts, the recipe's litter), not copper mounds.
}

/** Snowy rocks, an ice rim round the pond and frosted boulders. */
export function frostKit(c: KitCtx): void {
  const { a } = c;
  const R = rng(601 + c.seed);
  // A frozen rim: one sheet of ice hugging the shore, its inner edge ragged, snow banked on it.
  c.wood.push(surf(frozenRim(a, R), PK.snow));
  // Snowy banks: soft drifts piled along the shore and against the trees.
  for (let i = 0; i < 22; i++) {
    const th = (i / 22) * Math.PI * 2 + R() * 0.2;
    const p = at(a, th, 0.6 + R() * 2.2);
    if (!clearOfTrails(p.x, p.z, 0.5)) continue;
    const r = 1.2 + R() * 1.6;
    const g = new SphereGeometry(r, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.32, 0.9);
    jitter(g, 0.1 * r, i + 7);
    g.computeVertexNormals();
    c.wood.push(put(surf(paint(prep(g), 0xb8c8e4, 0xffffff, (pp, n, cc) => cc.multiplyScalar(0.84 + 0.16 * Math.max(0, n.y))), PK.snow), p.x, p.z, th + Math.PI / 2, 1, -0.12));
  }
  const rocks: Inst[] = [];
  for (let i = 0; i < 14; i++) {
    const p = at(a, R() * Math.PI * 2, 0.5 + R() * a.clearing);
    if (!clearOfTrails(p.x, p.z, 0.5)) continue;
    rocks.push({ x: p.x, y: heightAt(p.x, p.z) - 0.1, z: p.z, s: 0.5 + R() * 1.1, ry: R() * 6, tint: new Color(1.15, 1.2, 1.35) });
  }
  const rm = instanced(rockGeometry(71), c.painted, rocks, c.full);
  rm.name = "frost-rocks";
  c.group.add(rm);
  // Snow caps on the rocks (white domes).
  for (const r of rocks) c.wood.push(put(surf(paint(prep(new SphereGeometry(r.s * 0.95, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 0.85)), 0xe8f0ff, 0xffffff), PK.snow), r.x, r.z, r.ry, 1, r.s * 0.45 - 0.1));
  // Faint blue ice lights in the snow.
  for (let i = 0; i < 6; i++) {
    const p = at(a, R() * Math.PI * 2, 1 + R() * 4);
    c.glow.push(put(paint(prep(new OctahedronGeometry(0.22).scale(1, 1.6, 1)), 0xc8f0ff), p.x, p.z, R() * 6, 1, 0.3));
  }
}

/** The ice sheet round a frozen pond's edge: from 0.6 m up the bank to a ragged edge 1.5-3.5 m out. */
function frozenRim(a: PondPlace, R: () => number): BufferGeometry {
  const N = 96;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const seed = R() * 100;
  const cIn = new Color(0xa8d8f0);
  const cMid = new Color(0xd8f0ff);
  const cOut = new Color(0xf6fbff);
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = pondRadius(a, th);
    const inner = r - 1.5 - 2.0 * vnoise(th * 3 + seed, seed, 3) - 0.6 * vnoise(th * 11, seed + 1, 3);
    const ring: [number, Color][] = [[inner, cIn], [inner + 0.5, cMid], [r - 0.2, cMid], [r + 0.6, cOut]];
    for (const [rr, cc] of ring) {
      pos.push(a.center.x + Math.cos(th) * rr, 0.035 + (rr > r - 0.3 ? 0.08 : 0), a.center.z + Math.sin(th) * rr);
      col.push(cc.r, cc.g, cc.b);
    }
    if (i < N) for (let k = 0; k < 3; k++) {
      const p = i * 4 + k;
      idx.push(p, p + 4, p + 1, p + 1, p + 4, p + 5);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Faces up whatever the winding.
  const n = g.getAttribute("normal");
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return prep(g);
}

// ---------- landmarks ----------

export const LANDMARKS = ["giant", "arch", "shrine", "spire"] as const;
export type LandmarkKind = (typeof LANDMARKS)[number];

/** A huge ancient tree on the far shore, its roots spilling to the water. */
function giant(c: KitCtx, R: () => number): void {
  const p = landmarkSpot(c, R, c.a.clearing * 0.7, true);
  // Instanced (one instance) so its leaf cards and bark come along; it dissolves like every tree.
  const v = Math.floor(R() * 3);
  const ry = R() * 6;
  const s = (p.island ? 0.62 : 0.78) + R() * 0.14;
  const gm = instanced(giantGeometry(v), c.tree, [{ x: p.x, y: p.island ? 0.2 : heightAt(p.x, p.z) - 0.6, z: p.z, s, ry }], c.full);
  gm.name = "landmark-giant";
  c.group.add(gm);
  // Glowing motes caught in its roots.
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    c.glow.push(put(paint(prep(new SphereGeometry(0.12, 6, 5)), 0xd8f0ff), p.x + Math.cos(a) * 2.2, p.z + Math.sin(a) * 2.2, 0, 1, 0.3 + R()));
  }
}

/** A moon-gate: a round stone arch on the far shore, framing the forest beyond, with a soft rune ring. */
function arch(c: KitCtx, R: () => number): void {
  const p = landmarkSpot(c, R, 1.6, false);
  const face = Math.atan2(c.a.center.x - p.x, c.a.center.z - p.z);
  const ring = new TorusGeometry(2.6, 0.45, 8, 28, Math.PI * 1.16).rotateZ(-0.08 * Math.PI);
  jitter(ring, 0.06, 3);
  ring.computeVertexNormals();
  const stone = paint(prep(ring.translate(0, 0.6, 0)), 0x6a6488, 0xa8a4c4, (pp, n, cc) => {
    cc.multiplyScalar(0.85 + 0.25 * vnoise(pp.x * 2, pp.y * 2, 5));
    if (n.y > 0.6) cc.lerp(new Color(0x3e8a6a), 0.6);
  });
  const feet = [-2.5, 2.5].map((x) => paint(prep(new BoxGeometry(1.1, 1.2, 1.0).translate(x, 0.3, 0)), 0x5a5478, 0x7a7498));
  c.wood.push(put(surf(merge([stone, ...feet]), PK.runestone), p.x, p.z, face, 1.5));
  const runes: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const t = 0.15 * Math.PI + (i / 8) * 0.7 * Math.PI;
    runes.push(paint(prep(new OctahedronGeometry(0.11).translate(Math.cos(t) * 2.6, 0.6 + Math.sin(t) * 2.6, 0.48)), 0xc8e8ff));
  }
  c.glow.push(put(merge(runes), p.x, p.z, face, 1.5));
}

/** A little lantern shrine: a stone plinth under a swept roof, a glowing orb inside. */
function shrine(c: KitCtx, R: () => number): void {
  const p = landmarkSpot(c, R, 2.6, true);
  const dy = p.island ? -heightAt(p.x, p.z) + 0.1 : 0;
  const face = Math.atan2(c.a.center.x - p.x, c.a.center.z - p.z);
  const parts: BufferGeometry[] = [
    paint(prep(new CylinderGeometry(1.5, 1.7, 0.5, 8).translate(0, 0.25, 0)), 0x6a6488, 0x8a84a8),
    paint(prep(new CylinderGeometry(0.5, 0.6, 1.1, 8).translate(0, 1.05, 0)), 0x7a7498, 0x9a94b8),
  ];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) parts.push(paint(prep(new CylinderGeometry(0.1, 0.12, 2.6, 6).translate(x, 1.8, z)), 0x4a3220, 0x6a4a30));
  const roof = new ConeGeometry(2.1, 1.4, 8).translate(0, 3.7, 0);
  parts.push(paint(prep(roof), 0x3a2a7a, 0x8a6ad0));
  parts.push(paint(prep(new SphereGeometry(0.16, 8, 6).translate(0, 4.5, 0)), 0xe8b860));
  c.wood.push(put(merge(parts), p.x, p.z, face + Math.PI / 8, 1.6, dy));
  c.glow.push(put(paint(prep(new SphereGeometry(0.42, 12, 8).translate(0, 2.0, 0)), 0xfff0c8), p.x, p.z, 0, 1.6, dy));
}

/** A tall crystal spire rising from an islet, catching the light. */
function spire(c: KitCtx, R: () => number): void {
  const side = R();
  const th = -Math.PI / 2 + (side < 0.4 ? 0 : side < 0.7 ? -1.0 : 1.0) + (R() - 0.5) * 0.6;
  const p = at(c.a, th, -Math.min(4, c.a.pond.r * 0.35));
  const parts: BufferGeometry[] = [];
  const hue = [0xc8f0ff, 0xe0c8ff, 0xc8ffe8][Math.floor(R() * 3)]!;
  for (let i = 0; i < 9; i++) {
    const h = i === 0 ? 11 + R() * 3 : i === 1 ? 6 + R() * 2 : 1.5 + R() * 3;
    const g = crystalShard(h, i === 0 ? 0.7 : 0.42, R() * 6, new Color(hue).multiplyScalar(0.3).lerp(new Color(0x2e2c8a), 0.5), new Color(hue).multiplyScalar(0.72));
    parts.push(g.rotateZ(i === 0 ? 0 : (R() - 0.5) * 0.9).rotateX(i === 0 ? 0 : (R() - 0.5) * 0.9).translate(i === 0 ? 0 : (R() - 0.5) * 2, -h * 0.12, i === 0 ? 0 : (R() - 0.5) * 2));
  }
  c.crystal.push(put(merge(parts), p.x, p.z, R() * 6, 1, -heightAt(p.x, p.z) - 0.2));
  const islet = paint(prep(new SphereGeometry(2.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1)), 0x4a5a6a, 0x6a8a7a);
  c.wood.push(put(islet, p.x, p.z, 0, 1, -heightAt(p.x, p.z) - 0.25));
}

const LANDMARK_BUILD: Record<LandmarkKind, (c: KitCtx, R: () => number) => void> = { giant, arch, shrine, spire };

/** Which landmark a generated place gets: its biome leans the choice, its seed decides. */
export function landmarkFor(biome: string, pick: number): LandmarkKind {
  const lean: Record<string, LandmarkKind[]> = {
    marsh: ["shrine", "giant", "arch"],
    pools: ["arch", "shrine", "spire"],
    // marsh: the lantern shrine pavilion; willow/ember/hollow: a giant ancient tree; tarn/crystal/frost: a spire.
    hollow: ["giant", "shrine", "arch"],
    tarn: ["spire", "arch", "shrine"],
    willow: ["arch", "giant", "shrine"],
    crystal: ["spire", "arch", "spire"],
    ember: ["giant", "shrine", "arch"],
    frost: ["spire", "shrine", "arch"],
  };
  const list = lean[biome] ?? [...LANDMARKS];
  // Each biome's signature silhouette most of the time (readable from across the room), else a cousin.
  if (pick < 0.6) return list[0]!;
  return list[1 + (Math.floor(((pick - 0.6) / 0.4) * (list.length - 1)) % (list.length - 1))]!;
}

export function buildPlaceLandmark(c: KitCtx, kind: LandmarkKind): void {
  LANDMARK_BUILD[kind](c, rng(707 + c.seed));
}

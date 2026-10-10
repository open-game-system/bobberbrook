import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, Mesh, SphereGeometry, type Group, type Material, type ShaderMaterial } from "three";
import { pondRadius, type PondPlace } from "../../game/world";
import { instanced, reedGeometry, rockGeometry, type Inst } from "./kit";
import { jitter, paint, prep } from "./geo";
import { PK } from "./painter";
import { disc, steppingStone, surfBy } from "./decking";
import { rng, vnoise } from "./noise";
import { heightAt } from "./terrain";
import { clearOfTrails } from "./valley";
import { flowMaterial } from "./water";
import { activeWorld, platformsAround } from "./worldQuery";

/**
 * Each generated place's own shoreline. The rules fix the pond, but the scene dresses its edge by the
 * place's seed: two or three of a sandbar, a rocky cove under a cliff, grassy terraces, reed islands,
 * a stepping-stone chain out to an islet, a brook feeding the pond, each at its own angle (never on
 * the near shore where the family fishes and the camera looks in). So two marshes never look alike.
 */

export type ShoreCtx = { a: PondPlace; seed: number; wood: BufferGeometry[]; glow: BufferGeometry[]; full: boolean; group: Group; painted: Material; flows: ShaderMaterial[]; extra: { dispose(): void }[] };
export type ShoreFeature = "sandbar" | "cove" | "terraces" | "reeds" | "stones" | "brook";
const FEATURES: ShoreFeature[] = ["sandbar", "cove", "terraces", "reeds", "stones", "brook"];

/** Snow, sand and grass by biome: the same shapes wear the place's own ground. */
type Palette = { sand: [number, number]; grass: [number, number]; rock: Color; reed: boolean; snow?: boolean };
function paletteOf(biome: string): Palette {
  switch (biome) {
    case "frost": return { sand: [0xd8e4f4, 0xf6faff], grass: [0xc8d6ea, 0xf2f6ff], rock: new Color(1.1, 1.15, 1.3), reed: false, snow: true };
    case "ember": return { sand: [0xb07a50, 0xe0b080], grass: [0x6a6a3a, 0xa09050], rock: new Color(1.05, 0.9, 0.85), reed: true };
    case "crystal": return { sand: [0xa8b8d8, 0xe0e8ff], grass: [0x3a6a7a, 0x6aa8b0], rock: new Color(0.95, 1.0, 1.2), reed: false };
    case "hollow": return { sand: [0x4a4a7a, 0x7a7ab0], grass: [0x1e3e58, 0x3a6a7a], rock: new Color(0.7, 0.75, 0.95), reed: true };
    default: return { sand: [0xc8b090, 0xf0dcb8], grass: [0x3e7a5a, 0x7ab07a], rock: new Color(0.95, 0.92, 1.05), reed: true };
  }
}

const at = (a: PondPlace, theta: number, d: number) => {
  const r = pondRadius(a, theta) + d;
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
};

function put(g: BufferGeometry, x: number, y: number, z: number, ry = 0): BufferGeometry {
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** A low mound (half a squashed sphere), its top at `top`. */
function mound(r: number, h: number, bottom: number, top: number, seed: number, fn?: (y: number, c: Color) => void): BufferGeometry {
  const g = new SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, h / r, 1);
  jitter(g, 0.08 * r, seed);
  g.computeVertexNormals();
  return paint(prep(g), bottom, top, (p, _n, c) => {
    c.multiplyScalar(0.88 + 0.22 * vnoise(p.x * 1.5 + seed, p.z * 1.5, 5));
    fn?.(p.y, c);
  });
}

/** Angles round the pond the far side can use (the near, south side stays open for the family). */
function freeAngles(c: ShoreCtx, R: () => number, n: number): number[] {
  const a = c.a;
  const plats = platformsAround(a.center.x, a.center.z).filter((p) => p.place === a.id);
  const place = activeWorld().placeById(a.id);
  const tower = place && plats.some((p) => p.kind === "zeppelin") ? activeWorld().towerAt(place) : null;
  const out: number[] = [];
  for (let tries = 0; tries < 40 && out.length < n; tries++) {
    // North half, east and west flanks: theta in (-pi, 0) with a little spill past the flanks.
    const th = -Math.PI / 2 + (R() - 0.5) * 3.6;
    if (out.some((o) => Math.abs(Math.atan2(Math.sin(o - th), Math.cos(o - th))) < 1.0)) continue;
    const p = at(a, th, 2);
    if (!clearOfTrails(p.x, p.z, 3)) continue;
    if (plats.some((q) => Math.hypot(q.at.x - p.x, q.at.z - p.z) < 12)) continue;
    if (tower && Math.hypot(tower.x - p.x, tower.z - p.z) < 14) continue;
    out.push(th);
  }
  return out;
}

/** A pale crescent of sand running out into the water. */
function sandbar(c: ShoreCtx, R: () => number, th: number, pal: Palette): void {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = th + (i - (n - 1) / 2) * 0.09;
    const p = at(c.a, t, 0.4 - 1.6 * (1 - Math.abs(i - (n - 1) / 2) / n) - R() * 0.4);
    const r = 2.2 + R() * 1.2 - Math.abs(i - (n - 1) / 2) * 0.3;
    c.wood.push(put(mound(r, 0.3, pal.sand[0], pal.sand[1], i), p.x, -0.12, p.z, R() * 6));
  }
  // A few pebbles and a driftwood log on it.
  const p = at(c.a, th, -0.6);
  c.wood.push(put(paint(prep(new CylinderGeometry(0.18, 0.22, 3.2, 7).rotateZ(Math.PI / 2)), 0x6a5040, 0x9a7a5a), p.x, 0.22, p.z, th + 0.6));
}

/** A rocky cove: boulders round a bite of the shore, a cliff of stacked rock behind it. */
function cove(c: ShoreCtx, R: () => number, th: number, pal: Palette, rocks: Inst[], cliff: Inst[]): void {
  for (let i = 0; i < 9; i++) {
    const t = th + (i / 8 - 0.5) * 0.9;
    const p = at(c.a, t, -0.8 + R() * 1.6);
    rocks.push({ x: p.x, y: Math.max(-0.4, heightAt(p.x, p.z)) - 0.2, z: p.z, s: 0.7 + R() * 0.9, ry: R() * 6, tint: pal.rock });
  }
  for (let i = 0; i < 5; i++) {
    const t = th + (i / 4 - 0.5) * 0.7;
    const p = at(c.a, t, 3.5 + R() * 2);
    const h = 3 + R() * 3.5 - Math.abs(i - 2) * 0.7;
    cliff.push({ x: p.x, y: heightAt(p.x, p.z) + h * 0.35, z: p.z, s: 2.4 + R() * 0.8, ry: R() * 6, sy: h / 2.2, tint: pal.rock });
  }
}

/** Grassy terraces climbing away from the water, edged with earth. */
function terraces(c: ShoreCtx, R: () => number, th: number, pal: Palette): void {
  for (let k = 0; k < 3; k++) {
    const p = at(c.a, th + (R() - 0.5) * 0.2, 2.5 + k * 2.6);
    const top = heightAt(p.x, p.z) + 0.7 + k * 0.75;
    const r = 4.2 - k * 0.7;
    // Round 13: a turned terrace with a painted lip: moss (or snow) on top, painted earth and rock down
    // the side, occluded at the foot (was a flat-coloured cylinder).
    const half = (top + 1.2) / 2;
    const g = disc({ r, top: half, bottom: -half, lip: 0.35, flare: 0.3, rings: 4 }, 22, (rho, h, lip, out) => {
      if (h > 0.97 || lip) {
        out.setHex(pal.grass[1]).lerp(new Color(pal.grass[0]), 0.35 + 0.25 * rho);
        if (lip) out.lerp(new Color(0xffffff), 0.18);
      } else out.setHex(0x4a3c30).lerp(new Color(0x7a6450), h).multiplyScalar(0.6 + 0.4 * h);
    });
    jitter(g, 0.08, k + 3);
    surfBy(g, (_c, n) => (n.y > 0.55 ? (pal.snow ? PK.snow : PK.moss) : PK.rock));
    c.wood.push(put(g, p.x, (top - 1.2) / 2, p.z, R() * 6));
  }
}

/** One to three little islands with reeds (frost and crystal islands get rocks instead). */
function reedIslands(c: ShoreCtx, R: () => number, th: number, pal: Palette, reeds: Inst[], rocks: Inst[]): void {
  const n = 1 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const t = th + (i - (n - 1) / 2) * 0.35;
    const p = at(c.a, t, -2.5 - R() * Math.min(4, c.a.pond.r * 0.25));
    const r = 1.4 + R() * 1.1;
    c.wood.push(put(mound(r, 0.55, pal.grass[0], pal.grass[1], 30 + i), p.x, -0.2, p.z));
    for (let k = 0; k < 6; k++) {
      const a = R() * Math.PI * 2;
      const d = R() * r * 0.7;
      const q = { x: p.x + Math.cos(a) * d, y: 0.2, z: p.z + Math.sin(a) * d, s: 0.8 + R() * 0.5, ry: R() * 6 };
      if (pal.reed) reeds.push(q);
      else if (k < 2) rocks.push({ ...q, s: 0.4 + R() * 0.3, tint: pal.rock });
    }
  }
}

/** A chain of flat stepping stones from the shore out to a round islet. */
function stones(c: ShoreCtx, R: () => number, th: number, pal: Palette): void {
  const end = at(c.a, th, -Math.min(6, c.a.pond.r * 0.4));
  const start = at(c.a, th + 0.25, 0.3);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const x = start.x + (end.x - start.x) * t + Math.sin(t * 6) * 0.5;
    const z = start.z + (end.z - start.z) * t + Math.cos(t * 5) * 0.4;
    const st = steppingStone(0x6a6488, 0xb8b4d0, i + 11);
    const s0 = 0.9 + R() * 0.25;
    st.scale(s0, 1, s0);
    c.wood.push(put(st, x, 0.06, z, R() * 6));
  }
  c.wood.push(put(mound(2.4, 0.7, pal.grass[0], pal.grass[1], 50), end.x, -0.25, end.z));
}

/** A brook winding in from the woods and spilling into the pond, its banks lined with stones. */
function brook(c: ShoreCtx, R: () => number, th: number, rocks: Inst[]): void {
  const water = flowMaterial(1.6, 0);
  c.flows.push(water);
  c.extra.push(water);
  const pts: { x: number; y: number; z: number; w: number }[] = [];
  const len = c.a.clearing + 10;
  const wob = R() * 6;
  for (let i = 0; i <= 24; i++) {
    const d = len * (1 - i / 24) - 1.2;
    const t = th + Math.sin(i * 0.45 + wob) * (0.12 + 0.05 * (d / len));
    const p = at(c.a, t, d);
    pts.push({ x: p.x, y: Math.max(0.02, heightAt(p.x, p.z) + 0.07), z: p.z, w: 0.7 + 0.5 * (i / 24) });
  }
  const pos: number[] = [];
  const flow: number[] = [];
  const idx: number[] = [];
  let along = 0;
  pts.forEach((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)]!;
    const o = pts[Math.max(0, i - 1)]!;
    if (i > 0) along += Math.hypot(p.x - o.x, p.z - o.z);
    const dx = q.x - o.x;
    const dz = q.z - o.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    pos.push(p.x - nx * p.w, p.y, p.z - nz * p.w, p.x + nx * p.w, p.y, p.z + nz * p.w);
    flow.push(0, along, 1, along);
    if (i > 0) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
    if (i % 2 === 0) for (const s of [-1, 1]) rocks.push({ x: p.x + nx * s * (p.w + 0.35), y: p.y - 0.1, z: p.z + nz * s * (p.w + 0.35), s: 0.3 + R() * 0.3, ry: R() * 6 });
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aFlow", new BufferAttribute(new Float32Array(flow), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new Mesh(g, water);
  m.name = "brook";
  m.renderOrder = 2;
  c.group.add(m);
}

/** Which shore features a place has, by its seed (two or three, never the same pair twice in a row of seeds). */
export function shoreFeatures(seed: number): ShoreFeature[] {
  const R = rng(9001 + seed);
  const list = [...FEATURES];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list.slice(0, R() < 0.5 ? 2 : 3);
}

export function dressShore(c: ShoreCtx, biome: string): ShoreFeature[] {
  const R = rng(9101 + c.seed);
  const pal = paletteOf(biome);
  const feats = shoreFeatures(c.seed);
  const angles = freeAngles(c, R, feats.length);
  const rocks: Inst[] = [];
  const cliff: Inst[] = [];
  const reeds: Inst[] = [];
  feats.forEach((f, i) => {
    const th = angles[i];
    if (th === undefined) return;
    if (f === "sandbar") sandbar(c, R, th, pal);
    else if (f === "cove") cove(c, R, th, pal, rocks, cliff);
    else if (f === "terraces") terraces(c, R, th, pal);
    else if (f === "reeds") reedIslands(c, R, th, pal, reeds, rocks);
    else if (f === "stones") stones(c, R, th, pal);
    else brook(c, R, th, rocks);
  });
  if (rocks.length) {
    const m = instanced(rockGeometry(61), c.painted, rocks, c.full);
    m.name = "shore-rocks";
    c.group.add(m);
  }
  if (cliff.length) {
    const m = instanced(rockGeometry(63), c.painted, cliff, c.full);
    m.name = "shore-cliff";
    c.group.add(m);
  }
  if (reeds.length) {
    const m = instanced(reedGeometry(true), c.painted, reeds, c.full);
    m.name = "shore-reeds";
    c.group.add(m);
  }
  return feats;
}

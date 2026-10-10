import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type ShaderMaterial as SM,
} from "three";
import { pondRadius, type Area, type AreaId, type PondPlace } from "../../game/world";
import { RIM_SHARE, WISTERIA_TIP, WISTERIA_TOP, cliffRockGeometry, crystalShard, instanced, rockGeometry, type Inst } from "./kit";
import { poolMesh } from "./pools";
import { fadeGlowMaterial, jitter, merge, paint, prep, puffNormals, surf } from "./geo";
import { PK } from "./painter";
import { attachFoliage, leafCards, splitRim, wisteriaCards, type Puff, type Strand } from "./foliage";
import { barked } from "./surfaces";
import { rng, vnoise } from "./noise";
import { heightAt } from "./terrain";
import type { TodState } from "./tod";
import { flowMaterial, ribbon } from "./water";
import { dressShore } from "./shores";
import { buildPlaceLandmark, crystalKit, emberKit, frostKit, willowKit, type LandmarkKind } from "./biomes";

/**
 * Each place's signature set-pieces, from its concept art: Mistmarsh's willows, boardwalk and
 * pavilion; Glowshroom Hollow's giant glowing mushrooms and arching roots; Whisperfall Pools' rock
 * steps, cascades, birches and rainbow; Starfall Tarn's standing stones with light runes, crystals and
 * cliffs. Each place's glowing parts share one material that pulses when the place is discovered.
 */

const at = (a: PondPlace, theta: number, d: number): { x: number; z: number } => {
  const r = pondRadius(a, theta) + d;
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
};
const atR = (a: PondPlace, theta: number, r: number) => ({ x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r });

/** Puts a geometry at a world point on the ground, turned by ry. */
function place(g: BufferGeometry, x: number, z: number, ry: number, s = 1, dy = 0): BufferGeometry {
  g.scale(s, s, s);
  g.rotateY(ry);
  g.translate(x, heightAt(x, z) + dy, z);
  return g;
}

// ---------- shared parts ----------

/** A weeping willow: a gnarled trunk, a wide dome, curtains of hanging purple moss. */
export function willowGeometry(seed: number): BufferGeometry {
  const r = rng(seed);
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.55, 1.1, 5.5, 10, 4);
  jitter(trunk, 0.18, seed);
  trunk.computeVertexNormals();
  trunk.rotateZ(0.12);
  trunk.translate(0.3, 2.75, 0);
  parts.push(paint(prep(trunk), 0x2e2232, 0x5a4458, (p, _n, c) => c.multiplyScalar(0.85 + 0.3 * vnoise(p.x * 2, p.y * 0.6, 3))));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const br = new CylinderGeometry(0.18, 0.4, 4, 6).translate(0, 2, 0).rotateZ(0.9).rotateY(a).translate(0.4, 4.8, 0);
    parts.push(paint(prep(br), 0x2e2232, 0x4a3a48));
  }
  const wood = parts.splice(0, parts.length);
  const domes: BufferGeometry[] = [];
  const puffs: Puff[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rr = i === 0 ? 0 : 2.6;
    const rad = i === 0 ? 3.6 : 2.4;
    const g = new SphereGeometry(rad * 0.86, 10, 7).scale(1, 0.55, 1);
    jitter(g, 0.14, i + seed);
    g.computeVertexNormals();
    const py = 7.0 + (i === 0 ? 0.6 : -0.2);
    g.translate(Math.cos(a) * rr, py, Math.sin(a) * rr);
    domes.push(prep(g));
    puffs.push([Math.cos(a) * rr, py, Math.sin(a) * rr, rad, 0.55]);
  }
  const dome = merge(domes);
  puffNormals(dome, 0, 6.5, 0, 0.75);
  paint(dome, 0x3a2a6a, 0x9a7ad8, (p, n, c) => {
    c.multiplyScalar((0.85 + 0.3 * vnoise(p.x * 1.4, p.z * 1.4 + p.y, 5)) * 0.62);
    if (n.y > 0.5) c.lerp(new Color(0xd8b8ff).multiplyScalar(0.6), (n.y - 0.5) * 0.6);
  });
  parts.push(dome);
  const cards = leafCards(puffs, { cx: 0, cy: 6.8, cz: 0, size: 1.4, density: 2.1, inner: 0x3a2a6a, outer: 0x9a7ad8, top: 0xd8b8ff, seed: seed * 7 + 3 });
  // Curtains of hanging leaf strands round the rim (wisteria-like, not flat moss sheets).
  const strands: Strand[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.3;
    const rr = 3.4 + r() * 1.6;
    const len = 1.6 + r() * 2.0;
    const w = 0.8 + r() * 0.4;
    r();
    strands.push({ x: Math.cos(a) * rr, y: 6.9 - (rr - 3.4) * 0.35, z: Math.sin(a) * rr, len, w, ox: Math.cos(a), oz: Math.sin(a) });
  }
  const [body, rimCards] = splitRim(cards, 0, 6.8, 0, RIM_SHARE);
  return attachFoliage(barked(wood, parts), body, "violet", [rimCards, "glow"], [wisteriaCards(strands, WISTERIA_TOP, WISTERIA_TIP, seed * 17), "wisteria"]);
}

/** A birch: a slim white trunk with dark marks, a light lavender crown. */
export function birchGeometry(seed: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const trunk = prep(new CylinderGeometry(0.16, 0.26, 6.5, 8).translate(0, 3.25, 0));
  paint(trunk, 0xd8d4e0, 0xf4f0f8, (p, _n, c) => {
    if (vnoise(p.y * 3.2, Math.atan2(p.z, p.x) * 2, seed) > 0.72) c.setHex(0x3a3440);
  });
  parts.push(trunk);
  const blobs = [[0, 6.2, 0, 1.5], [0.8, 5.4, 0.3, 1.1], [-0.7, 5.6, -0.2, 1.15], [0.1, 7.1, 0.2, 1.0], [0.2, 4.8, -0.8, 0.9]];
  const crown = merge(blobs.map(([x, y, z, rr], i) => {
    const g = new SphereGeometry(rr! * 0.86, 9, 7);
    jitter(g, 0.2, i + seed);
    g.computeVertexNormals();
    g.translate(x!, y!, z!);
    return prep(g);
  }));
  puffNormals(crown, 0, 5.8, 0, 0.8);
  paint(crown, 0x7a5ab8, 0xd0b0ff, (p, n, c) => {
    c.multiplyScalar((0.88 + 0.24 * vnoise(p.x * 2.5, p.z * 2.5 + p.y, 8)) * 0.62);
    if (n.y > 0.55) c.lerp(new Color(0xf0dcff).multiplyScalar(0.6), (n.y - 0.55) * 0.6);
  });
  parts.push(crown);
  const cards = leafCards(blobs.map(([x = 0, y = 0, z = 0, rr = 1]): Puff => [x, y, z, rr]), { cx: 0, cy: 5.8, cz: 0, size: 1.0, density: 2.2, inner: 0x7a5ab8, outer: 0xd0b0ff, top: 0xf0dcff, seed: seed * 13 + 1 });
  const [body, rimCards] = splitRim(cards, 0, 5.8, 0, RIM_SHARE);
  return attachFoliage(merge(parts), body, "violet", [rimCards, "glow"]);
}

/** A tall wooden post with a hanging amber lantern; the glass is a separate glow part. */
function lanternPost(h: number): { wood: BufferGeometry; glass: BufferGeometry } {
  const post = paint(prep(new CylinderGeometry(0.1, 0.13, h, 7).translate(0, h / 2, 0)), 0x4a3220, 0x6a4a30);
  const arm = paint(prep(new BoxGeometry(0.55, 0.07, 0.07).translate(0.25, h - 0.05, 0)), 0x4a3220);
  const frame = paint(prep(new BoxGeometry(0.28, 0.34, 0.28).translate(0.45, h - 0.35, 0)), 0x2a2420);
  const cap = paint(prep(new ConeGeometry(0.24, 0.18, 4).rotateY(Math.PI / 4).translate(0.45, h - 0.1, 0)), 0x2a2420);
  const glass = paint(prep(new BoxGeometry(0.2, 0.26, 0.31).translate(0.45, h - 0.35, 0)), 0xffb060);
  const glass2 = paint(prep(new BoxGeometry(0.31, 0.26, 0.2).translate(0.45, h - 0.35, 0)), 0xffb060);
  return { wood: merge([post, arm, frame, cap]), glass: merge([glass, glass2]) };
}

export type Landmark = { group: Group; update(tod: TodState, time: number, pulse: number): void; dispose(): void };

type Ctx = { a: PondPlace; seed: number; wood: BufferGeometry[]; glow: BufferGeometry[]; /** Lamp posts and their glass: they dissolve between the camera and a fisher. */ lamps: BufferGeometry[]; lampGlow: BufferGeometry[]; full: boolean; group: Group; painted: Material; tree: Material; extra: { dispose(): void }[]; flows: SM[]; /** Fade out at night (a rainbow under the moon reads wrong). */ dayOnly: SM[] };

// ---------- Mistmarsh ----------

function mistmarsh(c: Ctx): void {
  const { a } = c;
  const R = rng(51 + c.seed);
  // Weeping willows framing the marsh (trunks just outside the clearing; curtains over it).
  const willows: Inst[] = [];
  for (const th of [-2.75, -1.95, -1.05, -0.2, 2.55, 3.05]) {
    const p = atR(a, th, a.pond.r + a.clearing + 2.5 + R() * 2);
    willows.push({ x: p.x, y: heightAt(p.x, p.z) - 0.3, z: p.z, s: 1.0 + R() * 0.35, ry: R() * 6 });
  }
  const wMesh = instanced(willowGeometry(7), c.tree, willows, c.full);
  wMesh.name = "willows";
  c.group.add(wMesh);
  const lampPools: Inst[] = [];
  // The boardwalk on stilts: from the north shore out over the water and along it, lanterns on posts.
  const path: Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const th = -1.55 + t * 1.25;
    const r = pondRadius(a, th) + 1.5 - Math.sin(t * Math.PI) * 5.5 - t * 0.5;
    path.push(new Vector3(a.center.x + Math.cos(th) * r, 0.55, a.center.z + Math.sin(th) * r));
  }
  const curve = new CatmullRomCurve3(path);
  const N = 70;
  const plankCols = [0xa0714a, 0x8f6440, 0xb07e52, 0x9a6c46];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const ry = Math.atan2(tan.x, tan.z);
    const g = new BoxGeometry(2.0, 0.1, 0.34);
    g.rotateY(ry + (R() - 0.5) * 0.05);
    g.translate(p.x, p.y + (R() - 0.5) * 0.03, p.z);
    c.wood.push(paint(prep(g), plankCols[Math.floor(R() * plankCols.length)]!, 0xffffff, (_pp, n, cc) => { if (n.y < 0.5) cc.multiplyScalar(0.6); }));
    if (i % 7 === 0) {
      for (const side of [-1, 1]) {
        const ox = Math.cos(ry) * side * 1.05;
        const oz = -Math.sin(ry) * side * 1.05;
        const post = new CylinderGeometry(0.11, 0.13, 2.2, 7).translate(p.x + ox, p.y - 0.6, p.z + oz);
        c.wood.push(paint(prep(post), 0x4a3220, 0x6a4a30));
        const rope = new TorusGeometry(0.13, 0.03, 4, 10).rotateX(Math.PI / 2).translate(p.x + ox, p.y + 0.3, p.z + oz);
        c.wood.push(paint(prep(rope), 0xd8b878));
        if (i % 14 === 0 && side === 1) {
          const lp = lanternPost(1.9);
          for (const gg of [lp.wood, lp.glass]) gg.rotateY(ry + Math.PI / 2).translate(p.x + ox, p.y, p.z + oz);
          c.lamps.push(lp.wood);
          c.lampGlow.push(lp.glass);
          lampPools.push({ x: p.x + ox, y: p.y - 0.1, z: p.z + oz, s: 2.6, ry: 0 });
        }
      }
    }
  }
  // A rope rail along both sides.
  for (const side of [-1, 1]) {
    const rail: Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const ry = Math.atan2(tan.x, tan.z);
      rail.push(new Vector3(p.x + Math.cos(ry) * side * 1.05, p.y + 0.28 - Math.abs(Math.sin(t * Math.PI * 4)) * 0.1, p.z - Math.sin(ry) * side * 1.05));
    }
    c.wood.push(paint(prep(new TubeGeometry(new CatmullRomCurve3(rail), 60, 0.03, 4, false)), 0xd2b070));
  }
  // The pavilion on the far shore: six posts, a railing, a swept purple roof, lanterns under the eaves.
  const pv = at(a, -2.35, 4.5);
  const py = heightAt(pv.x, pv.z);
  const face = Math.atan2(a.center.x - pv.x, a.center.z - pv.z);
  const pav: BufferGeometry[] = [];
  pav.push(paint(prep(new CylinderGeometry(2.8, 3.0, 0.35, 12).translate(0, 0.17, 0)), 0x6a6280, 0x8a84a0));
  pav.push(paint(prep(new CylinderGeometry(2.6, 2.6, 0.12, 12).translate(0, 0.4, 0)), 0x9a6c46, 0xb07e52));
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    pav.push(paint(prep(new CylinderGeometry(0.13, 0.16, 3.0, 7).translate(Math.cos(ang) * 2.3, 1.9, Math.sin(ang) * 2.3)), 0x4a2c3a, 0x6a3c4a));
    if (i !== 0) pav.push(paint(prep(new BoxGeometry(2.3, 0.1, 0.1).rotateY(-ang - Math.PI / 2 - Math.PI / 6).translate(Math.cos(ang + Math.PI / 6) * 2.0, 1.1, Math.sin(ang + Math.PI / 6) * 2.0)), 0x5a3a2a));
  }
  const prof: Vector2[] = [new Vector2(4.0, 0.45), new Vector2(3.8, 0.0)];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    prof.push(new Vector2(Math.max(0.02, 3.8 * Math.pow(1 - t, 2.0)), 3.4 * t));
  }
  pav.push(paint(prep(new LatheGeometry(prof.reverse(), 12).translate(0, 3.35, 0)), 0x4e3a9a, 0xa88ae8, (p, _n, cc) => cc.multiplyScalar(0.82 + 0.16 * Math.abs(Math.sin((p.y - 3.35) * 7.5)))));
  pav.push(paint(prep(new ConeGeometry(0.1, 0.9, 6).translate(0, 7.1, 0)), 0xd8c070));
  const pavGeo = merge(pav);
  c.wood.push(place(pavGeo, pv.x, pv.z, face, 1, py - heightAt(pv.x, pv.z)));
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const lamp = paint(prep(new SphereGeometry(0.2, 8, 6).scale(1, 1.3, 1)), 0xffc070);
    const lx = Math.cos(ang) * 3.0;
    const lz = Math.sin(ang) * 3.0;
    lamp.translate(lx, 2.95, lz);
    c.glow.push(place(lamp, pv.x, pv.z, face));
  }
  // Lantern posts round the shore.
  for (const th of [-2.9, -0.6, 0.3, 2.2, 2.9]) {
    const p = at(a, th, 1.6);
    const lp = lanternPost(2.2);
    const ry = Math.atan2(a.center.x - p.x, a.center.z - p.z) - Math.PI / 2;
    c.lamps.push(place(lp.wood, p.x, p.z, ry));
    c.lampGlow.push(place(lp.glass, p.x, p.z, ry));
    lampPools.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, s: 3.0, ry: 0 });
  }
  lampPools.push({ x: pv.x, y: py + 0.4, z: pv.z, s: 4.5, ry: 0 });
  c.group.add(poolMesh(lampPools));
  // Big glowing water lilies on their pads.
  for (let i = 0; i < 18; i++) {
    const th = R() * Math.PI * 2;
    const p = at(a, th, -1.5 - R() * 5);
    const pad = paint(prep(new CylinderGeometry(0.9, 0.9, 0.04, 14, 1, false, 0.3, Math.PI * 2 - 0.6)), 0x3a8030, 0x7cbf4a);
    pad.translate(p.x, 0.03, p.z);
    c.wood.push(pad);
    const petals: BufferGeometry[] = [];
    for (let ring = 0; ring < 2; ring++) {
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2 + ring * 0.45;
        const g = new SphereGeometry(1, 6, 4).scale(0.12, 0.06, 0.32).translate(0, 0, 0.22).rotateX(ring === 0 ? -0.4 : -0.95).rotateY(ang).translate(0, 0.1 + ring * 0.06, 0);
        petals.push(paint(prep(g), ring === 0 ? 0xff9ad8 : 0xfff0fa, 0xffffff));
      }
    }
    const fl = merge(petals);
    fl.scale(1.1, 1.1, 1.1);
    fl.translate(p.x, 0.05, p.z);
    c.glow.push(fl);
  }
}

// ---------- Glowshroom Hollow ----------

function giantMushroom(seed: number, h: number, capR: number, hue: number): { stem: BufferGeometry; cap: BufferGeometry } {
  const r = rng(seed);
  const pts: Vector3[] = [];
  const lean = (r() - 0.5) * 1.6;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new Vector3(Math.sin(t * 2.2) * lean, t * h, Math.cos(t * 1.7) * lean * 0.4));
  }
  const curve = new CatmullRomCurve3(pts);
  const stemG = new TubeGeometry(curve, 16, capR * 0.16, 10, false);
  const sp = stemG.getAttribute("position");
  // Flare the foot.
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i);
    const k = 1 + 1.4 * Math.max(0, 1 - y / (h * 0.25));
    const c0 = curve.getPointAt(Math.min(1, Math.max(0, y / h)));
    sp.setX(i, c0.x + (sp.getX(i) - c0.x) * k);
    sp.setZ(i, c0.z + (sp.getZ(i) - c0.z) * k);
  }
  stemG.computeVertexNormals();
  const stem = paint(prep(stemG), 0x8a9ac8, 0xd8e8ff, (p, _n, c) => c.multiplyScalar(0.8 + 0.25 * vnoise(p.x * 2, p.y * 0.8, seed)));
  const top = curve.getPointAt(1);
  const capG = new SphereGeometry(capR, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1);
  const capCol = new Color().setHSL(hue, 0.75, 0.6);
  const capTop = new Color().setHSL(hue, 0.6, 0.78);
  const cap = paint(prep(capG), capCol, capTop, (p, _n, c) => {
    // Pale glowing spots.
    const s = vnoise(p.x * 1.4 + seed, p.z * 1.4, seed + 3);
    if (s > 0.72) c.lerp(new Color(0xffffff), 0.7);
  });
  // The gills underneath: a brighter, glowing underside.
  const gills = paint(prep(new CylinderGeometry(capR * 0.98, capR * 0.2, capR * 0.12, 22, 1, true).translate(0, -capR * 0.04, 0)), new Color().setHSL(hue, 0.9, 0.75), new Color().setHSL(hue, 0.7, 0.9));
  const capAll = merge([cap, gills]);
  capAll.translate(top.x, top.y, top.z);
  return { stem, cap: capAll };
}

function hollow(c: Ctx): void {
  const { a } = c;
  const R = rng(73 + c.seed);
  // Giant glowing mushrooms just outside the clearing, caps arching over it (teal and violet).
  const spots: [number, number, number, number][] = [
    [-2.75, 11, 5.5, 0.5], [-1.3, 9, 6.0, 0.48], [-0.75, 8, 4.6, 0.75], [-0.05, 12, 5.2, 0.5], [0.55, 9, 4.0, 0.76], [2.45, 12, 5.0, 0.76], [2.0, 8, 3.8, 0.52], [-2.25, 7, 4.2, 0.74],
  ];
  spots.forEach(([th, h, cr, hue], i) => {
    const p = atR(a, th, a.pond.r + a.clearing + 0.8 + R() * 1.2);
    const m = giantMushroom(100 + i, h * 0.62, cr * 1.2, hue);
    // Lean toward the pond.
    const ry = Math.atan2(a.center.x - p.x, a.center.z - p.z);
    c.wood.push(place(m.stem, p.x, p.z, ry, 1, -0.3));
    c.glow.push(place(m.cap, p.x, p.z, ry, 1, -0.3));
  });
  // Great roots arching overhead between the giants.
  for (const [t0, t1, hh] of [[-2.2, -1.5, 7], [-0.9, -0.15, 6], [1.9, 2.6, 5.5]] as [number, number, number][]) {
    // Generated hollows keep the camera's (south) side open.
    if (c.seed !== 0 && Math.sin((t0 + t1) / 2) > 0.2) continue;
    const r0 = a.pond.r + a.clearing + 1;
    const p0 = atR(a, t0, r0);
    const p1 = atR(a, t1, r0);
    const mid = atR(a, (t0 + t1) / 2, r0 - 3.5);
    const curve = new CatmullRomCurve3([
      new Vector3(p0.x, heightAt(p0.x, p0.z) - 0.5, p0.z),
      new Vector3((p0.x + mid.x) / 2, hh * 0.8, (p0.z + mid.z) / 2),
      new Vector3(mid.x, hh, mid.z),
      new Vector3((p1.x + mid.x) / 2, hh * 0.8, (p1.z + mid.z) / 2),
      new Vector3(p1.x, heightAt(p1.x, p1.z) - 0.5, p1.z),
    ]);
    const g = new TubeGeometry(curve, 30, 0.75, 8, false);
    jitter(g, 0.1, t0 * 10);
    g.computeVertexNormals();
    c.wood.push(paint(prep(g), 0x4a3a5a, 0x7a6488, (p, n, cc) => {
      cc.multiplyScalar(0.8 + 0.3 * vnoise(p.x * 1.5, p.y * 1.5 + p.z, 4));
      if (n.y > 0.6) cc.lerp(new Color(0x2e7a6a), 0.6);
    }));
  }
  // Mossy rocks on the shore, little glowing caps clustered on them.
  const rocks: Inst[] = [];
  for (let i = 0; i < 12; i++) {
    const th = R() * Math.PI * 2;
    if (Math.sin(th) > 0.5) continue;
    const p = at(a, th, -0.6 + R() * 1.2);
    rocks.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, s: 0.6 + R() * 0.9, ry: R() * 6, sy: 1.2, tint: new Color(0.7, 0.75, 0.95) });
  }
  const rm = instanced(rockGeometry(21), c.painted, rocks, c.full);
  rm.name = "hollow-rocks";
  c.group.add(rm);
}

// ---------- Whisperfall Pools ----------

function pools(c: Ctx): void {
  const { a } = c;
  const R = rng(91 + c.seed);
  const water = flowMaterial(3.6, 1);
  c.flows.push(water);
  c.extra.push(water);
  const basinMat = new MeshBasicMaterial({ color: 0x6af0e0, transparent: true, opacity: 0.9, fog: true });
  c.extra.push(basinMat);
  // Rock steps rising out of the north end of the pond, each with a little basin and a cascade.
  const steps: [number, number, number, number][] = [
    // theta, distance in from the edge, top height, radius
    [-1.55, 1.2, 1.1, 2.6], [-1.15, 0.2, 2.2, 2.3], [-1.85, 0.0, 2.0, 2.2], [-1.45, -2.0, 3.4, 2.6], [-1.0, -2.6, 4.4, 2.0], [-1.9, -2.6, 4.0, 2.2],
  ];
  const cliff: Inst[] = [];
  steps.forEach(([th, din, top, rad], i) => {
    const p = at(a, th, -din);
    // A broad flat-topped step of faceted rock, with a wider skirt below it.
    cliff.push({ x: p.x, y: top - rad * 0.62, z: p.z, s: rad * 1.25, ry: R() * 6, sy: 0.65, tint: new Color(0.95, 0.92, 1.05) });
    cliff.push({ x: p.x + (R() - 0.5), y: top - rad * 1.35, z: p.z + (R() - 0.5), s: rad * 1.5, ry: R() * 6, sy: 0.8, tint: new Color(0.85, 0.85, 0.95) });
    // The basin on top.
    const basin = new Mesh(new CylinderGeometry(rad * 0.85, rad * 0.85, 0.05, 20), basinMat);
    basin.position.set(p.x, top + 0.02, p.z);
    c.group.add(basin);
    // A cascade spilling over the lip toward the pond.
    const toC = Math.atan2(a.center.z - p.z, a.center.x - p.x);
    const pts: { x: number; y: number; z: number; w: number }[] = [];
    for (let k = 0; k <= 10; k++) {
      const f = k / 10;
      const d = rad * 0.8 + f * f * 0.9 + f * 0.4;
      pts.push({ x: 0, y: top + 0.05 - (top - (i < 3 ? 0.02 : 1.1)) * Math.pow(f, 1.6), z: d, w: 0.7 + f * 0.35 });
    }
    const g = ribbon(pts, "x");
    g.rotateY(Math.PI / 2 - toC);
    g.translate(p.x, 0, p.z);
    const m = new Mesh(g, water);
    m.renderOrder = 3;
    c.group.add(m);
  });
  const cm = instanced(cliffRockGeometry(33), c.painted, cliff, c.full);
  cm.name = "pool-steps";
  c.group.add(cm);
  // A higher cliff behind with a tall fall, just outside the clearing.
  const back: Inst[] = [];
  for (let i = 0; i < 16; i++) {
    const th = -2.4 + (i / 15) * 1.8;
    const p = atR(a, th, a.pond.r + a.clearing + 3 + R() * 3);
    back.push({ x: p.x, y: heightAt(p.x, p.z) - 1, z: p.z, s: 2.6 + R() * 1.6, ry: R() * 6, sy: 1.7 + R() * 0.8, tint: new Color(0.9, 0.88, 1.0) });
  }
  const bm = instanced(cliffRockGeometry(41), c.painted, back, c.full);
  bm.name = "pool-cliff";
  c.group.add(bm);
  // Stepping stones across the south of the pond.
  const stones: Inst[] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const th = 0.5 + t * 2.1;
    const p = at(a, th, -1.6 - Math.sin(t * Math.PI) * 2.5);
    stones.push({ x: p.x, y: -0.12, z: p.z, s: 0.55 + R() * 0.2, ry: R() * 6, sy: 0.55, tint: new Color(1.05, 1.0, 1.1) });
  }
  const sm = instanced(rockGeometry(12), c.painted, stones, c.full);
  sm.name = "stepping-stones";
  c.group.add(sm);
  // Birches with lavender crowns round the clearing.
  const birches: Inst[] = [];
  for (let i = 0; i < 12; i++) {
    const th = R() * Math.PI * 2;
    if (Math.sin(th) > 0.6) continue;
    const p = atR(a, th, a.pond.r + a.clearing + 0.5 + R() * 3);
    birches.push({ x: p.x, y: heightAt(p.x, p.z) - 0.2, z: p.z, s: 0.9 + R() * 0.4, ry: R() * 6 });
  }
  const birch = instanced(birchGeometry(5), c.tree, birches, c.full);
  birch.name = "birches";
  c.group.add(birch);
  // A faint rainbow in the spray over the steps (a half ring; the band is the radius).
  const rb = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
    uniforms: { uK: { value: 1 } },
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uK; varying vec2 vP;
      vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main(){ float band = (length(vP) - 6.2) / 1.4; float a = smoothstep(0.0, 0.25, band) * smoothstep(1.0, 0.75, band);
        a *= smoothstep(0.0, 3.0, vP.y) * 0.55 + 0.45 * smoothstep(0.5, 4.0, vP.y);
        gl_FragColor = vec4(hue(band * 0.78) * a * 0.22 * uK, 1.0); }`,
  });
  c.extra.push(rb);
  c.dayOnly.push(rb);
  const arc = new Mesh(new RingGeometry(6.2, 7.6, 48, 1, 0, Math.PI), rb);
  const ap = at(a, -1.45, -2.5);
  arc.position.set(ap.x, -0.5, ap.z + 2.5);
  arc.name = "rainbow";
  c.group.add(arc);
}

// ---------- Starfall Tarn ----------

function tarn(c: Ctx): void {
  const { a } = c;
  const R = rng(17 + c.seed);
  // Standing stones in a ring, each on a little islet just off the shore; soft light runes face the water.
  const stones: BufferGeometry[] = [];
  for (let i = 0; i < 11; i++) {
    const th = -Math.PI + (i / 11) * Math.PI * 2 + 0.1;
    if (Math.sin(th) > 0.55) continue; // keep the camera side open
    const p = at(a, th, -1.2);
    const h = 3.2 + R() * 2.2;
    const face = Math.atan2(a.center.x - p.x, a.center.z - p.z);
    // Carved standing stones (round 09: they read as black boxes): a tapered, rounded slab with a slanted
    // worn top, chiselled bevels, pale lichen and moss on the shoulders, lit grey-lilac stone.
    const st = new BoxGeometry(1.25, h, 0.75, 4, 8, 3);
    const sa = st.getAttribute("position");
    const lean = (R() - 0.5) * 0.5;
    for (let v = 0; v < sa.count; v++) {
      const vx = sa.getX(v), vy = sa.getY(v), vz = sa.getZ(v);
      const t = vy / h + 0.5;
      const taper = 1 - 0.32 * t;
      // Round the vertical edges (a worn slab, not a box).
      const ex = Math.abs(vx) / 0.625, ez = Math.abs(vz) / 0.375;
      const round = ex > 0.7 && ez > 0.7 ? 0.82 : 1;
      // A slanted, domed top.
      const top = t > 0.98 ? (vx / 0.625) * 0.28 + lean - 0.12 * (vx / 0.625) * (vx / 0.625) : 0;
      sa.setXYZ(v, vx * taper * round, vy + top, vz * taper * round);
    }
    st.computeVertexNormals();
    jitter(st, 0.07, i);
    st.translate(0, h / 2, 0);
    const sp = paint(prep(st), 0x8a88ae, 0xd0cee4, (pp, n, cc) => {
      cc.multiplyScalar(0.84 + 0.28 * vnoise(pp.x * 2.4, pp.y * 1.6, i));
      // Pale lichen dabs and moss on top and the shoulders.
      if (vnoise(pp.x * 5 + 3, pp.y * 4, i + 9) > 0.72) cc.lerp(new Color(0xc8d0c0), 0.35);
      if (n.y > 0.45) cc.lerp(new Color(0x4e8a72), 0.65);
      // Shade toward the foot (grounded, not floating).
      cc.multiplyScalar(0.72 + 0.28 * Math.min(1, pp.y / 1.4));
    });
    const islet = paint(prep(new SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1)), 0x4a5a5a, 0x5a8a6a);
    stones.push(place(merge([surf(sp, PK.runestone), islet]), p.x, p.z, face, 1, 0 - heightAt(p.x, p.z) - 0.25));
    // Runes: a crescent and a line of dots, on the face toward the water.
    const rune: BufferGeometry[] = [];
    const cres = new TorusGeometry(0.32, 0.06, 4, 14, Math.PI * 1.25).rotateZ(-0.6).translate(0, h * 0.72, 0.4);
    rune.push(paint(prep(cres), 0xbfe0ff));
    for (let k = 0; k < 3; k++) rune.push(paint(prep(new BoxGeometry(0.09, 0.22, 0.04).translate(0, h * 0.72 - 0.6 - k * 0.34, 0.4)), 0xbfe0ff));
    rune.push(paint(prep(new OctahedronGeometry(0.12).translate(0, h * 0.72 - 1.7, 0.4)), 0xbfe0ff));
    c.glow.push(place(merge(rune), p.x, p.z, face, 1, -heightAt(p.x, p.z) - 0.25));
  }
  c.wood.push(...stones);
  // Pale glowing crystals in clusters round the clearing's edge and on the shore.
  for (let i = 0; i < 16; i++) {
    const th = R() * Math.PI * 2;
    const onShore = i < 7;
    const p = onShore ? at(a, th, 0.2 + R() * 0.6) : atR(a, th, a.pond.r + a.clearing + 0.5 + R() * 2.5);
    const cl: BufferGeometry[] = [];
    const k = 3 + Math.floor(R() * 4);
    for (let j = 0; j < k; j++) {
      const hh = (onShore ? 0.5 : 1.0) * (0.8 + R() * 1.6);
      const g = crystalShard(hh, 0.26 + R() * 0.08, R() * 6, new Color(0x1c1a60), new Color(0x6aa8e0));
      cl.push(g.rotateZ((R() - 0.5) * 0.7).rotateX((R() - 0.5) * 0.7).translate((R() - 0.5) * 0.7, -hh * 0.1, (R() - 0.5) * 0.7));
    }
    c.glow.push(place(merge(cl), p.x, p.z, R() * 6));
  }
  // The mountain basin: tall cliffs behind the tarn.
  const cliffs: Inst[] = [];
  for (let i = 0; i < 26; i++) {
    const th = -2.9 + (i / 25) * 2.9;
    const p = atR(a, th, a.pond.r + a.clearing + 4 + R() * 6);
    cliffs.push({ x: p.x, y: heightAt(p.x, p.z) - 1.5, z: p.z, s: 3.2 + R() * 2.2, ry: R() * 6, sy: 2.2 + R() * 1.4, tint: new Color(0.78, 0.8, 0.98) });
  }
  const cm = instanced(cliffRockGeometry(61), c.painted, cliffs, c.full);
  cm.name = "tarn-cliffs";
  c.group.add(cm);
}

const BUILDERS: Record<LandmarkStyle, (c: Ctx) => void> = {
  mistmarsh,
  hollow,
  pools,
  tarn,
  willow: (c) => willowKit(c, () => willowGeometry(7 + (c.seed % 5))),
  crystal: crystalKit,
  ember: emberKit,
  frost: frostKit,
};

/** Base glow of each place's landmark material (the hollow glows even by day). */
const GLOW_BASE: Record<LandmarkStyle, [number, number]> = {
  willow: [0.8, 1.6],
  crystal: [1.2, 1.9],
  ember: [1.0, 1.8],
  frost: [0.9, 1.6],
  mistmarsh: [0.75, 1.6],
  hollow: [1.25, 1.7],
  pools: [0.9, 1.4],
  tarn: [0.9, 1.9],
};

/** No landmark glows brighter than this (vertex colours x this; the post knee rolls off the rest). */
const GLOW_CAP = 1.9;

export type LandmarkStyle = Exclude<AreaId, "moonwell"> | "willow" | "crystal" | "ember" | "frost";

export function buildLandmark(a: PondPlace, style: LandmarkStyle, seed: number, full: boolean, painted: Material, tree: Material, landmark: LandmarkKind | null = null): Landmark {
  const id = style;
  const group = new Group();
  group.name = `landmark-${a.id}`;
  const c: Ctx = { a, seed, wood: [], glow: [], lamps: [], lampGlow: [], full, group, painted, tree, extra: [], flows: [], dayOnly: [] };
  BUILDERS[id](c);
  // Generated places: their own shoreline by seed, then their landmark.
  if (landmark) dressShore(c, id);
  if (landmark) buildPlaceLandmark(c, landmark);
  const glowMat = new MeshBasicMaterial({ vertexColors: true });
  if (c.wood.length) {
    const m = new Mesh(merge(c.wood), painted);
    m.castShadow = full;
    m.receiveShadow = true;
    m.name = `${id}-set`;
    group.add(m);
  }
  if (c.glow.length) {
    const m = new Mesh(merge(c.glow), glowMat);
    m.name = `${id}-glow`;
    group.add(m);
  }
  // Lamp posts dissolve like the trees between the camera and a fisher, their glass with them.
  const lampGlowMat = fadeGlowMaterial();
  if (c.lamps.length) {
    const m = new Mesh(merge(c.lamps), tree);
    m.castShadow = full;
    m.name = `${id}-lamps`;
    group.add(m);
  }
  if (c.lampGlow.length) {
    const m = new Mesh(merge(c.lampGlow), lampGlowMat);
    m.name = `${id}-lamp-glow`;
    group.add(m);
  }
  const [lo, hi] = GLOW_BASE[id];
  return {
    group,
    update(tod, time, pulse) {
      // The discovery pulse brightens the glow a little and never past the cap (a 2.6x pulse on the
      // Hollow's giant caps bloomed the whole TV to white, round 05).
      lampGlowMat.color.setScalar(Math.min(GLOW_CAP, (lo + (hi - lo) * tod.glow) * (1 + pulse * 0.3)));
      glowMat.color.setScalar(Math.min(GLOW_CAP, (lo + (hi - lo) * tod.glow) * (1 + pulse * (0.3 + 0.1 * Math.sin(time * 6)))));
      for (const m of c.dayOnly) m.uniforms.uK!.value = Math.max(0, 1 - tod.moon * 1.2 - tod.stars * 0.3);
      for (const f of c.flows) {
        f.uniforms.uTime!.value = time;
        (f.uniforms.uDeep!.value as Color).copy(tod.waterShallow).multiplyScalar(0.9);
        (f.uniforms.uTint!.value as Color).setRGB(0.93, 1, 1).lerp(tod.hemiSky, 0.2);
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      glowMat.dispose();
      lampGlowMat.dispose();
      for (const e of c.extra) e.dispose();
    },
  };
}

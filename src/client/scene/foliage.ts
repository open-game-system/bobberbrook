import { BufferAttribute, BufferGeometry, Color, DoubleSide, MeshLambertMaterial, Vector3, type Material } from "three";
import { rng } from "./noise";
import { applyOccluderPerVertex, surf, type OccluderUniforms } from "./geo";
import { PK } from "./painter";
import { PAINT_GLSL, type PaintTex } from "./paintkit";

/**
 * Leafy canopies: clumps of alpha-tested painted leaf cards spread over a canopy's puffs, the way a
 * hand-painted MMO tree is built. The solid puffs stay inside as a dark core (the canopy's big rounded
 * silhouette and its shadow); the cards give the leafy edge. A tree geometry registers its cards here
 * and `instanced()` draws them as a child instanced mesh with the same instances.
 */

/** Leaf sheets: the round-07 pair, the needle sprays (snowy in frost), and the round-12 teal, glow-rim and wisteria sheets. */
export type LeafKind = "violet" | "fern" | "needle" | "needleSnow" | "teal" | "glow" | "wisteria";
/** A canopy puff: centre, radius, vertical squash. */
export type Puff = [x: number, y: number, z: number, r: number, sy?: number];

export type CardOpts = {
  /** Centre the shading (and normals) radiate from. */
  cx: number; cy: number; cz: number;
  /** Card edge (m). */
  size: number;
  /** Cards per card-area of puff surface. */
  density: number;
  inner: number | Color;
  outer: number | Color;
  top: number | Color;
  seed: number;
};

type Foliage = { cards: BufferGeometry; kind: LeafKind };
const registry = new WeakMap<BufferGeometry, Foliage[]>();
let mats: Partial<Record<LeafKind, Material>> | null = null;
/** A leaf sheet with no material registered draws with this one (the scene always registers violet). */
const FALLBACK: LeafKind = "violet";

/** Registers a tree's leaf cards (one set per leaf sheet: the canopy, its glow rim, its wisteria). */
export function attachFoliage(geo: BufferGeometry, cards: BufferGeometry, kind: LeafKind, ...more: [BufferGeometry, LeafKind][]): BufferGeometry {
  // The dark core under the leaf cards needs no painted detail (and the trees are many: keep them cheap).
  surf(geo, PK.none);
  registry.set(geo, [{ cards, kind }, ...more.map(([c, k]) => ({ cards: c, kind: k }))]);
  return geo;
}
export function foliageOf(geo: BufferGeometry): { cards: BufferGeometry; mat: Material }[] {
  const f = registry.get(geo);
  const m = mats;
  if (!f || !m) return [];
  const out: { cards: BufferGeometry; mat: Material }[] = [];
  for (const p of f) {
    const mat = m[p.kind] ?? m[FALLBACK];
    if (mat && p.cards.getAttribute("position").count > 0) out.push({ cards: p.cards, mat });
  }
  return out;
}
export function setFoliageMaterials(m: Partial<Record<LeafKind, Material>> | null): void {
  mats = m;
}

const v = new Vector3();
const nrm = new Vector3();
const t1 = new Vector3();
const t2 = new Vector3();
const up = new Vector3(0, 1, 0);

/** Cards over the puffs: facing out, randomly turned, sunk a little into the puff so the core never shows a hard rim. */
export function leafCards(puffs: Puff[], o: CardOpts): BufferGeometry {
  const r = rng(o.seed);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const ci = new Color(o.inner);
  const co = new Color(o.outer);
  const ct = new Color(o.top);
  const c = new Color();
  let maxD = 0;
  for (const [x, y, z, rr, sy = 1] of puffs) maxD = Math.max(maxD, Math.hypot(x - o.cx, (y - o.cy) / Math.max(sy, 0.4), z - o.cz) + rr);
  for (const [x, y, z, rr, sy = 1] of puffs) {
    const area = 4 * Math.PI * rr * rr * (0.4 + 0.6 * sy);
    const n = Math.max(6, Math.round((0.6 * o.density * area) / (o.size * o.size)));
    for (let i = 0; i < n; i++) {
      // Uniform direction, thinned underneath (nobody sees the canopy's belly up close).
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      v.set(Math.cos(a) * s, u, Math.sin(a) * s);
      if (v.y < -0.55 && r() < 0.6) v.y = -v.y * 0.5;
      v.normalize();
      const depth = 0.72 + r() * 0.36;
      const px = x + v.x * rr * depth;
      const py = y + v.y * rr * depth * sy;
      const pz = z + v.z * rr * depth;
      // The card faces mostly outward, turned about that axis at random.
      nrm.set(v.x + (r() - 0.5) * 0.7, v.y + (r() - 0.5) * 0.7, v.z + (r() - 0.5) * 0.7).normalize();
      t1.crossVectors(Math.abs(nrm.y) > 0.95 ? t2.set(1, 0, 0) : up, nrm).normalize();
      t2.crossVectors(nrm, t1).normalize();
      const rot = r() * Math.PI * 2;
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      const sz = o.size * (0.75 + r() * 0.5);
      const ax = (t1.x * ca + t2.x * sa) * sz * 0.5, ay = (t1.y * ca + t2.y * sa) * sz * 0.5, az = (t1.z * ca + t2.z * sa) * sz * 0.5;
      const bx = (-t1.x * sa + t2.x * ca) * sz * 0.5, by = (-t1.y * sa + t2.y * ca) * sz * 0.5, bz = (-t1.z * sa + t2.z * ca) * sz * 0.5;
      // A half or whole of the leaf sheet (bigger leaves on the smaller cut).
      const half = r() < 0.7;
      const us = half ? 0.5 : 1;
      const u0 = half ? Math.floor(r() * 2) * 0.5 : 0;
      const v0 = half ? Math.floor(r() * 2) * 0.5 : 0;
      // Shading: dark inside the crown, lighter at its rim, moonlit on top.
      const dc = Math.hypot(px - o.cx, (py - o.cy) / Math.max(sy, 0.4), pz - o.cz) / Math.max(maxD, 1e-3);
      c.copy(ci).lerp(co, Math.min(1, Math.max(0, (dc - 0.35) / 0.6)));
      const shade = (dc - 0.35) / 0.6;
      if (v.y > 0.35) c.lerp(ct, Math.min(1, (v.y - 0.35) * 1.2) * Math.min(1, Math.max(0, shade)) * 0.75);
      c.multiplyScalar(0.88 + r() * 0.24);
      // Normals radiate from the crown centre (soft, cloud-like light across the whole canopy).
      t1.set(px - o.cx, (py - o.cy) * 1.1, pz - o.cz).normalize().lerp(v, 0.35).normalize();
      const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [sa2 = 0, sb = 0, uu = 0, vv = 0] = corners[k]!;
        pos.push(px + ax * sa2 + bx * sb, py + ay * sa2 + by * sb, pz + az * sa2 + bz * sb);
        uv.push(u0 + uu * us, v0 + vv * us);
        nor.push(t1.x, t1.y, t1.z);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

/** A conifer tier: boughs from the trunk at height y + h, out to radius r, drooping to y. */
export type Tier = { y: number; r: number; h: number };

/**
 * Conifer boughs: per tier a ring of needle-spray cards from the trunk out and down (some twisted up,
 * some down, a second shorter ring between them), darker inside and lower, lighter at the tips and up
 * top, normals out and up from the trunk; a crossed pair of sprays at the crown.
 */
export function coniferCards(tiers: Tier[], o: { inner: number | Color; outer: number | Color; top: number | Color; seed: number }): BufferGeometry {
  const r = rng(o.seed);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const ci = new Color(o.inner);
  const co = new Color(o.outer);
  const ct = new Color(o.top);
  const c = new Color();
  const yMax = Math.max(...tiers.map((t) => t.y + t.h));
  const quad = (bx: number, by: number, bz: number, tx: number, ty: number, tz: number, sx: number, sy: number, sz: number, w: number, nx: number, ny: number, nz: number, cb: Color, ctip: Color) => {
    const u0 = Math.floor(r() * 2) * 0.5;
    const v0 = Math.floor(r() * 2) * 0.5;
    // Corners: base-left, base-right, tip-right, tip-left (the spray's base at the bottom of its quadrant).
    const P = [
      [bx - sx * w * 0.35, by - sy * w * 0.35, bz - sz * w * 0.35, u0, v0, 0],
      [bx + sx * w * 0.35, by + sy * w * 0.35, bz + sz * w * 0.35, u0 + 0.5, v0, 0],
      [tx + sx * w * 0.5, ty + sy * w * 0.5, tz + sz * w * 0.5, u0 + 0.5, v0 + 0.5, 1],
      [tx - sx * w * 0.5, ty - sy * w * 0.5, tz - sz * w * 0.5, u0, v0 + 0.5, 1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const q = P[k]!;
      pos.push(q[0]!, q[1]!, q[2]!);
      uv.push(q[3]!, q[4]!);
      nor.push(nx, ny, nz);
      const cc = q[5]! > 0.5 ? ctip : cb;
      col.push(cc.r, cc.g, cc.b);
    }
  };
  const cb = new Color();
  tiers.forEach((t, ti) => {
    const rings = [{ n: Math.round(7 + t.r * 4), k: 1, off: 0 }, { n: Math.round(5 + t.r * 3), k: 0.72, off: 0.5 }];
    for (const ring of rings) {
      for (let i = 0; i < ring.n; i++) {
        const a = ((i + ring.off) / ring.n) * Math.PI * 2 + r() * 0.35;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const reach = t.r * ring.k * (0.9 + r() * 0.25);
        const by = t.y + t.h * (ring.k < 1 ? 0.6 : 0.78) + (r() - 0.5) * 0.1;
        const ty = t.y + t.h * (ring.k < 1 ? 0.18 : 0.02) + (r() - 0.5) * 0.15;
        const bx = ca * 0.12;
        const bz = sa * 0.12;
        const tx = ca * reach;
        const tz = sa * reach;
        // The card's width runs round the tree, twisted a little about the bough.
        const tw = (r() - 0.5) * 0.9;
        const sx = -sa * Math.cos(tw);
        const sz = ca * Math.cos(tw);
        const sy = Math.sin(tw);
        const w = reach * (0.85 + r() * 0.3);
        const hf = (t.y + t.h) / yMax;
        cb.copy(ci).multiplyScalar(0.85 + r() * 0.2);
        c.copy(co).lerp(ct, Math.max(0, hf - 0.45) * 0.9).multiplyScalar((0.9 + r() * 0.2) * (ring.k < 1 ? 0.85 : 1));
        const nl = Math.hypot(ca, 0.7, sa);
        quad(bx, by, bz, tx, ty, tz, sx, sy, sz, w, ca / nl, 0.7 / nl, sa / nl, cb, c);
      }
    }
    void ti;
  });
  // The crown: two crossed upright sprays.
  const top = tiers[tiers.length - 1]!;
  const yc = top.y + top.h;
  for (const a of [0, Math.PI / 2]) {
    c.copy(ct);
    cb.copy(co);
    quad(0, yc - 0.55, 0, 0, yc + 0.5, 0, Math.cos(a), 0, Math.sin(a), 0.8, 0, 1, 0, cb, c);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

/** A hanging strand of leaves (wisteria-like): where it hangs from, how long, how wide, which way is out. */
export type Strand = { x: number; y: number; z: number; len: number; w: number; ox: number; oz: number };

/**
 * The leaf-card material: painted leaf sheet as detail over the card colour (the instance tint gives
 * each place its canopy), alpha-to-coverage edges, a gentle wind sway, and the occluder fade so a
 * canopy between the camera and the family dissolves like the rest of the tree. One program for both
 * leaf sheets.
 */
export type LeafLook = {
  /** How much of the sheet's own hue shows over the card colour (0.45: the card colour leads). */
  hue?: number;
  /** Self-light of the sheet's bright strokes (the glow-rim leaves at night); a shared uniform the time of day drives. */
  glow?: { value: number };
};
export function leafMaterial(tex: PaintTex, occ: OccluderUniforms, time: { value: number }, look: LeafLook = {}): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, map: tex.tex, alphaTest: 0.5, side: DoubleSide });
  m.alphaToCoverage = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uLeafInv = { value: tex.inv };
    shader.uniforms.uLeafHue = { value: look.hue ?? 0.45 };
    shader.uniforms.uLeafGlow = look.glow ?? { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float h = max(position.y - 1.5, 0.0);
  float gust = 0.6 + 0.4 * sin(uTime * 0.6 + ip.x * 0.05 + ip.z * 0.03);
  transformed.x += sin(uTime * 1.1 + ip.x * 0.3 + ip.z * 0.2) * 0.012 * h * gust + sin(uTime * 2.6 + position.x * 3.1 + position.z * 2.3) * 0.03 * gust;
  transformed.z += cos(uTime * 0.9 + ip.x * 0.2 - ip.z * 0.3) * 0.009 * h * gust + cos(uTime * 2.2 + position.z * 2.9 - position.y * 2.1) * 0.03 * gust;
  transformed.y += sin(uTime * 2.4 + position.x * 2.3 + position.y * 1.7) * 0.02 * gust;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uLeafInv;\nuniform float uLeafHue;\nuniform float uLeafGlow;\n${PAINT_GLSL}`)
      .replace(
        "#include <map_fragment>",
        `vec4 leafTex = texture2D(map, vMapUv);
  diffuseColor.a *= leafTex.a;
  diffuseColor.rgb *= pkDetail(leafTex.rgb, uLeafInv, uLeafHue);`,
      )
      // Glow-rim leaves: the sheet's bright strokes light themselves (tinted by the card colour) at night.
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  vec3 leafLit = leafTex.rgb * uLeafInv;
  totalEmissiveRadiance += uLeafGlow * vColor.rgb * leafLit * smoothstep(0.8, 1.7, pkLum(leafLit));`,
      )
      // Both faces take the crown's normal (a card seen from behind is not a dark hole in the canopy).
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n  normal = normalize(vNormal);");
    applyOccluderPerVertex(shader, occ);
    // Empty card corners leave before the occluder maths and the lighting (cards overlap a lot).
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      "if (texture2D(map, vMapUv).a < 0.25) discard;\n  #include <clipping_planes_fragment>",
    );
  };
  m.customProgramCacheKey = () => "bobber-leaf";
  return m;
}

/**
 * Splits a canopy's leaf cards into its body and its rim (round 12): the share of cards furthest out
 * from the crown centre, weighted to the top, become the glow-rim set (leaves-glow), so a night canopy
 * keeps lit edges instead of going one indigo. Six vertices per card, as leafCards builds them.
 */
export function splitRim(g: BufferGeometry, cx: number, cy: number, cz: number, share: number): [BufferGeometry, BufferGeometry] {
  const pos = g.getAttribute("position");
  const n = Math.floor(pos.count / 6);
  const score: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 6; k++) {
      x += pos.getX(i * 6 + k) / 6;
      y += pos.getY(i * 6 + k) / 6;
      z += pos.getZ(i * 6 + k) / 6;
    }
    const d = Math.hypot(x - cx, y - cy, z - cz);
    score.push([d * (1 + 0.35 * Math.max(0, (y - cy) / Math.max(d, 1e-3))), i]);
  }
  score.sort((a, b) => b[0] - a[0]);
  const rim = new Set(score.slice(0, Math.round(n * share)).map(([, i]) => i));
  const pick = (want: boolean): BufferGeometry => {
    const out = new BufferGeometry();
    for (const name of ["position", "normal", "uv", "color"]) {
      const a = g.getAttribute(name);
      const s = a.itemSize;
      const arr: number[] = [];
      for (let i = 0; i < n; i++) {
        if (rim.has(i) !== want) continue;
        for (let k = 0; k < 6; k++) for (let c = 0; c < s; c++) arr.push(a.getComponent(i * 6 + k, c));
      }
      out.setAttribute(name, new BufferAttribute(new Float32Array(arr), s));
    }
    out.computeBoundingSphere();
    return out;
  };
  return [pick(false), pick(true)];
}

/**
 * Painted wisteria (round 12): each hanging strand one tall crossed pair of cards carrying the whole
 * Codex wisteria (racemes of lilac blossom under a few leaves), hung from the canopy rim and swinging out
 * a little at the bottom. The card colour only shades it (darker up under the canopy, pale at the tips);
 * the sheet keeps most of its own hue.
 */
export function wisteriaCards(strands: Strand[], top: number | Color, tip: number | Color, seed: number): BufferGeometry {
  const r = rng(seed);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const ct = new Color(top);
  const cp = new Color(tip);
  for (const st of strands) {
    const ol = Math.hypot(st.ox, st.oz) || 1;
    const ox = st.ox / ol;
    const oz = st.oz / ol;
    const h = st.len * 1.25;
    const w = st.w * 1.5;
    const mirror = r() < 0.5;
    const k = 0.9 + r() * 0.2;
    const base = Math.atan2(oz, ox) + Math.PI / 2 + (r() - 0.5) * 0.6;
    for (const turn of [0, Math.PI / 2]) {
      const a = base + turn;
      const ax = Math.cos(a) * w * 0.5;
      const az = Math.sin(a) * w * 0.5;
      // Corners: (side, t down the strand); the bottom swings out along the strand's outward direction.
      const corners: [number, number][] = [[-1, 1], [1, 1], [1, 0], [-1, 0]];
      for (const q of [0, 1, 2, 0, 2, 3]) {
        const [sa, t] = corners[q]!;
        const out = 0.35 * t * t;
        pos.push(st.x + ax * sa + ox * out, st.y + 0.25 - h * t, st.z + az * sa + oz * out);
        // The image's top (v = 1 in a cleaned card) hangs at the canopy.
        uv.push(mirror ? (1 - sa) / 2 : (1 + sa) / 2, 1 - t);
        nor.push(ox * 0.8, 0.45, oz * 0.8);
        const c = ct.clone().lerp(cp, t).multiplyScalar(k);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

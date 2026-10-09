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

export type LeafKind = "violet" | "fern";
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
const registry = new WeakMap<BufferGeometry, Foliage>();
let mats: Record<LeafKind, Material> | null = null;

export function attachFoliage(geo: BufferGeometry, cards: BufferGeometry, kind: LeafKind): BufferGeometry {
  // The dark core under the leaf cards needs no painted detail (and the trees are many: keep them cheap).
  surf(geo, PK.none);
  registry.set(geo, { cards, kind });
  return geo;
}
export function foliageOf(geo: BufferGeometry): { cards: BufferGeometry; mat: Material } | null {
  const f = registry.get(geo);
  if (!f || !mats) return null;
  return { cards: f.cards, mat: mats[f.kind] };
}
export function setFoliageMaterials(m: Record<LeafKind, Material> | null): void {
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

/** A hanging strand of leaves (wisteria-like): where it hangs from, how long, how wide, which way is out. */
export type Strand = { x: number; y: number; z: number; len: number; w: number; ox: number; oz: number };

/**
 * Hanging leaf strands under a canopy rim: each a chain of crossed leaf cards, narrowing and paling
 * toward the tip, swaying outward lower down. Replaces the flat moss drapes (they read as spikes).
 */
export function hangingCards(strands: Strand[], top: number | Color, tip: number | Color, seed: number): BufferGeometry {
  const r = rng(seed);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const ct = new Color(top);
  const cp = new Color(tip);
  const c = new Color();
  for (const st of strands) {
    const ol = Math.hypot(st.ox, st.oz) || 1;
    const ox = st.ox / ol;
    const oz = st.oz / ol;
    const k = Math.max(2, Math.round(st.len / (st.w * 0.55)));
    for (let i = 0; i < k; i++) {
      const t = i / Math.max(1, k - 1);
      const sz = st.w * (1 - 0.45 * t) * (0.9 + r() * 0.2);
      const drop = st.len * t;
      const out = 0.3 * t * t;
      const cx = st.x + ox * out + (r() - 0.5) * 0.15;
      const cy = st.y - drop - sz * 0.3;
      const cz = st.z + oz * out + (r() - 0.5) * 0.15;
      c.copy(ct).lerp(cp, t).multiplyScalar(0.9 + r() * 0.2);
      const u0 = Math.floor(r() * 2) * 0.5;
      const v0 = Math.floor(r() * 2) * 0.5;
      // One card per link, alternating its turn so the chain stays round from any side.
      for (const rot of [i % 2 === 0 ? 0 : Math.PI / 2]) {
        const a = Math.atan2(oz, ox) + Math.PI / 2 + rot + (r() - 0.5) * 0.5;
        const ax = Math.cos(a) * sz * 0.5;
        const az = Math.sin(a) * sz * 0.5;
        const hy = sz * 0.55;
        // Corners: (side, up) in card space; the sheet hangs leaves-down (v flipped).
        const corners = [[-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0], [-1, 1, 0, 0]];
        for (const q of [0, 1, 2, 0, 2, 3]) {
          const [sa = 0, sb = 0, uu = 0, vv = 0] = corners[q]!;
          pos.push(cx + ax * sa, cy + hy * sb, cz + az * sa);
          uv.push(u0 + uu * 0.5, v0 + vv * 0.5);
          nor.push(ox * 0.8, 0.45, oz * 0.8);
          col.push(c.r, c.g, c.b);
        }
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

/**
 * The leaf-card material: painted leaf sheet as detail over the card colour (the instance tint gives
 * each place its canopy), alpha-to-coverage edges, a gentle wind sway, and the occluder fade so a
 * canopy between the camera and the family dissolves like the rest of the tree. One program for both
 * leaf sheets.
 */
export function leafMaterial(tex: PaintTex, occ: OccluderUniforms, time: { value: number }): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, map: tex.tex, alphaTest: 0.5, side: DoubleSide });
  m.alphaToCoverage = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uLeafInv = { value: tex.inv };
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
      .replace("#include <common>", `#include <common>\nuniform vec3 uLeafInv;\n${PAINT_GLSL}`)
      .replace(
        "#include <map_fragment>",
        `vec4 leafTex = texture2D(map, vMapUv);
  diffuseColor.a *= leafTex.a;
  diffuseColor.rgb *= pkDetail(leafTex.rgb, uLeafInv, 0.45);`,
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

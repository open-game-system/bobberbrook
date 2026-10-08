import { BufferAttribute, BufferGeometry, Color, MeshLambertMaterial, ShaderChunk, Vector3, type Side } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

let patched = false;
/**
 * Soft wrap lighting for every Lambert material: shadow sides sit at ~25 % instead of going dark, the
 * painted look of the concept art. Patched once, before any shader compiles.
 */
export function patchLambertWrap(): void {
  if (patched) return;
  patched = true;
  ShaderChunk.lights_lambert_pars_fragment = ShaderChunk.lights_lambert_pars_fragment.replace(
    "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
    "float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.3 ) / 1.3 );",
  );
}

export function paintedMaterial(opts: { side?: Side; emissive?: number } = {}): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  if (opts.side !== undefined) m.side = opts.side;
  if (opts.emissive !== undefined) m.emissive.setHex(opts.emissive);
  return m;
}

/** Non-indexed, position + normal only, so different primitives merge. */
export function prep(g: BufferGeometry): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.deleteAttribute("uv");
  if (!n.getAttribute("normal")) n.computeVertexNormals();
  return n;
}

/** Paints a geometry with a vertical gradient (bottom → top colour over its own height) and optional per-vertex fn. */
export function paint(g: BufferGeometry, bottom: number | Color, top?: number | Color, fn?: (p: Vector3, n: Vector3, c: Color) => void): BufferGeometry {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const cols = new Float32Array(pos.count * 3);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const y0 = bb ? bb.min.y : 0;
  const y1 = bb ? bb.max.y : 1;
  const cb = new Color(bottom);
  const ct = new Color(top ?? bottom);
  const c = new Color();
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (nor) n.fromBufferAttribute(nor, i);
    const t = y1 > y0 ? (p.y - y0) / (y1 - y0) : 0;
    c.copy(cb).lerp(ct, t);
    if (fn) fn(p, n, c);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new BufferAttribute(cols, 3));
  return g;
}

/** Points every normal away from a centre: soft, cloud-like shading for canopies and bushes. */
export function puffNormals(g: BufferGeometry, cx: number, cy: number, cz: number, mix = 0.75): BufferGeometry {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const p = new Vector3();
  const n = new Vector3();
  const o = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    o.set(p.x - cx, (p.y - cy) * 1.1, p.z - cz).normalize();
    n.lerp(o, mix).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
  return g;
}

/** Moves vertices by a smooth pseudo-random field (same position → same offset, so seams stay shut). */
export function jitter(g: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 - seed * 1.3) + Math.sin(y * 3.7 + seed * 0.7);
    const s = 1 + k * amount * 0.5;
    pos.setXYZ(i, x * s, y * (1 + k * amount * 0.25), z * s);
  }
  pos.needsUpdate = true;
  return g;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const m = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!m) throw new Error("merge failed: mismatched attributes");
  return m;
}

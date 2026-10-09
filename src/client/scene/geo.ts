import { BufferAttribute, BufferGeometry, Color, Matrix4, MeshDepthMaterial, MeshLambertMaterial, ShaderChunk, Vector3, Vector4, type Side } from "three";
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
    // Opposed normal and direction would cancel to a zero normal (NaN shading): keep the original then.
    const keep = n.clone();
    n.lerp(o, mix);
    if (n.lengthSq() < 1e-4) n.copy(keep);
    n.normalize();
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

export type OccluderUniforms = {
  uCam: { value: Vector3 };
  uFocus: { value: Vector3[] };
  /** The action's screen box (0..1, x0 y0 x1 y1, y up) and the view depth just in front of the nearest fisher. */
  uBox: { value: Vector4 };
  uNear: { value: number };
  /** The main camera's view-projection: the fade is worked out from world position, so the shadow pass can apply it too. */
  uVP: { value: Matrix4 };
};
export const MAX_FOCUS = 5;

const OCC_VERT_PARS = "varying vec3 vOccW;";
const OCC_VERT = `
  vec4 occW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  occW = instanceMatrix * occW;
  #endif
  vOccW = (modelMatrix * occW).xyz;`;
const OCC_FRAG_PARS = `
varying vec3 vOccW;
uniform vec4 uBox;
uniform float uNear;
uniform mat4 uVP;
uniform vec3 uCam;
uniform vec3 uFocus[${MAX_FOCUS}];
/** 0 = solid, 1 = gone: on the line from the camera to a focus point, in front of the action's screen box, or against the lens. */
float occAmount() {
  float occ = 0.0;
  for (int i = 0; i < ${MAX_FOCUS}; i++) {
    vec3 b = uFocus[i];
    if (b.y < -50.0) continue;
    vec3 ab = b - uCam;
    float t = clamp(dot(vOccW - uCam, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    float d = length(vOccW - (uCam + ab * t));
    occ = max(occ, (1.0 - smoothstep(3.0, 5.5, d)) * step(0.03, t) * (1.0 - smoothstep(0.86, 0.93, t)));
  }
  vec4 clip = uVP * vec4(vOccW, 1.0);
  float vz = clip.w;
  vec2 sc = clip.xy / max(abs(clip.w), 1e-3) * 0.5 + 0.5;
  // In front of the action and no higher on screen than its top (name tags): the whole foreground band
  // across the frame, so no canopy, rock or prop sits over the family or the water before them.
  float inBand = smoothstep(uBox.w + 0.06, uBox.w + 0.01, sc.y) * step(0.0, uBox.z - uBox.x);
  occ = max(occ, inBand * (1.0 - smoothstep(uNear - 3.0, uNear, vz)) * step(0.0, vz));
  // Never a trunk or canopy right against the lens, nor foreground clutter well in front of the family.
  occ = max(occ, (1.0 - smoothstep(7.0, 13.0, vz)) * step(-1.0, vz));
  return occ;
}`;

function bindOcc(shader: { uniforms: Record<string, unknown> }, u: OccluderUniforms): void {
  shader.uniforms.uCam = u.uCam;
  shader.uniforms.uFocus = u.uFocus;
  shader.uniforms.uBox = u.uBox;
  shader.uniforms.uNear = u.uNear;
  shader.uniforms.uVP = u.uVP;
}

/**
 * Painted material for trees and bushes that dissolve where they stand between the camera and the
 * action, so a canopy never hides a fisher.
 */
export function occluderMaterial(u: OccluderUniforms): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    bindOcc(shader, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${OCC_VERT_PARS}`)
      .replace("#include <project_vertex>", `#include <project_vertex>${OCC_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${OCC_FRAG_PARS}`)
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
  // Faded with alpha-to-coverage (multisampled, smooth) rather than a screen-door pattern.
  float occA = 1.0 - min(1.0, occAmount() * 1.25);
  if (occA < 0.02) discard;`,
      )
      .replace(
        "#include <alphatest_fragment>",
        `#include <alphatest_fragment>
  diffuseColor.a *= occA;`,      );
  };
  m.alphaToCoverage = true;
  m.customProgramCacheKey = () => "bobber-occluder";
  return m;
}

/**
 * The shadow-pass twin of occluderMaterial: a tree faded out of the view casts no shadow either (a dark
 * hard-edged slab with nothing above it, round 02).
 */
export function occluderDepthMaterial(u: OccluderUniforms): MeshDepthMaterial {
  const m = new MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    bindOcc(shader, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${OCC_VERT_PARS}`)
      .replace("#include <project_vertex>", `#include <project_vertex>${OCC_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${OCC_FRAG_PARS}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  if (occAmount() > 0.45) discard;`);
  };
  m.customProgramCacheKey = () => "bobber-occluder-depth";
  return m;
}

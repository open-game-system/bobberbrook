import { BufferAttribute, BufferGeometry, type Camera, Color, Matrix4, MeshBasicMaterial, MeshDepthMaterial, MeshLambertMaterial, type Material, ShaderChunk, Vector3, Vector4, type Side } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PK, applyPaint, type PaintKind } from "./painter";

let patched = false;
/** Round 18: the fishers' clothes take part of the world's painted value bands (an airbrushed ramp read as vinyl). */
const CLOTH_BANDS = "0.45";
/**
 * Soft wrap lighting for every Lambert material: shadow sides sit at ~25 % instead of going dark, the
 * painted look of the concept art. Patched once, before any shader compiles.
 */
export function patchLambertWrap(): void {
  if (patched) return;
  patched = true;
  const src = ShaderChunk.lights_lambert_pars_fragment;
  const from = "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;";
  if (!src.includes(from)) throw new Error("three's Lambert chunk changed: re-check the painted light ramp");
  // uPkCrisp (1 on the fishers, see painter.ts; 0 = unset elsewhere): characters keep a smooth ramp,
  // so firelight and lamplight model their faces instead of flattening them into one band.
  ShaderChunk.lights_lambert_pars_fragment = `uniform float uPkCrisp;\nfloat gPkSkin = 0.0;\nfloat gPkBand = 0.0;\n${src.replace(
    from,
    `float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.3 ) / 1.3 );
\t// Painted light: four soft value bands (a painter's planes of light, not a smooth airbrush ramp).
\tfloat bandsNL = wrapNL * 3.0;
\tfloat dotNL = mix( wrapNL, ( floor( bandsNL ) + smoothstep( 0.36, 0.64, fract( bandsNL ) ) ) / 3.0, 0.75 * ( 1.0 - uPkCrisp ) + ${CLOTH_BANDS} * uPkCrisp * gPkBand );
\t// Warm key, cool violet bounce on the turned-away side (Ashenvale's lilac shadows).
\tvec3 irradiance = dotNL * directLight.color * vec3( 1.04, 1.0, 0.94 ) + ( 1.0 - dotNL ) * directLight.color * vec3( 0.07, 0.06, 0.14 );
\t// A painted rim of key light on the silhouette (the warm edge WoW paints on its characters and props).
\tirradiance += directLight.color * vec3( 0.13, 0.09, 0.05 ) * pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 ) * wrapNL * ( 1.0 - 0.75 * gPkSkin );
\t// Skin (round 16): a warm, blood-lit band where the light turns away (painted skin, not vinyl).
\tirradiance += directLight.color * vec3( 0.2, 0.05, 0.01 ) * gPkSkin * smoothstep( 0.05, 0.45, wrapNL ) * ( 1.0 - smoothstep( 0.45, 0.85, wrapNL ) );`,
  )}`;
}

/** Painted props: vertex colours with hand-painted detail by surface kind (see painter.ts). */
export function paintedMaterial(opts: { side?: Side; emissive?: number; /** Object units per metre (fishers are built ~1 unit tall). */ pkScale?: number; /** A character: kept out of the painterly filter (same program). */ crisp?: boolean } = {}): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  if (opts.side !== undefined) m.side = opts.side;
  if (opts.emissive !== undefined) m.emissive.setHex(opts.emissive);
  const scale = { value: opts.pkScale ?? 1 };
  const crisp = { value: opts.crisp ? 1 : 0 };
  m.onBeforeCompile = (shader) => applyPaint(shader, scale, crisp);
  m.customProgramCacheKey = () => "bobber-painted";
  return m;
}

/**
 * Says what a geometry's surface is made of (wood, cloth, canvas...): the painted materials pick their
 * brushwork by it. u/v: the planks' turn (u = 1 turns the boards 90 degrees on top), or explicit
 * texture coordinates (canvas, from the geometry's own uv times su/sv).
 */
export function surf(g: BufferGeometry, kind: PaintKind, su = 0, sv = 0): BufferGeometry {
  const n = g.getAttribute("position").count;
  const a = new Float32Array(n * 3);
  const uv = kind === PK.canvas || kind === PK.tent ? g.getAttribute("uv") : undefined;
  for (let i = 0; i < n; i++) {
    a[i * 3] = kind;
    a[i * 3 + 1] = uv ? uv.getX(i) * su : su;
    a[i * 3 + 2] = uv ? uv.getY(i) * sv : sv;
  }
  g.setAttribute("aPaint", new BufferAttribute(a, 3));
  return g;
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
  // A part with no surface kind is plain painted brushwork (kind 0) when merged with kinded parts.
  if (parts.some((p) => p.getAttribute("aPaint")) && parts.some((p) => !p.getAttribute("aPaint"))) {
    for (const p of parts) if (!p.getAttribute("aPaint")) surf(p, PK.brush);
  }
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
  /**
   * Round 25: each framed fisher's screen box (0..1, x0 y0 x1 y1, y up), padded BESIDE_PAD metres either side,
   * feet to hat; x0 > x1 = unused. Posts, lanterns and rails (materials made with `beside`) dissolve inside it
   * from the lens to BESIDE_BACK metres behind the fisher, so no post or lantern crosses a fisher's silhouette
   * or held fish, in front or just behind (round 24 session 274-298 s: Mistmarsh's boardwalk lanterns).
   */
  uBeside: { value: Vector4[] };
  /** Per fisher: view depth of the chest (m), feet height. */
  uBesideD: { value: Vector4[] };
};
export const BESIDE_PAD = 0.9;
export const BESIDE_BACK = 4;
const bTmp = new Vector3();
/** Sets the beside fade's boxes from the camera and the framed fishers' feet (and hat tops above the feet). */
export function setBeside(u: OccluderUniforms, cam: Camera, feet: readonly { x: number; y: number; z: number; top: number }[]): void {
  let n = 0;
  for (const f of feet) {
    if (n >= MAX_FOCUS) break;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let ok = true;
    for (let k = 0; k < 8; k++) {
      bTmp.set(f.x + (k & 1 ? BESIDE_PAD : -BESIDE_PAD), f.y + (k & 2 ? f.top : 0), f.z + (k & 4 ? BESIDE_PAD : -BESIDE_PAD)).applyMatrix4(cam.matrixWorldInverse);
      if (-bTmp.z < 0.1) { ok = false; break; }
      bTmp.applyMatrix4(cam.projectionMatrix);
      x0 = Math.min(x0, bTmp.x * 0.5 + 0.5); x1 = Math.max(x1, bTmp.x * 0.5 + 0.5);
      y0 = Math.min(y0, bTmp.y * 0.5 + 0.5); y1 = Math.max(y1, bTmp.y * 0.5 + 0.5);
    }
    if (!ok) continue;
    const depth = -bTmp.set(f.x, f.y + 1.1, f.z).applyMatrix4(cam.matrixWorldInverse).z;
    u.uBeside.value[n]!.set(x0, y0, x1, y1);
    u.uBesideD.value[n]!.set(depth, f.y, 0, 0);
    n++;
  }
  for (let i = n; i < MAX_FOCUS; i++) u.uBeside.value[i]!.set(1, 1, 0, 0);
}
export const MAX_FOCUS = 5;

/** The fade's maths, shared by the vertex stage (whole instances) and the fragment stage (one-off meshes). */
const OCC_CORE = `
uniform vec4 uBox;
uniform float uNear;
uniform mat4 uVP;
uniform vec3 uCam;
uniform vec3 uFocus[${MAX_FOCUS}];
uniform vec4 uBeside[${MAX_FOCUS}];
uniform vec4 uBesideD[${MAX_FOCUS}];
uniform float uBesideK;
/** Round 25: posts and lanterns (uBesideK 1) dissolve round a fisher on screen, in front or just behind. */
float occBeside(vec3 p) {
  if (uBesideK < 0.5) return 0.0;
  vec4 clip = uVP * vec4(p, 1.0);
  if (clip.w <= 0.05) return 0.0;
  vec2 sc = clip.xy / clip.w * 0.5 + 0.5;
  float occ = 0.0;
  for (int i = 0; i < ${MAX_FOCUS}; i++) {
    vec4 b = uBeside[i];
    if (b.z < b.x) continue;
    vec4 d = uBesideD[i];
    float inX = smoothstep(b.x - 0.01, b.x + 0.01, sc.x) * (1.0 - smoothstep(b.z - 0.01, b.z + 0.01, sc.x));
    float inY = smoothstep(b.y - 0.01, b.y + 0.01, sc.y) * (1.0 - smoothstep(b.w - 0.01, b.w + 0.01, sc.y));
    float near = 1.0 - smoothstep(d.x + ${(BESIDE_BACK - 1).toFixed(1)}, d.x + ${BESIDE_BACK.toFixed(1)}, clip.w);
    occ = max(occ, inX * inY * near * step(d.y - 1.5, p.y));
  }
  return occ;
}
/**
 * 0 = solid, 1 = gone, for a point p standing for something \`pad\` metres round (a canopy's reach): on the line
 * from the camera to a focus point and in front of it, in front of the action's screen box, or against the lens.
 */
float occFront(float d, float s, float L, float pad) {
  // Round 14: in front of the fisher by a metre or more (it was 86-93 % of the way, so from 25 m out a
  // tower mast 3 m in front of a fisher stood solid over him, session 184 s).
  return (1.0 - smoothstep(3.0, 5.5, d)) * step(0.6, s) * (1.0 - smoothstep(L - 1.8, L - 0.8, s - pad * 0.5));
}
/** In front of the action's screen box (the foreground band) or against the lens. */
float occScreen(vec3 p, float pad) {
  vec4 clip = uVP * vec4(p, 1.0);
  float vz = clip.w - pad;
  vec2 sc = clip.xy / max(abs(clip.w), 1e-3) * 0.5 + 0.5;
  // In front of the action and no higher on screen than its top (name tags): the whole foreground band
  // across the frame, so no canopy, rock or prop sits over the family or the water before them.
  float inBand = smoothstep(uBox.w + 0.06, uBox.w + 0.01, sc.y) * step(0.0, uBox.z - uBox.x);
  float occ = inBand * (1.0 - smoothstep(uNear - 3.0, uNear, vz)) * step(0.0, clip.w);
  // Never a trunk or canopy right against the lens, nor foreground clutter well in front of the family.
  return max(occ, (1.0 - smoothstep(7.0, 13.0, vz)) * step(-1.0, clip.w));
}
float occAt(vec3 p, float pad) {
  float occ = 0.0;
  for (int i = 0; i < ${MAX_FOCUS}; i++) {
    vec3 b = uFocus[i];
    if (b.y < -50.0) continue;
    vec3 ab = b - uCam;
    float L = max(length(ab), 1e-3);
    float s = clamp(dot(p - uCam, ab) / L, 0.0, L);
    occ = max(occ, occFront(max(0.0, length(p - (uCam + ab * (s / L))) - pad), s, L, pad));
  }
  return max(occ, occScreen(p, pad));
}
/** The same for a whole tree: its trunk axis from the foot F up H metres, padded by the canopy's reach. */
float occTree(vec3 F, float H, float pad) {
  float occ = 0.0;
  for (int i = 0; i < ${MAX_FOCUS}; i++) {
    vec3 b = uFocus[i];
    if (b.y < -50.0) continue;
    vec3 ab = b - uCam;
    float L = max(length(ab), 1e-3);
    vec3 u = ab / L;
    // Where the sight line passes nearest the axis seen from above, then the nearest height on the axis.
    float s = clamp(dot((F - uCam).xz, u.xz) / max(dot(u.xz, u.xz), 1e-4), 0.0, L);
    vec3 P = uCam + u * s;
    float h = clamp(P.y - F.y, 0.0, H);
    occ = max(occ, occFront(max(0.0, length(P - F - vec3(0.0, h, 0.0)) - pad), s, L, pad));
  }
  return max(occ, occScreen(F + vec3(0.0, 1.0, 0.0), pad));
}`;
/**
 * Round 14: an instanced tree (or post) fades as one thing, judged at its trunk axis padded by its canopy's
 * reach: worked out per vertex it left half-faded canopies and floating crowns over a trunk that had gone
 * (session 56 s and 108-111 s: a ghost of a teal tree across the shot). -1 = not instanced (per fragment).
 */
const OCC_INSTANCE = `
  #ifdef USE_INSTANCING
  {
    vec3 foot = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    float sy = length(instanceMatrix[1].xyz);
    float pad = 2.6 * length(instanceMatrix[0].xyz);
    float oi = occTree(foot, 9.0 * sy, pad);
    // Nearly all or nothing: a whole tree held half-faded is the same ghost (the ramp is short in space).
    vOccI = smoothstep(0.3, 0.7, oi);
  }
  #else
  vOccI = -1.0;
  #endif`;
const OCC_VERT_PARS = `varying vec3 vOccW;\nvarying float vOccI;\n${OCC_CORE}`;
const OCC_VERT = `
  vec4 occW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  occW = instanceMatrix * occW;
  #endif
  vOccW = (modelMatrix * occW).xyz;${OCC_INSTANCE}`;
const OCC_FRAG_PARS = `
varying vec3 vOccW;
varying float vOccI;
${OCC_CORE}
float occAmount() {
  return max(occBeside(vOccW), vOccI >= 0.0 ? vOccI : occAt(vOccW, 0.0));
}`;

function bindOcc(shader: { uniforms: Record<string, unknown> }, u: OccluderUniforms, beside = 0): void {
  shader.uniforms.uBeside = u.uBeside;
  shader.uniforms.uBesideD = u.uBesideD;
  shader.uniforms.uBesideK = { value: beside };
  shader.uniforms.uCam = u.uCam;
  shader.uniforms.uFocus = u.uFocus;
  shader.uniforms.uBox = u.uBox;
  shader.uniforms.uNear = u.uNear;
  shader.uniforms.uVP = u.uVP;
}

/** Adds the occluder fade to a compiling shader (see occluderMaterial); the material needs alphaToCoverage. */
export function applyOccluder(shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }, u: OccluderUniforms, beside = 0): void {
  bindOcc(shader, u, beside);
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
  diffuseColor.a *= occA;`,
    );
}

/**
 * Round 19: a dither fade for small things that stand between the camera and a fisher (foreground foxgloves,
 * crystal shards): per fragment, only what lies within 0.9-1.6 m of a sight line from the camera to a fisher's
 * body (three lines, low to high round each focus point) and at least 0.7 m in front of the fisher dissolves, by
 * alpha-to-coverage, so the rest of the foreground keeps framing the shot. The material needs alphaToCoverage.
 */
const SIGHT_GLSL = `
uniform vec3 uCam;
uniform vec3 uFocus[${MAX_FOCUS}];
varying vec3 vSfW;
float sightFade(vec3 p) {
  float occ = 0.0;
  for (int i = 0; i < ${MAX_FOCUS}; i++) {
    vec3 f = uFocus[i];
    if (f.y < -50.0) continue;
    for (int k = 0; k < 3; k++) {
      vec3 b = f + vec3(0.0, -0.8 + float(k) * 1.0, 0.0);
      vec3 ab = b - uCam;
      float L = max(length(ab), 1e-3);
      float s = dot(p - uCam, ab) / L;
      if (s < 0.5 || s > L - 0.7) continue;
      float d = length(p - (uCam + ab * (s / L)));
      occ = max(occ, 1.0 - smoothstep(0.9, 1.6, d));
    }
  }
  return occ;
}`;
export function applySightFade(shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }, u: OccluderUniforms): void {
  shader.uniforms.uCam = u.uCam;
  shader.uniforms.uFocus = u.uFocus;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vSfW;")
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>
  vec4 sfW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  sfW = instanceMatrix * sfW;
  #endif
  vSfW = (modelMatrix * sfW).xyz;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>${SIGHT_GLSL}`)
    .replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
  float sfA = 1.0 - sightFade(vSfW);
  if (sfA < 0.02) discard;`,
    )
    .replace("#include <alphatest_fragment>", "#include <alphatest_fragment>\n  diffuseColor.a *= sfA;");
}

/**
 * The occluder fade worked out per vertex (for small, many-layered leaf cards: the fade is smooth over
 * a card, and the fragment work stays light).
 */
export function applyOccluderPerVertex(shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }, u: OccluderUniforms): void {
  bindOcc(shader, u);
  const pars = OCC_FRAG_PARS.replace("varying vec3 vOccW;", "vec3 vOccW;").replace("varying float vOccI;", "float vOccI;");
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${pars}\nvarying float vOccA;`)
    .replace("#include <project_vertex>", `#include <project_vertex>${OCC_VERT}\n  vOccA = 1.0 - min(1.0, occAmount() * 1.25);`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vOccA;")
    .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n  if (vOccA < 0.02) discard;")
    .replace("#include <alphatest_fragment>", "#include <alphatest_fragment>\n  diffuseColor.a *= vOccA;");
}

/**
 * Painted material for trees and bushes that dissolve where they stand between the camera and the
 * action, so a canopy never hides a fisher.
 */
export function occluderMaterial(u: OccluderUniforms, beside = 0): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  const scale = { value: 1 };
  // Round 25: `beside` 1 (posts, lanterns, rails) also dissolves round a fisher's feet. Same program as the
  // trees (only a uniform differs), so no new shader.
  m.onBeforeCompile = (shader) => {
    applyOccluder(shader, u, beside);
    applyPaint(shader, scale);
  };
  m.alphaToCoverage = true;
  m.customProgramCacheKey = () => "bobber-occluder";
  return m;
}

/**
 * Unlit glow (lamp glass, lantern cages) that dissolves with the occluder fade, so a lamp between the
 * camera and a fisher goes entirely (round 10: the glass stayed, floating, where its post had gone).
 * One program for every instance (each keeps its own colour for the time of day).
 */
export function occluderGlowMaterial(u: OccluderUniforms, opts: { vertexColors?: boolean; color?: number } = {}): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ vertexColors: opts.vertexColors ?? true, color: opts.color ?? 0xffffff });
  // Lamp glass and lantern cages go with their posts (round 25: round a fisher's feet too).
  m.onBeforeCompile = (shader) => applyOccluder(shader, u, 1);
  m.alphaToCoverage = true;
  m.customProgramCacheKey = () => "bobber-occluder-glow";
  return m;
}

/** The scene's fade materials, for builders that make lamps and posts (registered once by the scene). */
let fadeSolid: Material | null = null;
let fadeUniforms: OccluderUniforms | null = null;
/** `solid`: the posts' material (round 25: one made with `beside`, so posts also clear round a fisher's feet). */
export function registerFade(solid: Material, u: OccluderUniforms): void {
  fadeSolid = solid;
  fadeUniforms = u;
}
/** The scene's occluder uniforms (null when no scene registered them), for builders that add a fade of their own. */
export function sceneOccluderUniforms(): OccluderUniforms | null {
  return fadeUniforms;
}
/** The dissolving painted material for lamp posts and the like (`fallback` when no scene registered one). */
export function fadeMaterial(fallback: Material): Material {
  return fadeSolid ?? fallback;
}
/** A dissolving glow material (a plain one when no scene registered the fade). */
export function fadeGlowMaterial(opts: { vertexColors?: boolean; color?: number } = {}): MeshBasicMaterial {
  if (fadeUniforms) return occluderGlowMaterial(fadeUniforms, opts);
  return new MeshBasicMaterial({ vertexColors: opts.vertexColors ?? true, color: opts.color ?? 0xffffff });
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

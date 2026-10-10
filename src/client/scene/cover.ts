import { Matrix4, Mesh, Points, Line, Vector3, Vector4, type Camera, type Material, type Object3D } from "three";

/**
 * Round 21: nothing between the camera and a fisher, generally. Earlier rounds faded one class of
 * occluder at a time (trees, posts, foxgloves, crystals) and every class they missed broke the veto
 * (round 20: hanging wisteria over Dad through the catch push-ins, a lantern post through Juneau). Now
 * every scenery material in the scene takes this fade by default (`coverScene`, run before the shader
 * prewarm and on whatever the streams build later); only subtrees marked `userData.coverExempt` (the
 * fishers themselves, ground, water, sky, effects, the vehicle the family rides) keep their look.
 *
 * Per fragment: anything inside a fisher's screen box, more than ~half a metre nearer the lens than
 * that fisher and above their feet (decks and paths they stand on stay), and anything in the near band
 * well in front of the nearest fisher (a push-in), dithers away to `uCovKeep` (0.15) of its pixels.
 */
export const COVER_MAX = 5;
export type CoverUniforms = {
  /** Screen box (0..1, x0 y0 x1 y1, y up) of each fisher's body; x0 > x1 = unused. */
  uCovBox: { value: Vector4[] };
  /** Per fisher: view depth of the chest (metres), feet height, view depth per metre up. */
  uCovFish: { value: Vector4[] };
  /** Near band: fully gone nearer than x, solid past y (view metres); z = the lowest feet (floors stay). */
  uCovNear: { value: Vector3 };
  uCovVP: { value: Matrix4 };
  /** Share of a covering surface's pixels kept (0.15; the lab's cover check sets 0). */
  uCovKeep: { value: number };
};

export function makeCoverUniforms(): CoverUniforms {
  return {
    uCovBox: { value: Array.from({ length: COVER_MAX }, () => new Vector4(1, 1, 0, 0)) },
    uCovFish: { value: Array.from({ length: COVER_MAX }, () => new Vector4(0, -100, 0, 0)) },
    uCovNear: { value: new Vector3(0, 0.001, -100) },
    uCovVP: { value: new Matrix4() },
    uCovKeep: { value: 0.15 },
  };
}

/** Body extent round a fisher's feet: half width, top (above the feet; hat included), bottom. */
const BODY_HALF = 0.5;
const BODY_TOP = 2.3;
const BODY_BOTTOM = -0.05;
const tmp = new Vector3();
const vp = new Matrix4();

/**
 * Sets the fade's per-frame state from the camera and the fishers' feet. The near band: gone nearer than
 * 0.42 of the nearest fisher's depth, solid past 0.62 of it (clamped to 2.5-7 m and 4-11 m), so a push-in
 * clears hanging strands and drapes across the frame and the wide shot keeps the round-11 lens rule.
 */
export function setCoverFishers(u: CoverUniforms, cam: Camera, feet: readonly { x: number; y: number; z: number }[]): void {
  cam.updateMatrixWorld();
  vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  u.uCovVP.value.copy(vp);
  // How view depth changes per metre up (negative when the camera looks down).
  const fwdY = -cam.matrixWorld.elements[9]!;
  let nearest = Infinity;
  let floor = Infinity;
  let n = 0;
  for (const f of feet) {
    if (n >= COVER_MAX) break;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let ok = true;
    for (let k = 0; k < 8; k++) {
      tmp.set(f.x + (k & 1 ? BODY_HALF : -BODY_HALF), f.y + (k & 2 ? BODY_TOP : BODY_BOTTOM), f.z + (k & 4 ? BODY_HALF : -BODY_HALF)).applyMatrix4(cam.matrixWorldInverse);
      if (-tmp.z < 0.1) { ok = false; break; }
      tmp.applyMatrix4(cam.projectionMatrix);
      const sx = tmp.x * 0.5 + 0.5;
      const sy = tmp.y * 0.5 + 0.5;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    if (!ok) continue;
    const depth = -tmp.set(f.x, f.y + 1.1, f.z).applyMatrix4(cam.matrixWorldInverse).z;
    u.uCovBox.value[n]!.set(x0, y0, x1, y1);
    u.uCovFish.value[n]!.set(depth, f.y, fwdY, 0);
    nearest = Math.min(nearest, depth);
    floor = Math.min(floor, f.y);
    n++;
  }
  for (let i = n; i < COVER_MAX; i++) {
    u.uCovBox.value[i]!.set(1, 1, 0, 0);
    u.uCovFish.value[i]!.set(0, -100, 0, 0);
  }
  if (n === 0) u.uCovNear.value.set(0, 0.001, -100);
  else u.uCovNear.value.set(Math.min(7, Math.max(2.5, nearest * 0.42)), Math.min(11, Math.max(4, nearest * 0.62)), floor);
}

const COVER_PARS = `
uniform vec4 uCovBox[${COVER_MAX}];
uniform vec4 uCovFish[${COVER_MAX}];
uniform vec3 uCovNear;
uniform float uCovKeep;
varying vec3 vCovW;
varying vec4 vCovClip;
const float COV_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float covAmount(vec3 p, vec4 clip) {
  if (clip.w <= 0.05) return 0.0;
  vec2 sc = clip.xy / clip.w * 0.5 + 0.5;
  float occ = 0.0;
  for (int i = 0; i < ${COVER_MAX}; i++) {
    vec4 b = uCovBox[i];
    if (b.z < b.x) continue;
    vec4 f = uCovFish[i];
    float inX = smoothstep(b.x - 0.014, b.x + 0.002, sc.x) * (1.0 - smoothstep(b.z - 0.002, b.z + 0.014, sc.x));
    float inY = smoothstep(b.y - 0.014, b.y + 0.002, sc.y) * (1.0 - smoothstep(b.w - 0.002, b.w + 0.014, sc.y));
    // The fisher's own depth at this height (a camera looking down sees the feet deeper than the chest).
    float fd = f.x + (clamp(p.y, f.y, f.y + ${BODY_TOP.toFixed(2)}) - f.y - 1.1) * f.z;
    float front = 1.0 - smoothstep(fd + 0.2, fd + 0.5, clip.w);
    float up = smoothstep(f.y + 0.02, f.y + 0.07, p.y);
    occ = max(occ, inX * inY * front * up);
  }
  float nearOcc = (1.0 - smoothstep(uCovNear.x, uCovNear.y, clip.w)) * smoothstep(uCovNear.z + 0.12, uCovNear.z + 0.28, p.y);
  return max(occ, nearOcc);
}`;
const COVER_FRAG = `
  {
    float cov = covAmount(vCovW, vCovClip);
    if (cov > 0.0) {
      ivec2 cq = ivec2(mod(gl_FragCoord.xy, 4.0));
      float th = (COV_BAYER[cq.x + cq.y * 4] + 0.5) / 16.0;
      if (th >= 1.0 - cov * (1.0 - uCovKeep)) discard;
    }
  }`;
const COVER_VERT = `
  {
    vec4 covP = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
    covP = instanceMatrix * covP;
    #endif
    vCovW = (modelMatrix * covP).xyz;
    // Clip position is linear in world space, so it interpolates exactly (one matrix per vertex, not per pixel).
    vCovClip = uCovVP * vec4(vCovW, 1.0);
  }`;

type Shader = { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string };
const ANCHORS = { vc: "#include <common>", vp: "#include <project_vertex>", fc: "#include <common>", fp: "#include <clipping_planes_fragment>" };

/** Adds the fade to a compiling shader that has three's standard chunks (others are left as they are). */
export function applyCover(shader: Shader, u: CoverUniforms): void {
  const v = shader.vertexShader;
  const f = shader.fragmentShader;
  if (!v.includes(ANCHORS.vc) || !v.includes(ANCHORS.vp) || !f.includes(ANCHORS.fc) || !f.includes(ANCHORS.fp)) return;
  shader.uniforms.uCovBox = u.uCovBox;
  shader.uniforms.uCovFish = u.uCovFish;
  shader.uniforms.uCovNear = u.uCovNear;
  shader.uniforms.uCovVP = u.uCovVP;
  shader.uniforms.uCovKeep = u.uCovKeep;
  shader.vertexShader = v.replace(ANCHORS.vc, `${ANCHORS.vc}\nuniform mat4 uCovVP;\nvarying vec3 vCovW;\nvarying vec4 vCovClip;`).replace(ANCHORS.vp, `${ANCHORS.vp}${COVER_VERT}`);
  shader.fragmentShader = f.replace(ANCHORS.fc, `${ANCHORS.fc}${COVER_PARS}`).replace(ANCHORS.fp, `${ANCHORS.fp}${COVER_FRAG}`);
}

type Hook = Material["onBeforeCompile"];
type Original = { hook: Hook; key: () => string };
/** Patched materials -> their own compile hook and program key (for the exempt twins). */
const originals = new WeakMap<Material, Original>();
/** Exempt twins of patched materials, by source. */
const twins = new WeakMap<Material, Material>();
const twinSet = new WeakSet<Material>();

export function isCoverPatched(m: Material | Material[]): boolean {
  return !Array.isArray(m) && originals.has(m);
}

/** Wraps a material's compile hook with the fade (once); its program key becomes its own key + "|cover". */
export function patchCover(m: Material, u: CoverUniforms): void {
  if (originals.has(m) || twinSet.has(m)) return;
  const hook = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  originals.set(m, { hook, key: () => key });
  const wrapped: Hook = function (this: Material, shader, renderer) {
    hook.call(this, shader, renderer);
    applyCover(shader, u);
  };
  m.onBeforeCompile = wrapped;
  m.customProgramCacheKey = () => `${key}|cover`;
  m.needsUpdate = true;
}

/** An unpatched copy of a patched material (same program as before the patch), one per source. */
function twinOf(m: Material): Material {
  const known = twins.get(m);
  if (known) return known;
  const o = originals.get(m);
  const c = m.clone();
  if (o) {
    c.onBeforeCompile = o.hook;
    c.customProgramCacheKey = o.key;
  }
  twins.set(m, c);
  twinSet.add(c);
  return c;
}

type Drawn = Mesh | Points | Line;
const drawn = (o: Object3D): o is Drawn => o instanceof Mesh || o instanceof Points || o instanceof Line;

/**
 * Gives every drawn object under `root` the fade, except subtrees marked `userData.coverExempt`, whose
 * objects get an unpatched twin of any material they share with the scenery. Cheap enough to run every
 * frame (patched materials are skipped), so nothing a stream builds ever draws unfaded.
 */
export function coverScene(root: Object3D, u: CoverUniforms, exempt = false): void {
  const ex = exempt || root.userData.coverExempt === true;
  if (drawn(root)) {
    const mat = root.material;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i++) {
        const m = mat[i]!;
        if (ex) { if (originals.has(m)) mat[i] = twinOf(m); } else patchCover(m, u);
      }
    } else if (ex) {
      if (originals.has(mat)) root.material = twinOf(mat);
    } else patchCover(mat, u);
  }
  for (const c of root.children) coverScene(c, u, ex);
}

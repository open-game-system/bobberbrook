import { MeshBasicMaterial } from "three";
import type { PaintTex } from "./paintkit";
import { applySightFade, sceneOccluderUniforms } from "./geo";

/**
 * Painted crystal (round 12): the crystals are unlit glow (vertex colours: a deep root to a pale tip and
 * an inner glow band), so the Codex crystal texture rides on them as an emissive gradient map: projected
 * on the facets from the side (world zy and xy, blended by facing), it paints light and fracture
 * lines across every facet over the shard's own colour. One program for every place's crystals.
 */
let tex: PaintTex | null = null;
export function setCrystalTexture(t: PaintTex | null): void {
  tex = t;
}

/** How much of the painted facet value shows (the shard's hue stays its own). */
const STRENGTH = 0.8;

export function crystalMaterial(): MeshBasicMaterial {
  const t = tex;
  const m = new MeshBasicMaterial({ vertexColors: true });
  if (!t) return m;
  // Round 19: a shard between the camera and a fisher dissolves round the sight line (biome-crystal).
  const occ = sceneOccluderUniforms();
  if (occ) m.alphaToCoverage = true;
  m.onBeforeCompile = (shader) => {
    if (occ) applySightFade(shader, occ);
    shader.uniforms.tCrystal = { value: t.tex };
    shader.uniforms.uCrystalInv = { value: t.inv };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCrWp;\nvarying vec3 vCrN;")
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
  vec4 crWp = modelMatrix * vec4(transformed, 1.0);
  vCrWp = crWp.xyz;
  vCrN = normalize(mat3(modelMatrix) * normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D tCrystal;\nuniform vec3 uCrystalInv;\nvarying vec3 vCrWp;\nvarying vec3 vCrN;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec3 n = normalize(vCrN);
    // Two side projections blended by the facet's facing (world xz is far from the origin, so the
    // projection axes stay fixed: a facet-relative axis would swing with the smooth normal).
    vec2 w = pow(abs(n.xz), vec2(4.0));
    w /= (w.x + w.y + 1e-4);
    // Round 20: 1.3 repeats a metre tiled the painted fractures into an obvious zig-zag up a 12 m spire
    // (far-place): two scales (0.42 and 0.17 a metre, the second turned and offset) averaged, so no
    // repeat lines up along a facet.
    vec2 pa = vCrWp.zy;
    vec2 pb = vCrWp.xy;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    vec3 d1 = texture2D(tCrystal, pa * 0.42).rgb * w.x + texture2D(tCrystal, pb * 0.42 + 0.37).rgb * w.y;
    vec3 d2 = texture2D(tCrystal, rot * pa * 0.17 + 0.61).rgb * w.x + texture2D(tCrystal, rot * pb * 0.17 + 0.13).rgb * w.y;
    vec3 d = (d1 * 0.55 + d2 * 0.45) * uCrystalInv;
    float l = dot(d, vec3(0.3, 0.55, 0.15));
    // A soft value range: the facets read painted, never dark blotches on a glowing shard.
    vec3 pd = clamp(mix(vec3(l), d, 0.4), 0.6, 1.7);
    diffuseColor.rgb *= mix(vec3(1.0), pd, ${STRENGTH.toFixed(2)});
  }`,
      );
  };
  m.customProgramCacheKey = () => (occ ? "bobber-crystal-sight" : "bobber-crystal");
  return m;
}

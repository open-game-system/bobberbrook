import { BufferGeometry, MeshLambertMaterial, type Material } from "three";
import { applyOccluder, merge, type OccluderUniforms } from "./geo";
import { PAINT_GLSL, type PaintTex } from "./paintkit";

/**
 * Painted bark and rock: the kit's bark and rock textures laid over the vertex colours as detail, in
 * object space (before instancing), so the brushwork sticks to each trunk and boulder and scales with it.
 * Rock: triplanar. Bark: two vertical planes, so the grain always runs up the trunk and never seams.
 *
 * A geometry says what it is made of by registering here; `instanced()` then draws a rock with the
 * rock material, and a barked tree (two groups: bark first, the rest second) with [bark, its material].
 */

export type SurfaceKind = "rock" | "barked" | "tiled";
const kinds = new WeakMap<BufferGeometry, SurfaceKind>();
let mats: { rock: Material; bark: Material; tiles: Material } | null = null;

export function setSurfaceMaterials(m: { rock: Material; bark: Material; tiles: Material } | null): void {
  mats = m;
}
export function markRock(g: BufferGeometry): BufferGeometry {
  kinds.set(g, "rock");
  return g;
}
/** Merges bark parts and the rest into one geometry with two groups (bark = group 0). */
export function barked(bark: BufferGeometry[], rest: BufferGeometry[]): BufferGeometry {
  const b = merge(bark);
  const r = merge(rest);
  const g = mergeGroups(b, r);
  kinds.set(g, "barked");
  return g;
}
/** Merges paved stone parts and the rest (two groups: stone tiles first). */
export function tiled(stone: BufferGeometry[], rest: BufferGeometry[]): BufferGeometry {
  const g = mergeGroups(merge(stone), merge(rest));
  kinds.set(g, "tiled");
  return g;
}
function mergeGroups(a: BufferGeometry, b: BufferGeometry): BufferGeometry {
  const g = merge([a, b]);
  g.clearGroups();
  const na = a.getAttribute("position").count;
  const nb = b.getAttribute("position").count;
  g.addGroup(0, na, 0);
  g.addGroup(na, nb, 1);
  return g;
}

/** The material (or materials) a geometry draws with, given the one its builder asked for. */
export function surfaceMaterial(g: BufferGeometry, asked: Material): Material | Material[] {
  const k = kinds.get(g);
  if (!k || !mats) return asked;
  if (k === "rock") return mats.rock;
  return [k === "barked" ? mats.bark : mats.tiles, asked];
}

const OBJ_VERT_PARS = "varying vec3 vObjP;\nvarying vec3 vObjN;";
const OBJ_VERT = `
  vObjP = position;
  vObjN = objectNormal;`;

function objectSpace(shader: { vertexShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${OBJ_VERT_PARS}`)
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>${OBJ_VERT}`);
}

/** Boulders, cliffs and shore stones: triplanar painted rock. */
export function rockMaterial(tex: PaintTex): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tRock = { value: tex.tex };
    shader.uniforms.iRock = { value: tex.inv };
    objectSpace(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform sampler2D tRock;\nuniform vec3 iRock;\n${OBJ_VERT_PARS}\n${PAINT_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec3 w = abs(normalize(vObjN)); w = pow(w, vec3(3.0)); w /= (w.x + w.y + w.z);
    vec3 p = vObjP * 0.55;
    vec3 t = texture2D(tRock, p.zy).rgb * w.x + texture2D(tRock, p.xy + 0.31).rgb * w.z + texture2D(tRock, p.xz + 0.67).rgb * w.y;
    diffuseColor.rgb *= mix(vec3(1.0), pkDetail(t, iRock, 0.65), 0.9);
  }`,
      );
  };
  m.customProgramCacheKey = () => "bobber-rock";
  return m;
}

/** Trunks, roots and branches: painted bark, grain running up, fading like the rest of the tree. */
export function barkMaterial(tex: PaintTex, occ: OccluderUniforms): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tBark = { value: tex.tex };
    shader.uniforms.iBark = { value: tex.inv };
    objectSpace(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform sampler2D tBark;\nuniform vec3 iBark;\n${OBJ_VERT_PARS}\n${PAINT_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec3 n = normalize(vObjN);
    float wx = n.x * n.x; float wz = n.z * n.z; float wy = n.y * n.y * 0.25;
    vec3 p = vObjP * vec3(0.7, 0.32, 0.7);
    vec3 t = (texture2D(tBark, p.zy).rgb * wx + texture2D(tBark, p.xy + 0.5).rgb * wz + texture2D(tBark, p.xz * 1.4).rgb * wy) / (wx + wz + wy + 1e-4);
    diffuseColor.rgb *= mix(vec3(1.0), pkDetail(t, iBark, 0.7), 0.9);
  }`,
      );
    applyOccluder(shader, occ);
  };
  m.alphaToCoverage = true;
  m.customProgramCacheKey = () => "bobber-bark";
  return m;
}

/** Paved stone (tower dais, landings): painted stone tiles on top, the same stone down the sides. */
export function tilesMaterial(tex: PaintTex): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tTiles = { value: tex.tex };
    shader.uniforms.iTiles = { value: tex.inv };
    objectSpace(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform sampler2D tTiles;\nuniform vec3 iTiles;\n${OBJ_VERT_PARS}\n${PAINT_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec3 w = abs(normalize(vObjN)); w = pow(w, vec3(4.0)); w /= (w.x + w.y + w.z);
    vec3 p = vObjP * 0.42;
    vec3 t = texture2D(tTiles, p.zy).rgb * w.x + texture2D(tTiles, p.xy).rgb * w.z + texture2D(tTiles, p.xz).rgb * w.y;
    diffuseColor.rgb *= mix(vec3(1.0), pkDetail(t, iTiles, 0.6), 0.9);
  }`,
      );
  };
  m.customProgramCacheKey = () => "bobber-tiles";
  return m;
}

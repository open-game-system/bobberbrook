import { MeshLambertMaterial } from "three";
import { PAINT_GLSL, type PaintKit } from "./paintkit";

/**
 * The painted ground: grass everywhere, moss in patches and under the trees, worn path along trails,
 * banks and docks, rock on steep faces and the lakebed under water, all sampled in world space (no
 * UVs) and laid over the vertex colours as painted detail, so each biome keeps its tint and the
 * baked light variation. Per-vertex weights come from the `aSurf` attribute (moss, path, rock, bed).
 */
export function groundMaterial(kit: PaintKit): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: kit.grass.tex };
    shader.uniforms.tMoss = { value: kit.moss.tex };
    shader.uniforms.tPath = { value: kit.path.tex };
    shader.uniforms.tRock = { value: kit.rock.tex };
    shader.uniforms.tBed = { value: kit.bed.tex };
    shader.uniforms.iGrass = { value: kit.grass.inv };
    shader.uniforms.iMoss = { value: kit.moss.inv };
    shader.uniforms.iPath = { value: kit.path.inv };
    shader.uniforms.iRock = { value: kit.rock.inv };
    shader.uniforms.iBed = { value: kit.bed.inv };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 aSurf;
varying vec4 vSurf;
varying vec3 vGW;
varying vec3 vGN;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  vSurf = aSurf;
  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vGN = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D tGrass;
uniform sampler2D tMoss;
uniform sampler2D tPath;
uniform sampler2D tRock;
uniform sampler2D tBed;
uniform vec3 iGrass;
uniform vec3 iMoss;
uniform vec3 iPath;
uniform vec3 iRock;
uniform vec3 iBed;
varying vec4 vSurf;
varying vec3 vGW;
varying vec3 vGN;
${PAINT_GLSL}
/** Height-style blend: the weight bites into the base along the brush strokes, not as a soft smear. */
float pkBlend(float w, vec3 over) {
  return smoothstep(0.0, 1.0, clamp(w * 1.5 - 0.25 + (pkLum(over) - 0.45) * 0.9, 0.0, 1.0));
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec2 p = vGW.xz;
    vec3 g = pkDetail(pkTile(tGrass, p, 0.24), iGrass, 0.55);
    vec3 mo = pkDetail(pkTile(tMoss, p + 17.0, 0.2), iMoss, 0.5);
    vec3 pa = pkDetail(pkTile(tPath, p + 5.0, 0.26), iPath, 0.6);
    vec3 n = abs(normalize(vGN)); n /= (n.x + n.y + n.z);
    vec3 rk = pkDetail(texture2D(tRock, vGW.zy * 0.22).rgb * n.x + texture2D(tRock, vGW.xy * 0.22).rgb * n.z + texture2D(tRock, p * 0.22).rgb * n.y, iRock, 0.6);
    vec3 bd = pkDetail(pkTile(tBed, p, 0.18), iBed, 0.6);
    vec3 det = g;
    det = mix(det, mo, pkBlend(vSurf.x, mo));
    det = mix(det, pa, pkBlend(vSurf.y, pa));
    det = mix(det, rk, smoothstep(0.1, 0.6, vSurf.z));
    det = mix(det, bd, smoothstep(0.2, 0.8, vSurf.w));
    // Snow and pale frost ground keep a quieter brushwork (the grass sheet's flowers read as confetti on white).
    float pale = smoothstep(0.35, 0.8, pkLum(diffuseColor.rgb));
    det = mix(det, vec3(pkLum(det)), pale);
    diffuseColor.rgb *= mix(vec3(1.0), det, 0.85 - 0.6 * pale);
  }`,
      );
  };
  m.customProgramCacheKey = () => "bobber-ground";
  return m;
}

import { BufferAttribute, MeshLambertMaterial, type BufferGeometry } from "three";
import { applyPaint } from "./painter";

/**
 * Matte painted glow (round 09-B): mushrooms used to be unlit HDR colour (a glossy, vinyl read). Now
 * they are lit like everything else (Lambert, no specular, the painted brushwork, light baked into the
 * vertex colours) and only their rims glow: a per-vertex `aRim` weight times the material's `emissive`
 * (the night drives it) times the vertex and instance colour.
 */

/** Sets every vertex's glow weight (0 = matte, 1 = full rim glow). */
export function rim(g: BufferGeometry, fn: (x: number, y: number, z: number) => number): BufferGeometry {
  const pos = g.getAttribute("position");
  const a = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) a[i] = Math.max(0, Math.min(1, fn(pos.getX(i), pos.getY(i), pos.getZ(i))));
  g.setAttribute("aRim", new BufferAttribute(a, 1));
  return g;
}

export function matteGlowMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.emissive.setScalar(0.4);
  const scale = { value: 1 };
  m.onBeforeCompile = (shader) => {
    applyPaint(shader, scale);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aRim;\nvarying float vRim;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vRim = aRim;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vRim;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb * vRim;");
  };
  m.customProgramCacheKey = () => "bobber-matte-glow";
  return m;
}

import { BufferAttribute, type BufferGeometry, ClampToEdgeWrapping, DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, SRGBColorSpace, Vector3 } from "three";

/**
 * Painted giant mushroom caps (round 15): the Codex cap-teal / cap-violet paintings laid on each cap from
 * above (planar, one painting per cap, never tiled) and the radial gills painting fanned out under it. The
 * caps stay unlit glow: the painting's light spots, crown and rim carry the light over the cap's colour.
 * One program for every Hollow's caps (a shared material, never disposed with a place).
 */

export const CAP_LAYER = { teal: 0, violet: 1, gills: 2 } as const;
type CapLayer = (typeof CAP_LAYER)[keyof typeof CAP_LAYER];
const LAYERS = 3;
const S = 512;
/** The cap's rim lands just inside the painting's edge. */
const RIM = 0.48;

export function capLayerOf(hue: number): CapLayer {
  return hue < 0.62 ? CAP_LAYER.teal : CAP_LAYER.violet;
}

/** Top-down texture coordinates for a cap built round the y axis (radius capR): aCap = (u, v, layer). */
export function capUV(g: BufferGeometry, capR: number, layer: CapLayer): BufferGeometry {
  const pos = g.getAttribute("position");
  const a = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    a[i * 3] = 0.5 + (pos.getX(i) / capR) * RIM;
    a[i * 3 + 1] = 0.5 + (pos.getZ(i) / capR) * RIM;
    a[i * 3 + 2] = layer;
  }
  g.setAttribute("aCap", new BufferAttribute(a, 3));
  return g;
}

/**
 * The gills: the painting is a fan of gills from its bottom centre up to an arc. Round the cap the fan is laid
 * four times, mirrored each time (no seam), from the stem (radius r0) to the cap's edge (r1).
 */
export function gillUV(g: BufferGeometry, r0: number, r1: number): BufferGeometry {
  const pos = g.getAttribute("position");
  const a = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const t = (Math.atan2(z, x) / (Math.PI * 2) + 1) * 4;
    const tri = Math.abs((t % 2) - 1);
    const fan = (tri - 0.5) * 2 * 1.2;
    const k = Math.min(1, Math.max(0, (Math.hypot(x, z) - r0) / Math.max(1e-6, r1 - r0)));
    const rr = 0.06 + 0.86 * k;
    a[i * 3] = Math.min(1, Math.max(0, 0.5 + Math.sin(fan) * rr));
    a[i * 3 + 1] = Math.min(1, Math.max(0, 0.98 - Math.cos(fan) * rr));
    a[i * 3 + 2] = CAP_LAYER.gills;
  }
  g.setAttribute("aCap", new BufferAttribute(a, 3));
  return g;
}

export type CapImages = { teal?: CanvasImageSource; violet?: CanvasImageSource; gills?: CanvasImageSource };
let images: CapImages = {};
export function setCapImages(i: CapImages): void {
  images = i;
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function capArray(): { tex: DataArrayTexture; inv: Vector3[] } {
  const inv: Vector3[] = [];
  const order = [images.teal, images.violet, images.gills];
  const cv = typeof document === "undefined" ? null : document.createElement("canvas");
  const ctx = cv ? ((cv.width = S), (cv.height = S), cv.getContext("2d", { willReadFrequently: true })) : null;
  const size = ctx ? S : 1;
  const data = new Uint8Array(size * size * 4 * LAYERS).fill(255);
  order.forEach((im, l) => {
    if (!ctx || !im) {
      inv.push(new Vector3(1, 1, 1));
      return;
    }
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(im, 0, 0, S, S);
    const px = ctx.getImageData(0, 0, S, S).data;
    data.set(px, l * S * S * 4);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 64) {
      r += lin(px[i]! / 255);
      g += lin(px[i + 1]! / 255);
      b += lin(px[i + 2]! / 255);
      n++;
    }
    inv.push(new Vector3(n / Math.max(r, 1e-3), n / Math.max(g, 1e-3), n / Math.max(b, 1e-3)));
  });
  const tex = new DataArrayTexture(data, size, size, LAYERS);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { tex, inv };
}

let shared: MeshBasicMaterial | null = null;

/** The caps' glow material (vertex colours x the painting over its mean colour x the glow in `color`). */
export function capMaterial(): MeshBasicMaterial {
  if (shared) return shared;
  const m = new MeshBasicMaterial({ vertexColors: true });
  const arr = capArray();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tCap = { value: arr.tex };
    shader.uniforms.iCap = { value: arr.inv };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aCap;\nvarying vec3 vCap;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vCap = aCap;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform highp sampler2DArray tCap;\nuniform vec3 iCap[${LAYERS}];\nvarying vec3 vCap;\nfloat gcH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\nfloat gcN(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gcH(i), gcH(i + vec2(1.0, 0.0)), f.x), mix(gcH(i + vec2(0.0, 1.0)), gcH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    int li = int(vCap.z + 0.5);
    vec3 d = texture(tCap, vCap).rgb * iCap[li];
    float l = dot(d, vec3(0.3, 0.55, 0.15));
    if (li != ${CAP_LAYER.gills}) {
      // Round 25 (round 24 critic: "glossy vinyl domes", hollow.png): a matte, dry cap. The paintings carry a
      // baked starburst and pale radial streaks that read as a highlight on a shiny dome: most of the painting's
      // broad light is divided out (its blurred value, a high mip) and its brushwork kept, with fine mottling,
      // fewer chalky warts, a darker band in from the rim, a dark lip at the edge and a ceiling on the value.
      // The broad blotches are painted in the vertex colours (object space, landmarks.ts giantMushroom).
      float rho = length(vCap.xy - 0.5) / ${RIM.toFixed(2)};
      vec3 blur = textureLod(tCap, vCap, 5.0).rgb * iCap[li];
      float lb = max(0.3, dot(blur, vec3(0.3, 0.55, 0.15)));
      // The painting's broad light mostly divided out (its starburst and streaks), its brushwork and hue kept.
      vec3 base = mix(d, d / lb, 0.7);
      // Fine mottling in the painting's space (the broad blotches are in the vertex colours, object space).
      float m2 = gcN(vCap.xy * 23.0 + 1.7);
      float m3 = gcN(vCap.xy * 9.0 + 7.3);
      base *= 0.8 + 0.25 * m3 + 0.12 * (m2 - 0.5);
      // Warts: the painting's big pale spots (vinyl decals at TV distance) painted over in the cap's local colour,
      // only their cores kept as small chalky dabs, edges broken by the fine noise.
      // The cap's own colour: the painting's mean (iCap is 1 / mean), at a mid value.
      vec3 under = vec3(1.0) / iCap[li];
      under *= 0.85 / max(0.02, dot(under, vec3(0.3, 0.55, 0.15)));
      base = mix(base, under * (0.8 + 0.25 * m3), smoothstep(1.05, 1.35, l));
      float spot = smoothstep(1.75, 2.0, l + 0.35 * (m2 - 0.5)) * (1.0 - smoothstep(0.75, 0.95, rho));
      base = mix(base, mix(vec3(dot(under, vec3(0.3, 0.55, 0.15))), under, 0.45) * 1.15, spot * 0.65);
      // A darker band in from the rim and a dark lip at the very edge (the cap's thickness).
      base *= mix(1.0, 0.62, smoothstep(0.72, 0.92, rho));
      base *= mix(1.0, 0.45, smoothstep(0.96, 1.02, rho));
      // Matte: never brighter than the painting's mid-tones (bright smooth areas read as gloss).
      float lbase = dot(base, vec3(0.3, 0.55, 0.15));
      base *= min(1.0, 1.05 / max(lbase, 1e-3));
      d = base * 0.88;
    } else {
      // Round 25: the gills darker and in deeper relief (the painting's lines pushed apart), shadowed toward
      // the stem, so the underside reads as gills under the rim.
      float lg = dot(d, vec3(0.3, 0.55, 0.15));
      d = mix(vec3(lg), d, 0.4) * mix(0.55, 1.15, smoothstep(0.7, 1.3, lg));
      d *= mix(0.55, 1.0, smoothstep(0.1, 0.6, length(vCap.xy - vec2(0.5, 0.98))));
    }
    diffuseColor.rgb *= clamp(d, 0.22, 2.2);
  }`,
      );
  };
  m.customProgramCacheKey = () => "bobber-giant-cap";
  shared = m;
  return m;
}

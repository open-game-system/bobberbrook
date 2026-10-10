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
      .replace("#include <common>", `#include <common>\nuniform highp sampler2DArray tCap;\nuniform vec3 iCap[${LAYERS}];\nvarying vec3 vCap;`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    int li = int(vCap.z + 0.5);
    vec3 d = texture(tCap, vCap).rgb * iCap[li];
    float l = dot(d, vec3(0.3, 0.55, 0.15));
    // Caps keep the painting's own hues (teal, violet, pale spots); the gills take the cap's hue, the
    // painting's value and a little of its colour.
    d = li == ${CAP_LAYER.gills} ? mix(vec3(l), d, 0.4) : d;
    if (li != ${CAP_LAYER.gills}) {
      // Round 16: painted at TV distance. The streaks' value contrast pushed (mid-tones apart), the pale
      // spots held down a little (flat white dabs), a darker band inside the rim, and the brightest
      // radial strokes glow as veins.
      float rho = length(vCap.xy - 0.5) / ${RIM.toFixed(2)};
      float spot = smoothstep(1.25, 1.75, l);
      vec3 dc = pow(max(d, vec3(0.0)), vec3(1.7));
      // Round 18: the pale spots sit lower still and lean to the cap's own colour (bright dabs read as glare).
      d = mix(dc, mix(vec3(l), d, 0.6) * 0.66, spot);
      float vein = smoothstep(1.05, 1.35, l) * (1.0 - spot) * smoothstep(0.15, 0.5, rho);
      d *= 1.0 + 0.55 * vein;
      d *= mix(1.0, 0.52, smoothstep(0.7, 0.9, rho) * (1.0 - smoothstep(0.95, 1.02, rho)));
      // Round 18: the planar painting stretches its pale spots into long streaks down the cap's steep side,
      // which read as glare on a glossy dome: toward the rim the pale strokes settle into the cap's colour.
      d = mix(d, vec3(0.5), smoothstep(0.45, 0.8, rho) * smoothstep(1.0, 1.4, l) * 0.9);
    }
    diffuseColor.rgb *= clamp(d, 0.22, 2.2);
  }`,
      );
  };
  m.customProgramCacheKey = () => "bobber-giant-cap";
  shared = m;
  return m;
}

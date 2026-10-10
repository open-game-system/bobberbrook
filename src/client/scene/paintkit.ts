import { DataTexture, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader, Vector3, LinearMipmapLinearFilter, LinearFilter } from "three";

/**
 * The hand-painted texture kit (public/art/textures, one Codex sheet): seamless grass, moss, path,
 * bark, rock, stone tiles and lakebed, and two RGBA leaf cards. Each texture also carries its mean
 * colour (linear), so a shader can use it as painted detail over the vertex colours (tex / mean keeps
 * the brushwork and the texture's own hue shifts, the vertex colours keep each biome's palette).
 */

export type PaintTex = { tex: Texture; /** 1 / mean colour (linear), per channel. */ inv: Vector3 };

export type PaintKit = {
  grass: PaintTex;
  moss: PaintTex;
  path: PaintTex;
  bark: PaintTex;
  rock: PaintTex;
  tiles: PaintTex;
  bed: PaintTex;
  leavesViolet: PaintTex;
  leavesFern: PaintTex;
  /** Round 11 (kit part 2): surfaces painted into the prop texture array (painter.ts setPaintImages). */
  planks: PaintTex;
  canvas: PaintTex;
  shingles: PaintTex;
  runestone: PaintTex;
  snow: PaintTex;
  /** RGBA cards (keyed off black). */
  flameA: PaintTex;
  flameB: PaintTex;
  embers: PaintTex;
  cloudA: PaintTex;
  cloudB: PaintTex;
  poolWarm: PaintTex;
  /** Round 12 (kit part 3): needle sprays, leaf variants, wisteria, plant cards, glow-caps, cool pool, embers bed, crystal, ground. */
  pineSpray: PaintTex;
  pineSnow: PaintTex;
  leavesGlow: PaintTex;
  leavesTeal: PaintTex;
  wisteria: PaintTex;
  foxglove: PaintTex;
  fern: PaintTex;
  bluebell: PaintTex;
  grassCard: PaintTex;
  glowcapBlue: PaintTex;
  glowcapViolet: PaintTex;
  poolCool: PaintTex;
  embersLogs: PaintTex;
  crystal: PaintTex;
  forestFloor: PaintTex;
  glowMoss: PaintTex;
  /** Round 15 (kit part 3, the fishers): neutral cloth, felt, leather and knit (tinted per seat in code), rod wood. */
  quilt: PaintTex;
  felt: PaintTex;
  leather: PaintTex;
  knit: PaintTex;
  rodWood: PaintTex;
  /** Round 15: the giant mushrooms' cap paintings (top-down, radial) and gills (giantCap.ts). */
  capTeal: PaintTex;
  capViolet: PaintTex;
  gills: PaintTex;
  dispose(): void;
};

const ANISO = 8;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Mean colour of an image in linear light (alpha-weighted, so leaf cards average their leaves only). */
function meanOf(img: CanvasImageSource): Vector3 {
  const out = new Vector3(1, 1, 1);
  if (typeof document === "undefined") return out;
  const S = 32;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  ctx.drawImage(img, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]! / 255;
    if (a < 0.5) continue;
    r += srgbToLinear(d[i]! / 255) * a;
    g += srgbToLinear(d[i + 1]! / 255) * a;
    b += srgbToLinear(d[i + 2]! / 255) * a;
    w += a;
  }
  if (w <= 0) return out;
  return out.set(r / w, g / w, b / w);
}

function blank(): Texture {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

function setup(t: Texture): Texture {
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = ANISO;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

async function load(loader: TextureLoader, url: string): Promise<PaintTex> {
  try {
    const tex = setup(await loader.loadAsync(url));
    const img: unknown = tex.image;
    const mean = img instanceof HTMLImageElement || img instanceof ImageBitmap || img instanceof HTMLCanvasElement ? meanOf(img) : new Vector3(1, 1, 1);
    return { tex, inv: new Vector3(1 / Math.max(mean.x, 1e-3), 1 / Math.max(mean.y, 1e-3), 1 / Math.max(mean.z, 1e-3)) };
  } catch {
    // Missing art never breaks the scene: a white texel with mean 1 is "no detail".
    return { tex: setup(blank()), inv: new Vector3(1, 1, 1) };
  }
}

let shared: Promise<PaintKit> | null = null;

/** Loads the kit once per page (every material shares the same textures). */
export function loadPaintKit(base = "/art/textures/"): Promise<PaintKit> {
  if (shared) return shared;
  const loader = new TextureLoader();
  const files = {
    grass: "grass", moss: "moss", path: "path", bark: "bark", rock: "rock", tiles: "stone-tiles", bed: "lakebed", leavesViolet: "leaves-violet", leavesFern: "leaves-fern",
    planks: "planks", canvas: "canvas", shingles: "shingles", runestone: "runestone", snow: "snow", flameA: "flame-a", flameB: "flame-b", embers: "embers", cloudA: "cloud-a", cloudB: "cloud-b", poolWarm: "pool-warm",
    pineSpray: "pine-spray", pineSnow: "pine-snow", leavesGlow: "leaves-glow", leavesTeal: "leaves-teal", wisteria: "wisteria", foxglove: "foxglove", fern: "fern", bluebell: "bluebell", grassCard: "grass-card",
    glowcapBlue: "glowcap-blue", glowcapViolet: "glowcap-violet", poolCool: "pool-cool", embersLogs: "embers-logs", crystal: "crystal", forestFloor: "forest-floor", glowMoss: "glow-moss",
    quilt: "cloth-quilt", felt: "felt", leather: "leather", knit: "knit", rodWood: "rod-wood",
    capTeal: "cap-teal", capViolet: "cap-violet", gills: "gills",
  } as const;
  type Key = keyof typeof files;
  const p = async (): Promise<PaintKit> => {
    const keys = Object.keys(files).filter((k): k is Key => k in files);
    const loaded = await Promise.all(keys.map((k) => load(loader, `${base}${files[k]}.webp`)));
    const m = new Map<Key, PaintTex>();
    keys.forEach((k, i) => {
      const t = loaded[i];
      if (t) m.set(k, t);
    });
    const get = (k: Key): PaintTex => {
      const t = m.get(k);
      if (!t) throw new Error(`paint kit: missing texture ${k}`);
      return t;
    };
    return {
      grass: get("grass"), moss: get("moss"), path: get("path"), bark: get("bark"), rock: get("rock"), tiles: get("tiles"), bed: get("bed"), leavesViolet: get("leavesViolet"), leavesFern: get("leavesFern"),
      planks: get("planks"), canvas: get("canvas"), shingles: get("shingles"), runestone: get("runestone"), snow: get("snow"), flameA: get("flameA"), flameB: get("flameB"), embers: get("embers"),
      cloudA: get("cloudA"), cloudB: get("cloudB"), poolWarm: get("poolWarm"),
      pineSpray: get("pineSpray"), pineSnow: get("pineSnow"), leavesGlow: get("leavesGlow"), leavesTeal: get("leavesTeal"), wisteria: get("wisteria"), foxglove: get("foxglove"), fern: get("fern"),
      bluebell: get("bluebell"), grassCard: get("grassCard"), glowcapBlue: get("glowcapBlue"), glowcapViolet: get("glowcapViolet"), poolCool: get("poolCool"), embersLogs: get("embersLogs"),
      crystal: get("crystal"), forestFloor: get("forestFloor"), glowMoss: get("glowMoss"),
      quilt: get("quilt"), felt: get("felt"), leather: get("leather"), knit: get("knit"), rodWood: get("rodWood"),
      capTeal: get("capTeal"), capViolet: get("capViolet"), gills: get("gills"),
      dispose() {
        for (const t of m.values()) t.tex.dispose();
        shared = null;
      },
    };
  };
  shared = p();
  return shared;
}

/** GLSL helpers shared by the painted materials. */
export const PAINT_GLSL = /* glsl */ `
float pkH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float pkN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pkH(i), pkH(i + vec2(1.0, 0.0)), f.x), mix(pkH(i + vec2(0.0, 1.0)), pkH(i + vec2(1.0, 1.0)), f.x), f.y);
}
/** A tiling texture with its repeat broken: two rotated, offset samplings at different scales, chosen by slow noise. */
vec3 pkTile(sampler2D t, vec2 p, float s) {
  vec3 a = texture2D(t, p * s).rgb;
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p * s * 0.71 + vec2(0.37, 0.71);
  vec3 b = texture2D(t, q).rgb;
  float k = smoothstep(0.38, 0.62, pkN(p * 0.045 + 3.1) * 0.75 + pkN(p * 0.17) * 0.25);
  return mix(a, b, k);
}
float pkLum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
/** Painted detail: a texture over its own mean colour, partly desaturated so the vertex colour keeps the hue. */
vec3 pkDetail(vec3 tex, vec3 inv, float hue) {
  vec3 d = tex * inv;
  float l = pkLum(d);
  return clamp(mix(vec3(l), d, hue), 0.0, 2.4);
}
`;

/** The loaded image behind a kit texture (undefined for the blank stand-in), for drawing into a canvas. */
export function imageOf(t: PaintTex): CanvasImageSource | undefined {
  const img: unknown = t.tex.image;
  return img instanceof HTMLImageElement || img instanceof ImageBitmap || img instanceof HTMLCanvasElement ? img : undefined;
}

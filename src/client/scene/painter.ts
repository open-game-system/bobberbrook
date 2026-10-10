import { CanvasTexture, ClampToEdgeWrapping, Color, DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, Texture, Vector3, Vector4 } from "three";
import { rng } from "./noise";

/**
 * Hand-painted diffuse maps made in code (canvas 2D brushwork, painted at load): layered strokes with
 * jittered colour, baked top light and soft occlusion in the crevices, the way a WoW texture artist
 * paints wood, cloth and canvas. Every prop, vehicle and fisher draws its painted detail from one
 * texture array (one layer per surface kind), so a new kind costs no new program.
 */

/** Surface kinds (the texture-array layer; NONE = no painted detail, e.g. faces and glass). */
export const PK = { brush: 0, grain: 1, planks: 2, cloth: 3, canvas: 4, shingles: 5, runestone: 6, snow: 7, tiles: 8, rock: 9, moss: 10, quilt: 11, felt: 12, leather: 13, knit: 14, rodwood: 15, tent: 16, none: 17, skin: 18 } as const;
export type PaintKind = (typeof PK)[keyof typeof PK];
const LAYERS = 17;
/**
 * aPaint.x at or above this marks explicit texture coordinates (aPaint.yz) on layer x - PK_UV, instead of
 * the triplanar projection: boards that follow a curved boardwalk, one painted board per plank (round 13).
 */
export const PK_UV = 32;

/**
 * The character mask in the scene buffer's alpha (round 18). The world writes 1; a fisher writes 0 on the
 * face's features, `skin` on skin and `body` on everything else it wears. post.ts paints each by its own
 * amount (features never) and treats anything under `char` as a character in the knee and the grade.
 */
export const CHAR_MASK = { skin: 0.1, body: 0.22, char: 0.3 } as const;

/**
 * Round 11: the Codex-painted kit (public/art/textures) replaces the code-painted planks and canvas and
 * adds shingles, runestone and snow layers. Set before the first painted program compiles; a kind with no
 * image keeps its code painting (planks, canvas) or the generic brushwork.
 */
export type PaintImages = Partial<Record<"planks" | "canvas" | "shingles" | "runestone" | "snow" | "tiles" | "rock" | "moss" | "quilt" | "felt" | "leather" | "knit" | "rodwood" | "tent", CanvasImageSource>>;
let images: PaintImages = {};
export function setPaintImages(i: PaintImages): void {
  images = i;
}
const S = 512;

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;

function canvas(size = S): { cv: HTMLCanvasElement; ctx: Ctx } | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  return ctx ? { cv, ctx } : null;
}

const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))},${a})`;
const grey = (v: number, a = 1, warm = 0) => rgb(v * 255 + warm * 12, v * 255, v * 255 - warm * 12, a);

/** Draws fn at every wrapped copy that can touch the tile (seamless). */
function wrap(size: number, fn: (ox: number, oy: number) => void): void {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
}

/** A bristle stroke: a few parallel thin curves of one colour, tapered, along an angle. */
function stroke(ctx: Ctx, R: Rand, size: number, x: number, y: number, len: number, w: number, ang: number, col: string, bend = 0.15): void {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const nx = -dy;
  const ny = dx;
  const bristles = 2 + Math.floor(R() * 3);
  const bendO = (R() - 0.5) * 2 * bend * len;
  ctx.strokeStyle = col;
  ctx.lineCap = "round";
  for (let b = 0; b < bristles; b++) {
    const o = (b / Math.max(1, bristles - 1) - 0.5) * w;
    const lw = Math.max(0.6, (w / bristles) * (0.8 + R() * 0.8));
    const l0 = len * (R() * 0.12);
    const l1 = len * (1 - R() * 0.15);
    wrap(size, (ox, oy) => {
      const ax = x + ox + nx * o + dx * l0 - len * 0.5 * dx;
      const ay = y + oy + ny * o + dy * l0 - len * 0.5 * dy;
      const bx = x + ox + nx * o + dx * l1 - len * 0.5 * dx;
      const by = y + oy + ny * o + dy * l1 - len * 0.5 * dy;
      const minx = Math.min(ax, bx) - w - Math.abs(bendO);
      const maxx = Math.max(ax, bx) + w + Math.abs(bendO);
      const miny = Math.min(ay, by) - w - Math.abs(bendO);
      const maxy = Math.max(ay, by) + w + Math.abs(bendO);
      if (maxx < 0 || minx > size || maxy < 0 || miny > size) return;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2 + nx * bendO, (ay + by) / 2 + ny * bendO, bx, by);
      ctx.stroke();
    });
  }
}

/** A soft round dab (radial gradient), wrapped. */
function dab(ctx: Ctx, size: number, x: number, y: number, rx: number, ry: number, col: string, colEdge: string): void {
  wrap(size, (ox, oy) => {
    if (x + ox + rx < 0 || x + ox - rx > size || y + oy + ry < 0 || y + oy - ry > size) return;
    ctx.save();
    ctx.translate(x + ox, y + oy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, col);
    g.addColorStop(1, colEdge);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/** 0: generic painterly brushwork (soft blotches, short strokes in every direction). */
function paintBrush(ctx: Ctx, R: Rand): void {
  ctx.fillStyle = grey(0.6);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const v = 0.45 + R() * 0.3;
    dab(ctx, S, R() * S, R() * S, 40 + R() * 90, 30 + R() * 80, grey(v, 0.35, R() - 0.5), grey(v, 0));
  }
  for (let i = 0; i < 1400; i++) {
    const v = 0.42 + R() * 0.4;
    stroke(ctx, R, S, R() * S, R() * S, 14 + R() * 38, 4 + R() * 9, R() * Math.PI, grey(v, 0.16 + R() * 0.16, R() - 0.5), 0.25);
  }
}

/** Wood grain along u inside a band [y0, y1): long streaks, darker lines, a knot or two. */
function grainBand(ctx: Ctx, R: Rand, y0: number, y1: number, base: number, knots: number): void {
  const h = y1 - y0;
  for (let i = 0; i < h * 1.6; i++) {
    const v = base + (R() - 0.5) * 0.28;
    const y = y0 + R() * h;
    stroke(ctx, R, S, R() * S, y, 90 + R() * 320, 1.5 + R() * 4, (R() - 0.5) * 0.04, grey(v, 0.22 + R() * 0.2, 0.6), 0.02);
  }
  for (let i = 0; i < h * 0.25; i++) {
    const y = y0 + R() * h;
    stroke(ctx, R, S, R() * S, y, 120 + R() * 260, 0.8 + R() * 1.2, (R() - 0.5) * 0.03, grey(base * 0.55, 0.35, 0.8), 0.02);
  }
  for (let k = 0; k < knots; k++) {
    const x = R() * S;
    const y = y0 + h * (0.25 + R() * 0.5);
    const r = 5 + R() * 7;
    dab(ctx, S, x, y, r * 2.2, r, grey(base * 0.5, 0.75, 0.8), grey(base * 0.6, 0));
    ctx.lineWidth = 1.2;
    for (let ring = 1; ring <= 3; ring++) {
      ctx.strokeStyle = grey(base * 0.62, 0.4, 0.8);
      wrap(S, (ox, oy) => {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r * (1.4 + ring * 0.9), r * (0.6 + ring * 0.35), 0, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  }
}

/** 1: wood grain (posts, poles, rails, logs): streaks along u. */
function paintGrain(ctx: Ctx, R: Rand): void {
  ctx.fillStyle = grey(0.55, 1, 0.6);
  ctx.fillRect(0, 0, S, S);
  grainBand(ctx, R, 0, S, 0.56, 3);
}

/** 2: planks: four boards across v, each lit from above (pale top edge), a dark gap and soft occlusion under it. */
function paintPlanks(ctx: Ctx, R: Rand): void {
  const n = 4;
  const ph = S / n;
  for (let i = 0; i < n; i++) {
    const y0 = i * ph;
    const base = 0.5 + (R() - 0.5) * 0.16;
    ctx.fillStyle = grey(base, 1, 0.6);
    ctx.fillRect(0, y0, S, ph);
    grainBand(ctx, R, y0 + 3, y0 + ph - 3, base, 1 + Math.floor(R() * 2));
    // Baked light: a pale top edge, occlusion toward the gap below.
    const lg = ctx.createLinearGradient(0, y0, 0, y0 + ph);
    lg.addColorStop(0, grey(1, 0.28, 0.4));
    lg.addColorStop(0.08, grey(1, 0.0));
    lg.addColorStop(0.78, grey(0, 0.0));
    lg.addColorStop(1, grey(0, 0.42));
    ctx.fillStyle = lg;
    ctx.fillRect(0, y0, S, ph);
    ctx.fillStyle = grey(0.12, 0.9, 0.5);
    ctx.fillRect(0, y0 + ph - 3, S, 3);
    // A butt joint per board, with two nail heads.
    const jx = R() * S;
    ctx.fillStyle = grey(0.14, 0.85, 0.5);
    ctx.fillRect(jx, y0, 3, ph - 3);
    ctx.fillStyle = grey(0.9, 0.3, 0.4);
    ctx.fillRect(jx + 3, y0, 2, ph - 3);
    for (const ny of [0.3, 0.7]) {
      for (const nx of [-9, 13]) {
        dab(ctx, S, (jx + nx + S) % S, y0 + ph * ny, 3.2, 3.2, grey(0.18, 0.9), grey(0.3, 0));
      }
    }
  }
}

/** 3: cloth: soft fold shading and a fine painted weave. */
function paintCloth(ctx: Ctx, R: Rand): void {
  ctx.fillStyle = grey(0.62);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const v = 0.5 + R() * 0.25;
    dab(ctx, S, R() * S, R() * S, 30 + R() * 60, 70 + R() * 120, grey(v, 0.45), grey(v, 0));
  }
  // Folds: long soft vertical strokes, a lit edge beside a shaded one.
  for (let i = 0; i < 26; i++) {
    const x = R() * S;
    const y = R() * S;
    const len = 120 + R() * 220;
    const a = Math.PI / 2 + (R() - 0.5) * 0.4;
    stroke(ctx, R, S, x, y, len, 10 + R() * 10, a, grey(0.38, 0.22), 0.1);
    stroke(ctx, R, S, x + 9, y, len * 0.9, 6 + R() * 6, a, grey(0.85, 0.2), 0.1);
  }
  for (let i = 0; i < 2600; i++) {
    const v = 0.5 + R() * 0.3;
    const a = R() < 0.5 ? 0 : Math.PI / 2;
    stroke(ctx, R, S, R() * S, R() * S, 6 + R() * 10, 1.5 + R() * 2, a + (R() - 0.5) * 0.2, grey(v, 0.18), 0.05);
  }
}

/** 4: one canvas gore across u (round: lit in the middle, shaded at the seams), a cross seam, stitches. */
function paintCanvas(ctx: Ctx, R: Rand): void {
  const g = ctx.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0, grey(0.36));
  g.addColorStop(0.18, grey(0.56));
  g.addColorStop(0.5, grey(0.72));
  g.addColorStop(0.82, grey(0.56));
  g.addColorStop(1, grey(0.36));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = 20 + R() * (S - 40);
    const v = 0.45 + R() * 0.35 + 0.15 * Math.sin((x / S) * Math.PI);
    stroke(ctx, R, S, x, R() * S, 30 + R() * 90, 3 + R() * 8, Math.PI / 2 + (R() - 0.5) * 0.15, grey(v, 0.14 + R() * 0.12), 0.08);
  }
  // Cross seam (panels sewn end to end) with a soft pucker either side.
  const cy = S * 0.5;
  const pg = ctx.createLinearGradient(0, cy - 26, 0, cy + 26);
  pg.addColorStop(0, grey(0.0, 0));
  pg.addColorStop(0.45, grey(0.0, 0.3));
  pg.addColorStop(0.5, grey(1.0, 0.35));
  pg.addColorStop(0.56, grey(0.0, 0.25));
  pg.addColorStop(1, grey(0.0, 0));
  ctx.fillStyle = pg;
  ctx.fillRect(0, cy - 26, S, 52);
  // Long seams at the gore edges: a dark welt, pale stitches.
  for (const x of [0, S]) {
    ctx.fillStyle = grey(0.1, 0.85);
    ctx.fillRect(x - 5, 0, 10, S);
  }
  ctx.fillStyle = grey(1.0, 0.85, 1.2);
  for (let y = 4; y < S; y += 22) {
    ctx.fillRect(9, y, 4, 11);
    ctx.fillRect(S - 13, y + 11, 4, 11);
  }
  for (let x = 30; x < S - 30; x += 24) ctx.fillRect(x, cy + 7, 11, 3);
}

/**
 * Draws the band [from, to) of an image (across x or y, 0..1) into the tile twice, the second copy mirrored,
 * so the tile wraps without a seam along that axis (the other axis keeps the image's own wrap).
 */
function mirrorBand(ctx: Ctx, im: CanvasImageSource, axis: "x" | "y", from: number, to: number): void {
  const w = "width" in im && typeof im.width === "number" ? im.width : S;
  const h = "height" in im && typeof im.height === "number" ? im.height : S;
  const half = S / 2;
  for (const flip of [false, true]) {
    ctx.save();
    if (axis === "y") {
      ctx.translate(0, flip ? S : 0);
      ctx.scale(1, flip ? -1 : 1);
      ctx.drawImage(im, 0, h * from, w, h * (to - from), 0, 0, S, half);
    } else {
      ctx.translate(flip ? S : 0, 0);
      ctx.scale(flip ? -1 : 1, 1);
      ctx.drawImage(im, w * from, 0, w * (to - from), h, 0, 0, half, S);
    }
    ctx.restore();
  }
}

function luminanceMean(d: Uint8ClampedArray): Vector3 {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 64) {
    r += lin(d[i]!);
    g += lin(d[i + 1]!);
    b += lin(d[i + 2]!);
    n++;
  }
  return new Vector3(r / n, g / n, b / n);
}

/** Character light (fill colour, rim colour): uniforms shared by every painted program, set per frame. */
export const CHAR_LIGHT = {
  fill: { value: new Color(0, 0, 0) },
  rim: { value: new Color(0, 0, 0) },
  /** The campfire in view space (xyz) and how much it is the key (w, 0..1): the fill then comes from the fire. */
  fire: { value: new Vector4(0, 0, 0, 0) },
};

export type PaintArray = { tex: DataArrayTexture; /** 1 / mean colour (linear) per layer. */ inv: Vector3[] };
let shared: PaintArray | null = null;

/** The painted detail array (painted once per page). */
export function paintArray(): PaintArray {
  if (shared) return shared;
  const img = (k: keyof PaintImages, fallback: (ctx: Ctx, R: Rand) => void) => {
    const im = images[k];
    return im ? (ctx: Ctx) => ctx.drawImage(im, 0, 0, S, S) : fallback;
  };
  // Round 15 (kit part 3, the fishers' kit): the felt keeps its fuzz only (its stitched straps would land
  // anywhere on a hat) and the rod wood its grain only (no brass bands): a band of each, mirrored so it tiles.
  const band = (k: keyof PaintImages, fallback: (ctx: Ctx, R: Rand) => void, axis: "x" | "y", from: number, to: number) => {
    const im = images[k];
    if (!im) return fallback;
    return (ctx: Ctx) => mirrorBand(ctx, im, axis, from, to);
  };
  const painters = [
    paintBrush, paintGrain, img("planks", paintPlanks), paintCloth, img("canvas", paintCanvas), img("shingles", paintBrush), img("runestone", paintBrush), img("snow", paintBrush), img("tiles", paintBrush), img("rock", paintBrush), img("moss", paintBrush),
    img("quilt", paintCloth), band("felt", paintCloth, "y", 0.08, 0.44), img("leather", paintBrush), img("knit", paintCloth), band("rodwood", paintGrain, "x", 0.36, 0.72), img("tent", paintCanvas),
  ];
  const c = canvas();
  const inv: Vector3[] = [];
  let data: Uint8Array;
  let size = S;
  if (!c) {
    size = 1;
    data = new Uint8Array(4 * LAYERS).fill(255);
    for (let i = 0; i < LAYERS; i++) inv.push(new Vector3(1, 1, 1));
  } else {
    data = new Uint8Array(S * S * 4 * LAYERS);
    painters.forEach((p, i) => {
      c.ctx.clearRect(0, 0, S, S);
      p(c.ctx, rng(901 + i * 37));
      const img = c.ctx.getImageData(0, 0, S, S).data;
      data.set(img, i * S * S * 4);
      const m = luminanceMean(img);
      inv.push(new Vector3(1 / Math.max(m.x, 1e-3), 1 / Math.max(m.y, 1e-3), 1 / Math.max(m.z, 1e-3)));
    });
  }
  const tex = new DataArrayTexture(data, size, size, LAYERS);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  shared = { tex, inv };
  return shared;
}

/** A canvas texture from a painter (alpha cards: needles, clouds). */
export function paintedCard(size: number, seed: number, fn: (ctx: Ctx, R: Rand, size: number) => void): Texture {
  const c = canvas(size);
  if (!c) return new Texture();
  fn(c.ctx, rng(seed), size);
  const t = new CanvasTexture(c.cv);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

export const PAINTER = { stroke, dab, rgb, grey };

/** GLSL: painted detail from the array by the vertex's surface kind (object space; see applyPaint). */
export const PAINT_ARRAY_GLSL = /* glsl */ `
uniform vec3 uChFill;
uniform vec3 uChRim;
uniform vec4 uChFire;
uniform highp sampler2DArray tPk;
uniform vec3 iPk[${LAYERS}];
uniform float uPkScale;
varying vec3 vPkP;
varying vec3 vPkN;
varying vec3 vPk;
`;

/**
 * crisp: 1 marks the surface as a character (the fishers): it writes alpha 0 into the scene buffer,
 * and the painterly filter (post.ts) leaves alpha-0 pixels unpainted, so faces never smear. The uniform
 * is declared by the patched Lambert light chunk (geo.ts), which also gives characters a smooth ramp.
 */
export function applyPaint(shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }, scale: { value: number }, crisp: { value: number } = { value: 0 }): void {
  const pa = paintArray();
  shader.uniforms.tPk = { value: pa.tex };
  shader.uniforms.iPk = { value: pa.inv };
  shader.uniforms.uPkScale = scale;
  shader.uniforms.uPkCrisp = crisp;
  shader.uniforms.uChFill = CHAR_LIGHT.fill;
  shader.uniforms.uChRim = CHAR_LIGHT.rim;
  shader.uniforms.uChFire = CHAR_LIGHT.fire;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec3 aPaint;\nvarying vec3 vPkP;\nvarying vec3 vPkN;\nvarying vec3 vPk;")
    .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n  vPkN = objectNormal;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vPkP = transformed;\n  vPk = aPaint;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${PAINT_ARRAY_GLSL}`)
    .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  gl_FragColor.a *= mix(1.0, pkMaskA, uPkCrisp);")
    // Characters only: a warm lantern fill from the camera's lower left and a cool moonlit rim, so faces
    // and clothes read at night (round 09: Dad a silhouette). Zero by day (set per frame, see index.ts).
    .replace(
      "#include <opaque_fragment>",
      `if (uPkCrisp > 0.5) {
    float chNV = saturate(dot(normal, geometryViewDir));
    // By the campfire (round 11: the family looked self-lit) the warm key comes from the fire, the side
    // away from it falls into shade and the cool rim sits behind them, away from the fire.
    vec3 toFire = normalize(uChFire.xyz + vViewPosition);
    float fireFace = dot(normal, toFire);
    vec3 chDir = normalize(mix(vec3(-0.45, 0.2, 0.87), toFire, uChFire.w));
    float chFill = saturate((dot(normal, chDir) + 0.45) / 1.45);
    // Round 16: the fill models the form (a painter's turn into shade), not a flat wash over the face.
    chFill = pow(chFill, 1.35);
    // Round 18: on clothes the fill falls in painted planes too (a smooth airbrushed turn read as vinyl).
    float chB = chFill * 3.0;
    chFill = mix(chFill, (floor(chB) + smoothstep(0.3, 0.7, fract(chB))) / 3.0, 0.6 * gPkBand);
    float rimSide = mix(1.0, 2.4 * smoothstep(0.3, -0.4, fireFace), uChFire.w);
    outgoingLight *= mix(1.0, 0.12 + 0.43 * smoothstep(-0.5, 0.6, fireFace), uChFire.w);
    // The rim is painted too: on the clothes it follows the painted detail's value (no clean vinyl edge).
    outgoingLight += diffuseColor.rgb * uChFill * chFill + uChRim * pow(1.0 - chNV, 2.5) * rimSide * pkRimK;
  }
  #include <opaque_fragment>`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  float pkRimK = 1.0;
  // The character mask (round 18): what a fisher writes into the scene buffer's alpha, read by post.ts.
  // 0 = the face's features (never painted), CHAR_MASK.skin = skin (a faint brush), CHAR_MASK.body =
  // clothes, hair, boots and packs (a gentler version of the world's brush, so they sit in the painting).
  float pkMaskA = ${CHAR_MASK.body.toFixed(3)};
  gPkBand = 1.0;
  {
    float pkRaw = floor(vPk.x + 0.5);
    bool pkUv = pkRaw > ${PK_UV - 0.5};
    float pk = pkUv ? pkRaw - ${PK_UV.toFixed(1)} : pkRaw;
    if (pk > ${LAYERS - 0.5}) { pkMaskA = 0.0; gPkBand = 0.0; }
    if (pk < ${LAYERS - 0.5}) {
      vec3 n = normalize(vPkN);
      vec3 tx;
      // Per kind: triplanar scale (per metre) and detail strength (brush grain planks cloth canvas
      // shingles runestone snow tiles rock moss, then the fishers' kit: quilt felt leather knit rod wood).
      const float SCS[${LAYERS}] = float[${LAYERS}](0.8, 1.2, 0.36, 1.6, 1.0, 0.42, 0.45, 0.4, 0.42, 0.5, 0.4, 0.8, 1.0, 1.6, 2.6, 3.0, 1.0);
      const float STR[${LAYERS}] = float[${LAYERS}](0.55, 0.92, 0.72, 0.9, 0.75, 0.92, 0.9, 1.0, 0.9, 0.9, 0.85, 1.0, 0.55, 0.95, 1.0, 1.0, 1.0);
      int ki = int(pk);
      if (pkUv || (pk > 3.5 && pk < 4.5) || (pk > 15.5 && pk < 16.5)) {
        tx = texture(tPk, vec3(vPk.yz, pk)).rgb;
      } else {
        vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
        float sc = SCS[ki];
        vec3 p = vPkP * uPkScale * sc;
        vec2 ux = p.zy; vec2 uz = p.xy; vec2 uy = vPk.y > 0.5 ? p.zx : p.xz;
        // Grain runs up posts and poles (stretched along the grain).
        // The rod wood's grain runs along the rod (its own y) the same way.
        bool along = (pk > 0.5 && pk < 1.5) || pk > 14.5;
        if (along && vPk.y < 0.5) { ux = p.yz * vec2(0.3, 1.0); uz = p.yx * vec2(0.3, 1.0); }
        if (along && vPk.y > 0.5) { ux = p.zy * vec2(0.3, 1.0); uz = p.xy * vec2(0.3, 1.0); uy = p.xz * vec2(0.3, 1.0); }
        tx = texture(tPk, vec3(ux, pk)).rgb * w.x + texture(tPk, vec3(uz + 0.37, pk)).rgb * w.z + texture(tPk, vec3(uy + 0.71, pk)).rgb * w.y;
      }
      vec3 d = tx * iPk[ki];
      float l = dot(d, vec3(0.3, 0.55, 0.15));
      float str = STR[ki];
      // Cloth (the fishers' clothes and hats) keeps a narrow value range: its broad fold strokes read as
      // white paint blotches on a 1 m figure (round 09 critic), so only the weave and soft folds show.
      // The fishers' painted kit (round 15) keeps its stitches and quilting but not its blackest crevices.
      vec2 rng = pk > 2.5 && pk < 3.5 ? vec2(0.74, 1.24) : pk > 10.5 && pk < 15.5 ? vec2(0.5, 1.45) : vec2(0.0, 2.4);
      // The tent canvas keeps its own violet and gold (round 15): the vertex colours only shade it.
      float hueK = pk > 15.5 && pk < 16.5 ? 1.0 : 0.55;
      diffuseColor.rgb *= mix(vec3(1.0), clamp(mix(vec3(l), d, hueK), rng.x, rng.y), str);
      if (pk > 10.5 && pk < 15.5) pkRimK = 0.55 * clamp(l * l, 0.0, 1.6);
      // Baked top light: painted surfaces are lit from above, shaded underneath.
      diffuseColor.rgb *= mix(0.82, 1.1, smoothstep(-0.6, 0.85, n.y));
    } else if (pk > ${LAYERS + 0.5} && pk < ${LAYERS + 1.5}) {
      // Skin (round 16): painted, not vinyl. A broad, faint brush mottle (never over the features' shapes),
      // a soft top light that falls to a warm rosy shade underneath, and a low, painted rim.
      vec3 n = normalize(vPkN);
      vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
      vec3 p = vPkP * uPkScale * 0.9;
      vec3 tx = texture(tPk, vec3(p.zy, 0.0)).rgb * w.x + texture(tPk, vec3(p.xy + 0.37, 0.0)).rgb * w.z + texture(tPk, vec3(p.xz + 0.71, 0.0)).rgb * w.y;
      float l = dot(tx * iPk[0], vec3(0.3, 0.55, 0.15));
      diffuseColor.rgb *= mix(1.0, clamp(l, 0.74, 1.24), 0.7);
      diffuseColor.rgb *= mix(vec3(0.74, 0.58, 0.58), vec3(1.05, 1.01, 0.95), smoothstep(-0.7, 0.8, n.y));
      pkRimK = 0.3;
      gPkSkin = 1.0;
      pkMaskA = ${CHAR_MASK.skin.toFixed(3)};
    }
  }`,
    );
}

/** One needle spray in a quadrant (base at the bottom centre, tip at the top): a twig, side twigs, needles. */
function needleSpray(ctx: Ctx, R: Rand, x0: number, y0: number, q: number): void {
  const pt = (t: number, bend: number) => ({ x: x0 + q / 2 + Math.sin(t * Math.PI) * bend, y: y0 + q - 4 - t * (q - 10) });
  const bend = (R() - 0.5) * q * 0.12;
  const needles = (ax: number, ay: number, bx: number, by: number, len: number, n: number, dark: boolean) => {
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const px = ax + dx * t;
      const py = ay + dy * t;
      const l = len * (1 - t * 0.55) * (0.75 + R() * 0.5);
      for (const side of [-1, 1]) {
        const ang = Math.atan2(uy, ux) + side * (0.55 + R() * 0.45);
        const ex = px + Math.cos(ang) * l;
        const ey = py + Math.sin(ang) * l;
        const k = 0.3 + 0.7 * t;
        const lit = side < 0 ? 1.12 : 0.9;
        ctx.strokeStyle = dark ? rgb(14, 36, 44, 0.95) : rgb((40 + 80 * k) * lit + R() * 20, (90 + 100 * k) * lit + R() * 20, (90 + 70 * k) * lit + R() * 16, 1);
        ctx.lineWidth = dark ? 3.2 : 1.6 + R() * 1.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo((px + ex) / 2 + uy * side * 2, (py + ey) / 2 - ux * side * 2, ex, ey);
        ctx.stroke();
      }
    }
  };
  const twigs: [number, number, number, number, number][] = [];
  const base = pt(0, bend);
  const tip = pt(1, bend);
  twigs.push([base.x, base.y, tip.x, tip.y, q * 0.2]);
  for (let k = 0; k < 5; k++) {
    const t = 0.15 + k * 0.15;
    const p = pt(t, bend);
    const side = k % 2 === 0 ? -1 : 1;
    const len = q * (0.34 - t * 0.22);
    const ang = -Math.PI / 2 + side * (0.75 + R() * 0.3);
    twigs.push([p.x, p.y, p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len, q * 0.13]);
  }
  for (const dark of [true, false]) {
    for (const [ax, ay, bx, by, len] of twigs) {
      if (!dark) {
        ctx.strokeStyle = rgb(52, 36, 40, 1);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      needles(ax, ay, bx, by, len, Math.round(Math.hypot(bx - ax, by - ay) / 4.5), dark);
    }
  }
}

function alphaMean(cv: HTMLCanvasElement): Vector3 {
  const S2 = 32;
  const c = canvas(S2);
  if (!c) return new Vector3(1, 1, 1);
  c.ctx.drawImage(cv, 0, 0, S2, S2);
  const d = c.ctx.getImageData(0, 0, S2, S2).data;
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]! / 255;
    if (a < 0.5) continue;
    r += lin(d[i]!) * a;
    g += lin(d[i + 1]!) * a;
    b += lin(d[i + 2]!) * a;
    w += a;
  }
  return w > 0 ? new Vector3(r / w, g / w, b / w) : new Vector3(1, 1, 1);
}

/** The conifer needle-spray sheet: four sprays in a 2x2 sheet (RGBA), with its mean colour. */
export function needleSheet(): { tex: Texture; inv: Vector3 } {
  const size = 512;
  const c = canvas(size);
  if (!c) return { tex: new Texture(), inv: new Vector3(1, 1, 1) };
  const R = rng(5150);
  for (let i = 0; i < 4; i++) needleSpray(c.ctx, R, (i % 2) * (size / 2), Math.floor(i / 2) * (size / 2), size / 2);
  const m = alphaMean(c.cv);
  const t = new CanvasTexture(c.cv);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return { tex: t, inv: new Vector3(1 / Math.max(m.x, 1e-3), 1 / Math.max(m.y, 1e-3), 1 / Math.max(m.z, 1e-3)) };
}

/** A painted cumulus in a quadrant: soft lit domes over a flatter, shaded base, brushy tops (R = light, A = cover). */
function cloudPuff(ctx: Ctx, R: Rand, x0: number, y0: number, q: number): void {
  const base = y0 + q * 0.7;
  const domes = 6 + Math.floor(R() * 4);
  const items: [number, number, number][] = [];
  for (let i = 0; i < domes; i++) {
    const t = (i + 0.5) / domes;
    const bell = Math.sin(t * Math.PI);
    const r = q * (0.1 + 0.13 * bell) * (0.8 + R() * 0.4);
    items.push([x0 + q * (0.1 + 0.8 * t) + (R() - 0.5) * q * 0.05, base - r * 0.35 - bell * q * 0.18 * (0.6 + R() * 0.6), r]);
  }
  for (let i = 0; i < 26; i++) {
    const t = R();
    const bell = Math.sin(t * Math.PI);
    const r = q * (0.06 + 0.08 * bell) * (0.8 + R() * 0.5);
    items.push([x0 + q * (0.12 + 0.76 * t), base - r * 0.2 - R() * bell * q * 0.2, r]);
  }
  // Shaded underlayer first, lit domes over it.
  for (const pass of [0, 1]) {
    for (const [x, y, r] of items) {
      const k = Math.max(0, Math.min(1, (base - y) / (q * 0.4)));
      const light = pass === 0 ? 0.42 + 0.2 * k : 0.62 + 0.36 * k;
      const ox = pass === 0 ? 0 : -r * 0.22;
      const oy = pass === 0 ? r * 0.15 : -r * 0.3;
      const rr = pass === 0 ? r * 1.08 : r * 0.82;
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x, y, rr);
      g.addColorStop(0, grey(light, pass === 0 ? 0.9 : 0.75));
      g.addColorStop(0.65, grey(light * 0.92, pass === 0 ? 0.75 : 0.45));
      g.addColorStop(1, grey(light * 0.85, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Brushwork along the lit tops.
  for (let i = 0; i < 70; i++) {
    const [x, y, r] = items[Math.floor(R() * items.length)]!;
    const a = -Math.PI / 2 + (R() - 0.5) * 2.2;
    const px = x + Math.cos(a) * r * 0.7;
    const py = y + Math.sin(a) * r * 0.7;
    stroke(ctx, R, 1e6, px, py, r * (0.4 + R() * 0.5), r * 0.16, a + Math.PI / 2, grey(0.97, 0.06), 0.3);
  }
  // A flatter base: fade the cover out under the base line.
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const fg = ctx.createLinearGradient(0, base - q * 0.02, 0, base + q * 0.16);
  fg.addColorStop(0, "rgba(0,0,0,0)");
  fg.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = fg;
  ctx.fillRect(x0, base - q * 0.02, q, y0 + q - base + q * 0.02);
  ctx.restore();
}

/** Four painted cumulus clouds in a 2x2 sheet (red = painted light, alpha = cover). */
export function cloudSheet(): Texture {
  return paintedCard(512, 7272, (ctx, R, size) => {
    for (let i = 0; i < 4; i++) cloudPuff(ctx, R, (i % 2) * (size / 2), Math.floor(i / 2) * (size / 2), size / 2);
  });
}

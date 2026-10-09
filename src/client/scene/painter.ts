import { CanvasTexture, ClampToEdgeWrapping, DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, Texture, Vector3 } from "three";
import { rng } from "./noise";

/**
 * Hand-painted diffuse maps made in code (canvas 2D brushwork, painted at load): layered strokes with
 * jittered colour, baked top light and soft occlusion in the crevices, the way a WoW texture artist
 * paints wood, cloth and canvas. Every prop, vehicle and fisher draws its painted detail from one
 * texture array (one layer per surface kind), so a new kind costs no new program.
 */

/** Surface kinds (the texture-array layer; NONE = no painted detail, e.g. faces and glass). */
export const PK = { brush: 0, grain: 1, planks: 2, cloth: 3, canvas: 4, none: 5 } as const;
export type PaintKind = (typeof PK)[keyof typeof PK];
const LAYERS = 5;
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

export type PaintArray = { tex: DataArrayTexture; /** 1 / mean colour (linear) per layer. */ inv: Vector3[] };
let shared: PaintArray | null = null;

/** The painted detail array (painted once per page). */
export function paintArray(): PaintArray {
  if (shared) return shared;
  const painters = [paintBrush, paintGrain, paintPlanks, paintCloth, paintCanvas];
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
uniform highp sampler2DArray tPk;
uniform vec3 iPk[${LAYERS}];
uniform float uPkScale;
varying vec3 vPkP;
varying vec3 vPkN;
varying vec3 vPk;
`;

export function applyPaint(shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }, scale: { value: number }): void {
  const pa = paintArray();
  shader.uniforms.tPk = { value: pa.tex };
  shader.uniforms.iPk = { value: pa.inv };
  shader.uniforms.uPkScale = scale;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec3 aPaint;\nvarying vec3 vPkP;\nvarying vec3 vPkN;\nvarying vec3 vPk;")
    .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n  vPkN = objectNormal;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vPkP = transformed;\n  vPk = aPaint;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${PAINT_ARRAY_GLSL}`)
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  {
    float pk = floor(vPk.x + 0.5);
    if (pk < 4.5) {
      vec3 n = normalize(vPkN);
      vec3 tx;
      if (pk > 3.5) {
        tx = texture(tPk, vec3(vPk.yz, 4.0)).rgb;
      } else {
        vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
        float sc = pk < 0.5 ? 0.8 : (pk < 1.5 ? 1.2 : (pk < 2.5 ? 0.57 : 1.6));
        vec3 p = vPkP * uPkScale * sc;
        vec2 ux = p.zy; vec2 uz = p.xy; vec2 uy = vPk.y > 0.5 ? p.zx : p.xz;
        // Grain runs up posts and poles (stretched along the grain).
        if (pk > 0.5 && pk < 1.5 && vPk.y < 0.5) { ux = p.yz * vec2(0.3, 1.0); uz = p.yx * vec2(0.3, 1.0); }
        if (pk > 0.5 && pk < 1.5 && vPk.y > 0.5) { ux = p.zy * vec2(0.3, 1.0); uz = p.xy * vec2(0.3, 1.0); uy = p.xz * vec2(0.3, 1.0); }
        tx = texture(tPk, vec3(ux, pk)).rgb * w.x + texture(tPk, vec3(uz + 0.37, pk)).rgb * w.z + texture(tPk, vec3(uy + 0.71, pk)).rgb * w.y;
      }
      int ki = int(pk);
      vec3 d = tx * iPk[ki];
      float l = dot(d, vec3(0.3, 0.55, 0.15));
      float str = pk < 0.5 ? 0.55 : (pk < 2.5 ? 0.92 : (pk < 3.5 ? 0.9 : 0.95));
      diffuseColor.rgb *= mix(vec3(1.0), clamp(mix(vec3(l), d, 0.55), 0.0, 2.4), str);
      // Baked top light: painted surfaces are lit from above, shaded underneath.
      diffuseColor.rgb *= mix(0.82, 1.1, smoothstep(-0.6, 0.85, n.y));
    }
  }`,
    );
}

import { applySightFade, type OccluderUniforms } from "./geo";
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshLambertMaterial, SRGBColorSpace, Texture, type InstancedMesh } from "three";
import { rng } from "./noise";
import { instanced, type Inst } from "./kit";
import { cleanCardTexture } from "./cards";

/**
 * Painted plants (round 09-B: "fewer, bigger, fully painted"): a handful of alpha-card plants painted
 * in code with canvas brush strokes, in place of the carpet of small glossy props (lupine cone spikes,
 * sphere flowers, squashed-sphere ferns). Ferns, bluebells, foxgloves, glow-cap clusters and drifts of
 * fallen leaves, all on one painted sheet with a matching glow sheet (only the bell mouths and the cap
 * rims glow). Matte Lambert, light baked into the vertex colours (dark at the root, light at the tip),
 * a gentle wind sway. One program for every plant.
 */

export type PlantKind = "fern" | "bluebell" | "foxglove" | "glowcap" | "litter" | "grass";
export const PLANT_KINDS: readonly PlantKind[] = ["fern", "bluebell", "foxglove", "glowcap", "litter", "grass"];
const CELL: Record<PlantKind, number> = { fern: 0, bluebell: 1, foxglove: 2, glowcap: 3, litter: 4, grass: 5 };
/** An empty list for every kind. */
export function plantLists(): Record<PlantKind, Inst[]> {
  return { fern: [], bluebell: [], foxglove: [], glowcap: [], litter: [], grass: [] };
}
const COLS = 4;
const ROWS = 2;
const CS = 512;

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;

const css = (c: Color, a = 1) => `rgba(${Math.round(Math.min(1, c.r) * 255)},${Math.round(Math.min(1, c.g) * 255)},${Math.round(Math.min(1, c.b) * 255)},${a})`;
const hx = (h: number, k = 1) => new Color(h).multiplyScalar(k);

/** A tapered leaf from (x, y) along ang, len long, w wide at its widest (a third of the way up). */
function leaf(ctx: Ctx, x: number, y: number, len: number, w: number, ang: number, col: string, curl = 0): void {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const nx = -dy;
  const ny = dx;
  const tx = x + dx * len + nx * curl * len;
  const ty = y + dy * len + ny * curl * len;
  const mx = x + dx * len * 0.38;
  const my = y + dy * len * 0.38;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(mx + nx * w, my + ny * w, tx, ty);
  ctx.quadraticCurveTo(mx - nx * w, my - ny * w, x, y);
  ctx.fill();
}

/** A few bristle lines along a direction (brush texture inside a shape). */
function bristles(ctx: Ctx, R: Rand, x: number, y: number, len: number, ang: number, col: string, n = 3, spread = 3): void {
  ctx.strokeStyle = col;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const o = (i / Math.max(1, n - 1) - 0.5) * spread;
    const ox = -Math.sin(ang) * o;
    const oy = Math.cos(ang) * o;
    ctx.lineWidth = 0.8 + R() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x + ox, y + oy);
    ctx.lineTo(x + ox + Math.cos(ang) * len * (0.7 + R() * 0.3), y + oy + Math.sin(ang) * len * (0.7 + R() * 0.3));
    ctx.stroke();
  }
}

/** A point on a quadratic stem from base to tip bending sideways by bend (0..1 along it). */
function stemAt(x0: number, y0: number, x1: number, y1: number, bend: number, t: number): { x: number; y: number; a: number } {
  const cx = (x0 + x1) / 2 + bend;
  const cy = (y0 + y1) / 2;
  const u = 1 - t;
  const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
  const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
  const ddx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
  const ddy = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
  return { x, y, a: Math.atan2(ddy, ddx) };
}

function stem(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, bend: number, w: number, col: string): void {
  ctx.strokeStyle = col;
  ctx.lineCap = "round";
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1);
  ctx.stroke();
}

/** One fern frond, base at the cell's bottom centre, tip at the top: paired pinnae, darker underneath. */
function paintFern(ctx: Ctx, _glow: Ctx, R: Rand, x0: number, y0: number): void {
  const bx = x0 + CS / 2;
  const by = y0 + CS - 8;
  const tx = x0 + CS / 2 + (R() - 0.5) * 30;
  const ty = y0 + 18;
  const bend = 40;
  const base = hx(0x3a7a66);
  const mid = hx(0x6ab890);
  const tip = hx(0xc0f0b8);
  const c = new Color();
  // Two passes: a shadow layer (darker, wider) and the lit pinnae over it.
  for (const pass of [0, 1]) {
    const n = 34;
    for (let i = 2; i < n; i++) {
      const t = i / n;
      const p = stemAt(bx, by, tx, ty, bend, t);
      const prof = Math.sin(Math.min(1, t * 1.25) * Math.PI) * (1 - t * 0.35);
      const len = CS * 0.3 * prof + 8;
      for (const side of [-1, 1]) {
        const ang = p.a + side * (0.95 - t * 0.3) + (R() - 0.5) * 0.12;
        c.copy(base).lerp(mid, Math.min(1, t * 1.6)).lerp(tip, Math.max(0, t - 0.45) * 1.4);
        if (side > 0) c.multiplyScalar(0.86);
        if (pass === 0) {
          leaf(ctx, p.x, p.y, len * 1.04, len * 0.3 + 3, ang + side * 0.05, css(c.clone().multiplyScalar(0.62)), side * 0.1);
        } else {
          leaf(ctx, p.x, p.y, len, len * 0.26 + 2.5, ang, css(c), side * 0.18);
          // Top light on the upper edge of each pinna, a darker vein along it.
          bristles(ctx, R, p.x + Math.cos(ang) * len * 0.1, p.y + Math.sin(ang) * len * 0.1 - 1.5, len * 0.75, ang - side * 0.05, css(c.clone().lerp(tip, 0.5).multiplyScalar(1.15), 0.55), 2, 2.5);
          bristles(ctx, R, p.x, p.y, len * 0.85, ang, css(c.clone().multiplyScalar(0.55), 0.6), 1, 0);
        }
      }
    }
  }
  stem(ctx, bx, by, tx, ty, bend, 5, css(hx(0x3a6a44)));
}

/** A clump of bluebells: strap leaves, arching stems hung with violet-blue bells (the mouths glow). */
function paintBluebell(ctx: Ctx, glow: Ctx, R: Rand, x0: number, y0: number): void {
  const bx = x0 + CS / 2;
  const by = y0 + CS - 6;
  for (let i = 0; i < 9; i++) {
    const ang = -Math.PI / 2 + (i / 8 - 0.5) * 1.5 + (R() - 0.5) * 0.2;
    const l = CS * (0.32 + R() * 0.2);
    leaf(ctx, bx + (R() - 0.5) * 30, by, l, 12 + R() * 6, ang, css(hx(0x3a7a5a).lerp(hx(0x7ac08a), R() * 0.6)), (R() - 0.5) * 0.3);
  }
  const bellBase = hx(0x3a3aa8);
  const bellLit = hx(0x9a9cff);
  for (let s = 0; s < 3; s++) {
    const sx = bx + (s - 1) * 60 + (R() - 0.5) * 20;
    const top = { x: sx + (s - 1) * 40 + 50, y: y0 + 40 + R() * 40 };
    const bend = (s - 1) * 30 - 30;
    stem(ctx, sx, by, top.x, top.y, bend, 5, css(hx(0x2e5a40)));
    const nb = 5;
    for (let k = 0; k < nb; k++) {
      const t = 0.55 + (k / nb) * 0.45;
      const p = stemAt(sx, by, top.x, top.y, bend, t);
      const r = 32 - k * 3;
      const hxp = p.x + 10;
      const hyp = p.y + 6;
      // The bell: a dome, darker to the inside, a pale flared mouth.
      ctx.fillStyle = css(bellBase.clone().lerp(bellLit, 0.3 + R() * 0.2));
      ctx.beginPath();
      ctx.ellipse(hxp, hyp + r * 0.6, r * 0.62, r, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(bellLit.clone().multiplyScalar(1.05), 0.8);
      ctx.beginPath();
      ctx.ellipse(hxp - r * 0.18, hyp + r * 0.3, r * 0.22, r * 0.55, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(hx(0xd8d8ff));
      ctx.beginPath();
      ctx.ellipse(hxp + r * 0.18, hyp + r * 1.5, r * 0.75, r * 0.28, 0.25, 0, Math.PI * 2);
      ctx.fill();
      glow.fillStyle = "rgba(255,255,255,0.9)";
      glow.beginPath();
      glow.ellipse(hxp + r * 0.18, hyp + r * 1.5, r * 0.7, r * 0.26, 0.25, 0, Math.PI * 2);
      glow.fill();
      ctx.strokeStyle = css(hx(0x2e5a40));
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(hxp, hyp);
      ctx.stroke();
    }
  }
}

/** Two foxglove spikes: big basal leaves, tubular rose-violet bells shrinking to buds at the top. */
function paintFoxglove(ctx: Ctx, glow: Ctx, R: Rand, x0: number, y0: number): void {
  const bx = x0 + CS / 2;
  const by = y0 + CS - 6;
  for (let i = 0; i < 7; i++) {
    const ang = -Math.PI / 2 + (i / 6 - 0.5) * 2.2;
    const l = CS * (0.22 + R() * 0.1);
    const col = hx(0x3e7a58).lerp(hx(0x7ab888), R() * 0.5);
    leaf(ctx, bx, by, l, 26 + R() * 10, ang, css(col), (R() - 0.5) * 0.3);
    bristles(ctx, R, bx, by, l * 0.8, ang, css(col.clone().multiplyScalar(1.3), 0.5), 3, 10);
  }
  const spikes: [number, number, number][] = [[-50, 30, -20], [55, 90, 25]];
  for (const [ox, topY, bend] of spikes) {
    const sx = bx + ox;
    const tx = sx + bend;
    const ty = y0 + topY;
    stem(ctx, bx + ox * 0.3, by, tx, ty, bend * 0.5, 6, css(hx(0x30583a)));
    const n = 11;
    for (let k = 0; k < n; k++) {
      const t = 0.3 + (k / n) * 0.7;
      const p = stemAt(bx + ox * 0.3, by, tx, ty, bend * 0.5, t);
      const sz = 30 * (1 - (k / n) * 0.7);
      const side = k % 2 === 0 ? 1 : -1;
      const hxp = p.x + side * sz * 0.45;
      const hyp = p.y + sz * 0.2;
      const shade = hx(0x7a2a7a).lerp(hx(0xe07ad0), 0.35 + R() * 0.25 + (k / n) * 0.2);
      ctx.fillStyle = css(shade.clone().multiplyScalar(0.6));
      ctx.beginPath();
      ctx.ellipse(hxp, hyp, sz * 0.55, sz * 0.85, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(shade);
      ctx.beginPath();
      ctx.ellipse(hxp - side * sz * 0.08, hyp - sz * 0.12, sz * 0.42, sz * 0.7, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
      if (k < n - 3) {
        // The pale speckled mouth.
        ctx.fillStyle = css(hx(0xffd8f4));
        ctx.beginPath();
        ctx.ellipse(hxp + side * sz * 0.22, hyp + sz * 0.5, sz * 0.32, sz * 0.2, side * 0.5, 0, Math.PI * 2);
        ctx.fill();
        for (let d = 0; d < 3; d++) {
          ctx.fillStyle = css(hx(0x6a2060), 0.8);
          ctx.beginPath();
          ctx.arc(hxp + side * sz * (0.1 + R() * 0.25), hyp + sz * (0.4 + R() * 0.15), 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        glow.fillStyle = "rgba(255,255,255,0.55)";
        glow.beginPath();
        glow.ellipse(hxp + side * sz * 0.22, hyp + sz * 0.5, sz * 0.3, sz * 0.18, side * 0.5, 0, Math.PI * 2);
        glow.fill();
      }
    }
  }
}

/** A cluster of glow-caps: pale stems, brushy caps (shaded crown, a glowing rim), dark gills. */
function paintGlowcap(ctx: Ctx, glow: Ctx, R: Rand, x0: number, y0: number): void {
  const caps: [number, number, number][] = [[0.02, 1.0, 0.95], [-0.27, 0.62, 0.62], [0.28, 0.45, 0.5]];
  // Back to front: the biggest at the back.
  for (const [ox, hk, rk] of caps) {
    const cx = x0 + CS / 2 + ox * CS;
    const groundY = y0 + CS - 8 - (1 - hk) * 20;
    const h = CS * 0.42 * hk;
    const r = CS * 0.27 * rk;
    const capY = groundY - h;
    // Stem: dark at the root, pale under the cap, a soft shaded side.
    const sg = ctx.createLinearGradient(0, groundY, 0, capY);
    sg.addColorStop(0, css(hx(0x3a4458)));
    sg.addColorStop(1, css(hx(0xdfe6f2)));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, groundY);
    ctx.quadraticCurveTo(cx - r * 0.12, groundY - h * 0.5, cx - r * 0.16, capY + 4);
    ctx.lineTo(cx + r * 0.16, capY + 4);
    ctx.quadraticCurveTo(cx + r * 0.2, groundY - h * 0.5, cx + r * 0.32, groundY);
    ctx.fill();
    for (let i = 0; i < 4; i++) bristles(ctx, R, cx - r * 0.1 + (R() - 0.5) * r * 0.2, groundY - 4, h * 0.8, -Math.PI / 2, css(hx(0x8a94a8), 0.35), 1, 0);
    // Gills: a shaded band under the cap (mid violet, not black: dark gills on pale caps read as stripes).
    ctx.fillStyle = css(hx(0x5a5a86));
    ctx.beginPath();
    ctx.ellipse(cx, capY + 4, r, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    glow.fillStyle = "rgba(255,255,255,0.35)";
    glow.beginPath();
    glow.ellipse(cx, capY + 5, r * 0.95, r * 0.18, 0, 0, Math.PI * 2);
    glow.fill();
    // Cap: a dome, deep in the crown, brightening to the rim.
    const cg = ctx.createRadialGradient(cx - r * 0.2, capY - r * 0.55, r * 0.1, cx, capY - r * 0.1, r * 1.05);
    cg.addColorStop(0, css(hx(0x8a96c8)));
    cg.addColorStop(0.55, css(hx(0x6a78b8)));
    cg.addColorStop(1, css(hx(0xc8ecff)));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(cx - r, capY + 2);
    ctx.bezierCurveTo(cx - r * 0.95, capY - r * 0.9, cx + r * 0.95, capY - r * 0.9, cx + r, capY + 2);
    ctx.quadraticCurveTo(cx, capY + r * 0.18, cx - r, capY + 2);
    ctx.fill();
    // Brushwork over the cap, curving with it.
    for (let i = 0; i < 18; i++) {
      const a = Math.PI + R() * Math.PI;
      const rr = r * (0.3 + R() * 0.6);
      const px = cx + Math.cos(a) * rr;
      const py = capY - Math.abs(Math.sin(a)) * rr * 0.75;
      bristles(ctx, R, px, py, r * 0.25, a + Math.PI / 2, css(hx(R() < 0.5 ? 0x7a88bc : 0x9aaadc), 0.3), 2, 2);
    }
    // Pale spots.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = css(hx(0xeef4ff), 0.85);
      ctx.beginPath();
      ctx.ellipse(cx + (R() - 0.5) * r * 1.1, capY - r * (0.25 + R() * 0.35), 3 + R() * 4, 2 + R() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The rim glows.
    glow.strokeStyle = "rgba(255,255,255,1)";
    glow.lineWidth = r * 0.2;
    glow.lineCap = "round";
    glow.beginPath();
    glow.moveTo(cx - r * 0.98, capY);
    glow.bezierCurveTo(cx - r * 0.9, capY - r * 0.35, cx + r * 0.9, capY - r * 0.35, cx + r * 0.98, capY);
    glow.stroke();
  }
}

/** Fallen leaves seen from above: an irregular drift, ochre and gold, darker toward its heart. */
function paintLitter(ctx: Ctx, _glow: Ctx, R: Rand, x0: number, y0: number): void {
  const cx = x0 + CS / 2;
  const cy = y0 + CS / 2;
  // Ochre and gold (round 09: the old dark reds read as blood from across the room).
  const cols = [0xb8843a, 0xd09a44, 0xe0b458, 0xe8c66a, 0xa8803e, 0xc8a050].map((h) => hx(h));
  for (let i = 0; i < 260; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.pow(R(), 0.7) * CS * 0.42 * (0.8 + 0.2 * Math.sin(a * 3 + 1));
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const l = 18 + R() * 22;
    const c = cols[Math.floor(R() * cols.length)]!.clone().multiplyScalar(0.7 + 0.3 * (d / (CS * 0.42)) + R() * 0.15);
    const ang = R() * Math.PI * 2;
    leaf(ctx, x - Math.cos(ang) * l * 0.5, y - Math.sin(ang) * l * 0.5, l, l * 0.32, ang, css(c), (R() - 0.5) * 0.3);
    bristles(ctx, R, x - Math.cos(ang) * l * 0.4, y - Math.sin(ang) * l * 0.4, l * 0.8, ang, css(c.clone().multiplyScalar(0.6), 0.6), 1, 0);
  }
}


/** A clump of meadow grass: tapered blades fanning from the root, deep teal at the base, lit tips. */
function paintGrass(ctx: Ctx, _glow: Ctx, R: Rand, x0: number, y0: number): void {
  const bx = x0 + CS / 2;
  const by = y0 + CS - 4;
  // Close to the painted ground's own greens (blades read as the lawn grown up, not dark shrubs).
  const base = hx(0x3e7a6a);
  const mid = hx(0x62a88e);
  const tip = hx(0xb8e4c0);
  const c = new Color();
  // A faint wash of the blade colour under everything (alpha 0.12, below the cut-out): mipmaps blend
  // the thin blades with green, not with transparent black, so the clumps don't go dark at a distance.
  ctx.fillStyle = css(mid, 0.12);
  ctx.fillRect(x0 + 2, y0 + 2, CS - 4, CS - 4);
  for (const pass of [0, 1]) {
    for (let i = 0; i < 40; i++) {
      const sx = bx + (R() - 0.5) * CS * 0.46;
      const ang = -Math.PI / 2 + (R() - 0.5) * 1.1 + ((sx - bx) / CS) * 1.2;
      const len = CS * (0.5 + R() * 0.45) * (pass === 0 ? 1 : 0.88);
      const w = 9 + R() * 7;
      c.copy(base).lerp(mid, 0.35 + R() * 0.65);
      const curl = (R() - 0.5) * 0.45;
      if (pass === 0) {
        leaf(ctx, sx, by, len, w * 1.15, ang, css(c.clone().multiplyScalar(0.78)), curl);
      } else {
        leaf(ctx, sx, by, len, w, ang, css(c), curl);
        // Light down the upper half of the blade (brush strokes, not a gradient).
        const ux = sx + Math.cos(ang) * len * 0.45;
        const uy = by + Math.sin(ang) * len * 0.45;
        bristles(ctx, R, ux, uy, len * 0.45, ang + curl * 0.6, css(c.clone().lerp(tip, 0.6), 0.6), 2, 2);
      }
    }
  }
}

const PAINTERS: Record<PlantKind, (ctx: Ctx, glow: Ctx, R: Rand, x0: number, y0: number) => void> = {
  fern: paintFern, bluebell: paintBluebell, foxglove: paintFoxglove, glowcap: paintGlowcap, litter: paintLitter, grass: paintGrass,
};

export type PlantSheet = { map: Texture; glow: Texture; dispose(): void };

function sheetTexture(cv: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

/**
 * Round 12: the Codex-painted plant cards (keyed off black) that replace the code painting where they
 * read better at TV distance. A kind with no image keeps its painter. The violet glow-cap fills the spare
 * cell 6 and takes every other plane of a glow-cap cluster.
 */
export type PlantImages = Partial<Record<"bluebell" | "foxglove" | "glowcap" | "glowcapViolet", CanvasImageSource>>;
const VIOLET_CELL = 6;
/** Which kinds draw from a Codex image (their geometry follows the image's shape). */
const painted = new Set<keyof PlantImages>();
/** How much of an image's brightest strokes self-light (the cap undersides; the bells a little; leaves none). */
const IMAGE_GLOW: Record<keyof PlantImages, number> = { bluebell: 0.45, foxglove: 0.3, glowcap: 1, glowcapViolet: 1 };

/** Draws an image into a cell, and its glow (the brightest strokes, by luminance, alpha-weighted) into the glow sheet. */
function imageCell(ctx: Ctx, glow: Ctx, img: CanvasImageSource, x0: number, y0: number, k: number): void {
  ctx.clearRect(x0, y0, CS, CS);
  ctx.drawImage(img, x0, y0, CS, CS);
    const d = ctx.getImageData(x0, y0, CS, CS);
  const g = glow.createImageData(CS, CS);
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < CS * CS; i++) {
    const r = d.data[i * 4]! / 255;
    const gg = d.data[i * 4 + 1]! / 255;
    const b = d.data[i * 4 + 2]! / 255;
    const a = d.data[i * 4 + 3]! / 255;
    const w = a * ss(0.5, 0.85, Math.max(r, gg, b)) * k;
    g.data[i * 4] = r * w * 255;
    g.data[i * 4 + 1] = gg * w * 255;
    g.data[i * 4 + 2] = b * w * 255;
    g.data[i * 4 + 3] = 255;
  }
  glow.putImageData(g, x0, y0);
}

/** Paints the plant sheet (and its glow sheet) once; Codex images take their kinds' cells. */
export function plantSheet(images: PlantImages = {}): PlantSheet {
  painted.clear();
  if (typeof document === "undefined") {
    const map = new Texture();
    const glow = new Texture();
    return { map, glow, dispose: () => { map.dispose(); glow.dispose(); } };
  }
  const mk = () => {
    const cv = document.createElement("canvas");
    cv.width = CS * COLS;
    cv.height = CS * ROWS;
    return cv;
  };
  const cv = mk();
  const gv = mk();
  const ctx = cv.getContext("2d");
  const gtx = gv.getContext("2d");
  if (ctx && gtx) {
    gtx.fillStyle = "#000";
    gtx.fillRect(0, 0, gv.width, gv.height);
    for (const k of PLANT_KINDS) {
      const i = CELL[k];
      const x0 = (i % COLS) * CS;
      const y0 = Math.floor(i / COLS) * CS;
      const img = k === "bluebell" || k === "foxglove" || k === "glowcap" ? images[k] : undefined;
      if (img && (k === "bluebell" || k === "foxglove" || k === "glowcap")) {
        imageCell(ctx, gtx, img, x0, y0, IMAGE_GLOW[k]);
        painted.add(k);
      } else {
        PAINTERS[k](ctx, gtx, rng(7100 + i * 31), x0, y0);
      }
    }
    if (images.glowcapViolet && painted.has("glowcap")) {
      imageCell(ctx, gtx, images.glowcapViolet, (VIOLET_CELL % COLS) * CS, Math.floor(VIOLET_CELL / COLS) * CS, IMAGE_GLOW.glowcapViolet);
      painted.add("glowcapViolet");
    }
  }
  // Codex cards carry the black key in their soft edges: cleaned so mipmaps keep the edge colour.
  const map = (painted.size > 0 ? cleanCardTexture(cv) : null) ?? sheetTexture(cv);
  const glow = sheetTexture(gv);
  return { map, glow, dispose: () => { map.dispose(); glow.dispose(); } };
}

/** The cell's uv rectangle (the canvas is flipped: its top row is v = 1). */
function cellUv(k: PlantKind, cell = CELL[k]): { u0: number; u1: number; v0: number; v1: number } {
  const i = cell;
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const inset = 1 / (CS * COLS);
  return { u0: col / COLS + inset, u1: (col + 1) / COLS - inset, v0: 1 - (row + 1) / ROWS + inset, v1: 1 - row / ROWS - inset };
}

type Quad = { o: [number, number, number]; right: [number, number, number]; up: [number, number, number] };

/** Cards from quads (origin = bottom centre), shaded dark at the root and full at the tip (baked light). */
function cards(k: PlantKind, quads: Quad[], rootShade: number, alt?: number): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  quads.forEach(({ o, right, up }, qi) => {
    // Every other plane from the alternate cell (the violet glow-caps among the blue).
    const { u0, u1, v0, v1 } = cellUv(k, alt !== undefined && qi % 2 === 1 ? alt : CELL[k]);
    const corners: [number, number, number, number][] = [[-1, 0, u0, v0], [1, 0, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]];
    for (const q of [0, 1, 2, 0, 2, 3]) {
      const [sx, sy, uu, vv] = corners[q]!;
      pos.push(o[0] + right[0] * sx * 0.5 + up[0] * sy, o[1] + right[1] * sx * 0.5 + up[1] * sy, o[2] + right[2] * sx * 0.5 + up[2] * sy);
      // Normals up: the plants light like the ground they grow from.
      nor.push(0, 1, 0);
      uv.push(uu, vv);
      const s = rootShade + (1 - rootShade) * sy;
      col.push(s, s, s);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

function crossedQuads(w: number, h: number, n: number): Quad[] {
  const quads: Quad[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI;
    quads.push({ o: [0, 0, 0], right: [Math.cos(a) * w, 0, Math.sin(a) * w], up: [0, h, 0] });
  }
  return quads;
}

/** Upright crossed cards (w wide, h tall), n planes. */
function crossed(k: PlantKind, w: number, h: number, n: number): BufferGeometry {
  return cards(k, crossedQuads(w, h, n), 0.72);
}

/** A fern rosette: fronds leaning out all round, a few more upright in the middle. */
function fernRosette(): BufferGeometry {
  const quads: Quad[] = [];
  const R = rng(4242);
  const ring = (n: number, tilt: number, len: number, w: number, off: number) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + off) / n) * Math.PI * 2 + (R() - 0.5) * 0.3;
      const t = tilt + (R() - 0.5) * 0.15;
      const l = len * (0.85 + R() * 0.3);
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      quads.push({ o: [ox * 0.04, 0, oz * 0.04], right: [-oz * w, 0, ox * w], up: [ox * Math.sin(t) * l, Math.cos(t) * l, oz * Math.sin(t) * l] });
    }
  };
  ring(8, 1.05, 1.5, 0.72, 0);
  ring(5, 0.6, 1.25, 0.6, 0.5);
  return cards("fern", quads, 0.7);
}

/** A drift of fallen leaves lying on the ground (two overlapping cards). */
function litterPatch(): BufferGeometry {
  return cards("litter", [
    { o: [0, 0.03, -0.9], right: [1.8, 0, 0], up: [0, 0, 1.8] },
    { o: [0.35, 0.045, -0.45], right: [0.9, 0, 0.75], up: [-0.6, 0, 0.75] },
  ], 1);
}

export function plantGeometry(k: PlantKind): BufferGeometry {
  switch (k) {
    case "fern": return fernRosette();
    case "bluebell": return crossed("bluebell", 1.0, 1.0, 3);
    case "foxglove": return painted.has("foxglove") ? crossed("foxglove", 1.4, 1.6, 3) : crossed("foxglove", 1.25, 1.7, 3);
    case "glowcap": return painted.has("glowcapViolet") ? cards("glowcap", crossedQuads(1.1, 1.0, 2), 0.72, VIOLET_CELL) : crossed("glowcap", 1.0, 0.9, 2);
    case "litter": return litterPatch();
    case "grass": return cards("grass", crossedQuads(1.0, 0.52, 3), 0.86);
  }
}

/**
 * The plant material: the painted sheet over the baked root-to-tip shade and the instance tint, matte
 * (Lambert, no specular), alpha-tested edges, a wind sway that grows with height, both faces lit like
 * the ground, and the glow sheet as an emissive rim (its strength is `emissive`, driven by the night).
 */
export function plantMaterial(sheet: PlantSheet, time: { value: number }, occ?: OccluderUniforms): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, map: sheet.map, emissiveMap: sheet.glow, alphaTest: 0.5, side: DoubleSide });
  m.emissive.setScalar(0.3);
  m.alphaToCoverage = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sw = max(position.y, 0.0);
  sw = sw * sw * 0.09;
  float gust = 0.6 + 0.4 * sin(uTime * 0.7 + ip.x * 0.05);
  transformed.x += sin(uTime * 1.6 + ip.x * 0.35 + ip.z * 0.21) * sw * gust;
  transformed.z += cos(uTime * 1.2 + ip.x * 0.18 - ip.z * 0.3) * sw * 0.6 * gust;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n  normal = normalize(vNormal);")
      // The glow takes the plant's own tint (a teal cap glows teal).
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;")
      .replace("#include <clipping_planes_fragment>", "if (texture2D(map, vMapUv).a < 0.25) discard;\n  #include <clipping_planes_fragment>");
    // Round 19: a foxglove or bluebell between the camera and a fisher dissolves (session 79 s).
    if (occ) applySightFade(shader, occ);
  };
  m.customProgramCacheKey = () => (occ ? "bobber-plant-sight" : "bobber-plant");
  return m;
}

/** One instanced mesh per kind with any instances (names `plants-<kind>`). */
export function plantMeshes(lists: Partial<Record<PlantKind, Inst[]>>, mat: MeshLambertMaterial): InstancedMesh[] {
  const out: InstancedMesh[] = [];
  for (const k of PLANT_KINDS) {
    const list = lists[k];
    if (!list || list.length === 0) continue;
    const mesh = instanced(plantGeometry(k), mat, list, false);
    mesh.name = `plants-${k}`;
    out.push(mesh);
  }
  return out;
}

/** A matte version of a glowing HDR tint: its hue at most 0.92 bright (the glow comes from the rim). */
export function matteTint(c: Color): Color {
  const m = Math.max(c.r, c.g, c.b, 1e-3);
  return c.clone().multiplyScalar(0.92 / m);
}

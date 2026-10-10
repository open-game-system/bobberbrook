import { CanvasTexture, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

/**
 * The Codex-painted RGBA cards (public/art/textures, keyed off black) that replace code-painted ones
 * (round 11): flame licks and embers for the campfire, cumulus for the ride clouds, the warm lamp pool.
 * Registered once by the scene after the kit loads, before the builders run; a builder with no card
 * registered keeps its code painting.
 */
export type Cards = { flameA: Texture; flameB: Texture; embers: Texture; clouds: Texture; poolWarm: Texture };
let cards: Cards | null = null;

export function setCards(c: Cards | null): void {
  cards = c;
}
export function getCards(): Cards | null {
  return cards;
}

/** A card texture: clamped, mipmapped, sRGB. */
export function asCard(t: Texture): Texture {
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** Two cloud cards into the 2x2 sheet the cloud banks sample (a, b; b and a mirrored). */
export function cloudSheetOf(a: CanvasImageSource, b: CanvasImageSource): Texture | null {
  if (typeof document === "undefined") return null;
  const S = 1024;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const h = S / 2;
  ctx.drawImage(a, 0, 0, h, h);
  ctx.drawImage(b, h, 0, h, h);
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(b, -h, h, h, h);
  ctx.drawImage(a, -S, h, h, h);
  ctx.restore();
  return asCard(new CanvasTexture(cv));
}

/**
 * A black-keyed Codex card made safe for mipmapping (round 12): the semi-transparent edge texels carry
 * the dark of the black key, so a mipmapped card grows a dark fringe. Every texel that is not fully
 * opaque takes the colour of the opaque texels round it (bled outward, then the card's mean colour), alpha
 * kept; returned as straight-alpha RGBA rows bottom-up (a DataTexture with flipY false).
 */
export function cleanCardPixels(src: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const n = w * h;
  // Premultiplied colour and weight of the opaque texels.
  let pr = new Float32Array(n);
  let pg = new Float32Array(n);
  let pb = new Float32Array(n);
  let pw = new Float32Array(n);
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let mw = 0;
  for (let i = 0; i < n; i++) {
    const a = src[i * 4 + 3]! / 255;
    if (a < 0.95) continue;
    pr[i] = src[i * 4]!;
    pg[i] = src[i * 4 + 1]!;
    pb[i] = src[i * 4 + 2]!;
    pw[i] = 1;
    mr += src[i * 4]!;
    mg += src[i * 4 + 1]!;
    mb += src[i * 4 + 2]!;
    mw++;
  }
  // Separable box blur (radius 3), twice: the opaque colour spreads about 6 texels out.
  const blur = (s: Float32Array, horiz: boolean): Float32Array<ArrayBuffer> => {
    // Running box sum (radius 3) along rows or columns, clamped at the edges.
    const o = new Float32Array(n);
    const R = 3;
    const len = horiz ? w : h;
    const lines = horiz ? h : w;
    for (let l = 0; l < lines; l++) {
      const idx = (t: number) => {
        const c = Math.min(len - 1, Math.max(0, t));
        return horiz ? l * w + c : c * w + l;
      };
      let acc = 0;
      for (let k = -R; k <= R; k++) acc += s[idx(k)]!;
      for (let t = 0; t < len; t++) {
        o[idx(t)] = acc;
        acc += s[idx(t + R + 1)]! - s[idx(t - R)]!;
      }
    }
    return o;
  };
  for (let pass = 0; pass < 2; pass++) {
    pr = blur(blur(pr, true), false);
    pg = blur(blur(pg, true), false);
    pb = blur(blur(pb, true), false);
    pw = blur(blur(pw, true), false);
  }
  const fr = mw > 0 ? mr / mw : 0;
  const fg = mw > 0 ? mg / mw : 0;
  const fb = mw > 0 ? mb / mw : 0;
  const out = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = ((h - 1 - y) * w + x) * 4;
      const a = src[i * 4 + 3]!;
      if (a >= 242) {
        out[o] = src[i * 4]!;
        out[o + 1] = src[i * 4 + 1]!;
        out[o + 2] = src[i * 4 + 2]!;
      } else {
        const ww = pw[i]!;
        // Near opaque texels: their colour; far out in the empty corners: the card's mean.
        const k = Math.min(1, ww / 0.5);
        out[o] = (ww > 0 ? pr[i]! / ww : fr) * k + fr * (1 - k);
        out[o + 1] = (ww > 0 ? pg[i]! / ww : fg) * k + fg * (1 - k);
        out[o + 2] = (ww > 0 ? pb[i]! / ww : fb) * k + fb * (1 - k);
      }
      out[o + 3] = a;
    }
  }
  return out;
}

/** A cleaned card texture from a canvas (mipmapped, sRGB, clamped or repeating). */
export function cleanCardTexture(cv: HTMLCanvasElement, repeat = false): Texture | null {
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const t = new DataTexture(cleanCardPixels(d, cv.width, cv.height), cv.width, cv.height, RGBAFormat);
  t.flipY = false;
  t.colorSpace = SRGBColorSpace;
  t.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function sheetCanvas(S: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  return ctx ? { cv, ctx } : null;
}

/**
 * The Codex needle spray (its branch comes in at the top-right corner and fans down-left) turned into
 * the conifer bough sheet: four sprays in a 2x2 sheet, each with its base at the bottom centre of its
 * quadrant and its tip at the top (two mirrored, two a little larger), cleaned for mipmaps.
 */
export function needleSheetOf(img: CanvasImageSource): Texture | null {
  const S = 1024;
  const c = sheetCanvas(S);
  if (!c) return null;
  const q = S / 2;
  const looks: [mirror: boolean, k: number][] = [[false, 0.95], [true, 0.95], [true, 1.1], [false, 1.1]];
  looks.forEach(([mirror, k], i) => {
    const x0 = (i % 2) * q;
    const y0 = Math.floor(i / 2) * q;
    const ctx = c.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, q, q);
    ctx.clip();
    ctx.translate(x0 + q / 2, y0 + q - 2);
    if (mirror) ctx.scale(-1, 1);
    // Corner-to-corner diagonal onto the vertical: rotate 135 degrees about the branch's corner.
    ctx.rotate((3 * Math.PI) / 4);
    const s = (q * k) / Math.SQRT2;
    ctx.drawImage(img, -s, 0, s, s);
    ctx.restore();
  });
  return cleanCardTexture(c.cv);
}

/** A card image (one drawing, whole sheet) cleaned for mipmaps. */
export function cleanCardOf(img: CanvasImageSource, size = 512, repeat = false): Texture | null {
  const c = sheetCanvas(size);
  if (!c) return null;
  c.ctx.drawImage(img, 0, 0, size, size);
  return cleanCardTexture(c.cv, repeat);
}

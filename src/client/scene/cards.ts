import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from "three";

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

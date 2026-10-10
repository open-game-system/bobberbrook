/**
 * Where a caught fish's card sits in the catcher's hands (round 09: it floated beside them). The fish
 * is held up on the open side of the head with both hands under its belly: the card's lower edge at
 * the hands' height, its near end just clear of the head (the face is never covered), and big enough
 * to read across the room.
 *
 * The card is a square canvas (CARD_PX) with the fish drawn FISH_PX wide, centred, at its own aspect.
 */
export const CARD_PX = 640;
export const FISH_PX = 520;

export type HoldIn = {
  /** Card size from the fish's size and rarity (world units). */
  base: number;
  /** The sprite's width / height. */
  aspect: number;
  /** Half the head's width with the hat brim (world units). */
  headHalf: number;
  /** How wide the screen is at the catcher's distance (world units); 0 = unknown. */
  screenW: number;
};

export type Hold = {
  /** Card size (world units, the square card's side). */
  size: number;
  /** Card centre's distance from the catcher's centre line, toward the open side (world units). */
  lateral: number;
  /** Card centre's height above the hands (world units): its fish's lower edge sits on the hands. */
  lift: number;
};

/** The visible fish should be at least this share of the screen width (read at TV distance). */
export const MIN_SCREEN_SHARE = 0.085;
/** ...but never more than this many times its own base size (no giant minnows). */
export const MAX_GROW = 1.6;

/**
 * Caps (round 09: a 96 cm Moonfin, new and legendary, was shown 3.8 m wide and covered the catcher):
 * the visible fish is at most MAX_FISH_W wide (about 1.2 fisher heights) and MAX_FISH_H tall (it stays
 * beside the head, never towering over it), and never more than MAX_SCREEN_SHARE of the screen width.
 */
export const MAX_FISH_W = 2.8;
export const MAX_FISH_H = 1.7;
export const MAX_SCREEN_SHARE = 0.2;

export function holdCard(i: HoldIn): Hold {
  const k = FISH_PX / CARD_PX;
  const want = i.screenW > 0 ? (MIN_SCREEN_SHARE * i.screenW) / k : 0;
  const aspect = Math.max(0.3, i.aspect);
  const cap = Math.min(MAX_FISH_W, MAX_FISH_H * aspect, i.screenW > 0 ? MAX_SCREEN_SHARE * i.screenW : Infinity) / k;
  const size = Math.min(cap, i.base * MAX_GROW, Math.max(i.base, want));
  const halfW = (size * k) / 2;
  const halfH = halfW / aspect;
  // The fish's near end just clears the head (its tip is a tail or a snout, the near hand sits under
  // the belly a little further out).
  const lateral = i.headHalf + 0.03 * size + halfW;
  // Lower edge a little below the hands, so the mittens overlap the belly (a grip, not a balance).
  const lift = halfH * 0.86;
  return { size, lateral, lift };
}

/** Clear space between the top of the hat and the held fish (world units). */
export const OVERHEAD_GAP = 0.05;

/**
 * Round 11: the fish is held up above the head with both arms raised (it read as floating beside the
 * catcher). Returns the card centre's height: the fish's belly rests on the raised hands, and its lower
 * edge never comes below the hat (the face is never covered).
 */
export function overhead(i: { size: number; aspect: number; headTop: number; handsY: number }): number {
  const halfH = (i.size * (FISH_PX / CARD_PX)) / 2 / Math.max(0.3, i.aspect);
  return Math.max(i.handsY + halfH * 0.86, i.headTop + OVERHEAD_GAP + halfH);
}

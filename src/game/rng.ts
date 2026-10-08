/** mulberry32: a small deterministic PRNG. Every random choice in the room comes from a seed + a counter. */
export function rand(seed: number, n: number): number {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A float in [min, max) from seed + counter. */
export function between(seed: number, n: number, min: number, max: number): number {
  return min + (max - min) * rand(seed, n);
}

/** Picks an index by weight; weights must not all be 0. */
export function pickWeighted(weights: readonly number[], r: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i] ?? 0;
    if (x < 0) return i;
  }
  return weights.length - 1;
}

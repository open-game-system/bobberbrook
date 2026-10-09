/**
 * Name-tag layout in screen space (NDC): tags of fishers standing close never overlap. A cluster of
 * colliding tags is staggered into two rows (every other tag lifted by a tag height and a gap), then
 * whatever still overlaps is pushed apart sideways, and every tag is kept on screen.
 */
export type TagBox = {
  /** Anchor (bottom centre) in NDC. */
  x: number;
  y: number;
  /** Half width and full height in NDC. */
  hw: number;
  h: number;
  /** Tie-break for tags at the same spot (stable order). */
  seat: number;
};

export type TagShift = { dx: number; dy: number };

/** Clear space kept between two tags (NDC). */
export const TAG_GAP = 0.014;
const EDGE = 0.98;

function overlaps(a: TagBox, as: TagShift, b: TagBox, bs: TagShift, gap: number): { ox: number; oy: number } {
  const ox = a.hw + b.hw + gap - Math.abs(a.x + as.dx - (b.x + bs.dx));
  const ay = a.y + as.dy;
  const by = b.y + bs.dy;
  const oy = Math.min(ay + a.h, by + b.h) + gap * 0.5 - Math.max(ay, by);
  return { ox, oy };
}

export function layoutTags(boxes: readonly TagBox[], out: TagShift[], gap = TAG_GAP): void {
  const n = boxes.length;
  for (let i = 0; i < n; i++) {
    const s = out[i];
    if (s) { s.dx = 0; s.dy = 0; } else out[i] = { dx: 0, dy: 0 };
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => {
    const a = boxes[i]!;
    const b = boxes[j]!;
    return a.x - b.x || a.seat - b.seat;
  });
  // Clusters of tags that collide where they stand: every other one goes up a row.
  let k = 0;
  while (k < n) {
    let end = k;
    while (end + 1 < n) {
      const a = boxes[order[end]!]!;
      const b = boxes[order[end + 1]!]!;
      const { ox, oy } = overlaps(a, out[order[end]!]!, b, out[order[end + 1]!]!, gap);
      if (ox <= 0 || oy <= 0) break;
      end++;
    }
    // Rows by seat rank inside the cluster, not by screen order: when two fishers walk past each other
    // their tags slide sideways instead of swapping rows.
    const members = order.slice(k, end + 1).sort((i, j) => boxes[i]!.seat - boxes[j]!.seat);
    for (let m = 1; m < members.length; m += 2) {
      const i = members[m]!;
      out[i]!.dy = boxes[i]!.h + gap;
    }
    k = end + 1;
  }
  // Whatever still overlaps is pushed apart sideways.
  for (let it = 0; it < 12; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const sa = out[i]!;
        const sb = out[j]!;
        const { ox, oy } = overlaps(a, sa, b, sb, gap);
        if (ox <= 1e-6 || oy <= 0) continue;
        const ax = a.x + sa.dx;
        const bx = b.x + sb.dx;
        const sgn = ax < bx || (ax === bx && a.seat < b.seat) ? 1 : -1;
        sa.dx -= (sgn * ox) / 2;
        sb.dx += (sgn * ox) / 2;
        moved = true;
      }
    }
    // Kept on screen.
    for (let i = 0; i < n; i++) {
      const b = boxes[i]!;
      const s = out[i]!;
      s.dx = Math.min(EDGE - b.hw, Math.max(-EDGE + b.hw, b.x + s.dx)) - b.x;
    }
    if (!moved) break;
  }
}

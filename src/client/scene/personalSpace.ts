/**
 * Round 20 (arrival.png, round 19): the rules set riders down 0.9 m apart round the tower's exit and walk
 * them 4 m in, so four fishers stood on one spot, Juneau hidden inside Mom. On the TV every fisher keeps a
 * little room round them: where two stand nearer than SPACE metres they are drawn eased apart (shared,
 * along the line between them; a pair on the very same spot splits by seat). Draw-only: the rules'
 * positions are untouched.
 */
export const SPACE = 1.5;

export type Spot = { x: number; z: number; ox: number; oz: number; seat: number };

/** Fills each spot's ox/oz with the offset that opens SPACE between every pair (a few relaxation passes). */
export function spaceOut(spots: Spot[]): void {
  for (const s of spots) {
    s.ox = 0;
    s.oz = 0;
  }
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i]!;
        const b = spots[j]!;
        let dx = b.x + b.ox - (a.x + a.ox);
        let dz = b.z + b.oz - (a.z + a.oz);
        let d = Math.hypot(dx, dz);
        if (d >= SPACE) continue;
        if (d < 1e-3) {
          // The very same spot: split along a direction set by the pair's seats.
          const th = (a.seat * 4 + b.seat) * 1.3;
          dx = Math.cos(th);
          dz = Math.sin(th);
          d = 1e-3;
        }
        const push = (SPACE - d) / 2;
        const ux = dx / Math.max(d, 1e-3);
        const uz = dz / Math.max(d, 1e-3);
        const n = Math.hypot(ux, uz) || 1;
        a.ox -= (ux / n) * push;
        a.oz -= (uz / n) * push;
        b.ox += (ux / n) * push;
        b.oz += (uz / n) * push;
      }
    }
  }
}

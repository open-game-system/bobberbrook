/**
 * Which fishers the camera frames when the family is spread out (round-02 critic, Camera 4): never the
 * empty trail between two far-apart places. When spread, the camera frames the active place (whoever has
 * a line in the water, a bite beating a waiting line, otherwise the most recent mover) plus anyone near
 * them; the rest get screen-edge markers.
 */

/** "hot": a bite, a reel or a catch; "line": a line in the water; "idle": walking or standing. */
export type Member = { seat: number; x: number; z: number; activity: "hot" | "line" | "idle"; inputAt: number; place: string | null };
export type SplitResult = { split: boolean; lead: number; framed: ReadonlySet<number> };

/** Spread (metres from the lead) at which the family counts as split, and back together. */
export const SPLIT_AT = 22;
export const REGROUP_AT = 16;
/** Fishers this close to the lead share its shot. */
const NEIGHBOUR = 12;
/** Seconds the camera stays on a place before an equal claim may take it. */
const HOLD_S = 4;

const tier = (a: Member["activity"]): number => (a === "hot" ? 2 : a === "line" ? 1 : 0);

export class SplitFocus {
  private lead = -1;
  private leadSince = 0;
  private split = false;
  private readonly framed = new Set<number>();

  /** `now` in seconds (any clock); `inputAt` on the same clock. */
  update(members: readonly Member[], now: number): SplitResult {
    this.framed.clear();
    if (members.length === 0) {
      this.lead = -1;
      this.split = false;
      return { split: false, lead: -1, framed: this.framed };
    }
    const cur = members.find((x) => x.seat === this.lead);
    let best = cur ?? members[0]!;
    for (const x of members) {
      const tb = tier(best.activity);
      const tx = tier(x.activity);
      if (tx > tb || (tx === tb && x.inputAt > best.inputAt)) best = x;
    }
    // Stick with the current lead unless the newcomer is hotter, or the hold is over and it is more recent.
    if (cur && best !== cur) {
      const hotter = tier(best.activity) > tier(cur.activity);
      if (!hotter && (tier(best.activity) < tier(cur.activity) || now - this.leadSince < HOLD_S)) best = cur;
    }
    if (best.seat !== this.lead) {
      this.lead = best.seat;
      this.leadSince = now;
    }
    // Everyone at the lead's place (round its pond) or close by shares the shot; the family is split
    // only when someone else is far off.
    const lead = best;
    const near = (x: Member) => (lead.place !== null && x.place === lead.place) || Math.hypot(x.x - lead.x, x.z - lead.z) <= NEIGHBOUR;
    let far = 0;
    for (const x of members) if (!near(x)) far = Math.max(far, Math.hypot(x.x - lead.x, x.z - lead.z));
    this.split = this.split ? far > REGROUP_AT : far > SPLIT_AT;
    for (const x of members) if (!this.split || near(x)) this.framed.add(x.seat);
    return { split: this.split, lead: this.lead, framed: this.framed };
  }
}

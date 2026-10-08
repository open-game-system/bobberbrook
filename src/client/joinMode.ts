import type { SessionSnapshot } from "@open-game-system/profile-kit";

/** Someone on the OGS couch, as the TV's verified game token names them. */
export type CouchPlayer = { id: string; name: string };

export type PhoneJoinUi =
  /** A plain browser: others scan the QR or type the room code. */
  | { kind: "scan" }
  /** Inside OGS: who's on the couch and whether each has picked up a device yet (no QR, no code). */
  | { kind: "couch"; couch: { name: string; fishing: boolean }[] };

/**
 * The host phone's join panel. Outside OGS others join by scanning. Inside OGS (spec rule 1) they come
 * from the couch: no room code or QR, only who is fishing and who isn't yet.
 */
export function phoneJoinUi(input: { inOgs: boolean; couch: CouchPlayer[]; fishingIds: (string | null)[] }): PhoneJoinUi {
  if (!input.inOgs) return { kind: "scan" };
  const ids = new Set(input.fishingIds.filter((x): x is string => x !== null));
  return { kind: "couch", couch: input.couch.map((p) => ({ name: p.name, fishing: ids.has(p.id) })) };
}

/**
 * The TV's join ticket (QR + room code). On the OGS TV (the launcher's ogs:start came) there is none;
 * a framed page waits for the launcher before it shows anything, so the OGS TV never flashes a code.
 */
export function tvJoinUi(input: { framed: boolean; session: SessionSnapshot }): "ticket" | "couch" | "pending" {
  if (!input.framed) return "ticket";
  if (input.session === undefined) return "pending";
  return input.session === null ? "ticket" : "couch";
}

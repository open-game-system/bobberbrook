import type { GameToken } from "@open-game-system/profile-kit/server";
import { RoomClientEventSchema } from "./room.schemas";
import type { OgsCouchEvent, OgsJoinEvent, RoomClientEvent } from "./room.types";

/** Bobberbrook's id in the OGS catalogue: game tokens for any other game are refused. */
export const OGS_APP_ID = "bobberbrook";

export type JoinEvent = Extract<RoomClientEvent, { type: "JOIN" }>;
/** A JOIN as the machine gets it: verified (OGS_JOIN), or typed with the token dropped. */
export type TrustedJoin = OgsJoinEvent | Omit<JoinEvent, "ogsToken">;
export type CouchEvent = Extract<RoomClientEvent, { type: "COUCH" }>;

function clientEventOf(message: string | ArrayBuffer): RoomClientEvent | null {
  const text = typeof message === "string" ? message : new TextDecoder().decode(message);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = RoomClientEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** A socket message that is a JOIN carrying an OGS token (it must be verified before the machine sees it). */
export function joinFromMessage(message: string | ArrayBuffer): JoinEvent | null {
  const event = clientEventOf(message);
  return event?.type === "JOIN" && event.ogsToken !== undefined ? event : null;
}

/** A socket message that is the TV's COUCH (its OGS token must be verified before the machine sees it). */
export function couchFromMessage(message: string | ArrayBuffer): CouchEvent | null {
  const event = clientEventOf(message);
  return event?.type === "COUCH" ? event : null;
}

/** A valid Bobberbrook TV token (which names the couch's players) becomes OGS_COUCH; anything else is dropped. */
export async function trustCouch(couch: CouchEvent, verify: (token: string) => Promise<GameToken | null>): Promise<OgsCouchEvent | null> {
  const claims = couch.ogsToken === "" ? null : await verify(couch.ogsToken);
  if (!claims?.players) return null;
  return { type: "OGS_COUCH", players: claims.players.map((p) => ({ id: p.id, name: p.name })) };
}

/** A valid token for this game names the seat (OGS_JOIN); anything else is an ordinary typed-name join. */
export async function trustJoin(join: JoinEvent, verify: (token: string) => Promise<GameToken | null>): Promise<TrustedJoin> {
  const claims = join.ogsToken === undefined ? null : await verify(join.ogsToken);
  if (!claims) return { type: "JOIN", name: join.name };
  return { type: "OGS_JOIN", profile: { id: claims.sub, handle: claims.handle, name: claims.name, avatar: claims.avatar } };
}

import type { ActorKitSystemEvent, BaseActorKitEvent, WithActorKitEvent, WithActorKitInput } from "actor-kit";
import type { z } from "zod";
import type { Env } from "./env";
import type { Lake } from "./game/lake";
import type {
  BootSchema, LakeSchema, RoomClientEventSchema, RoomInputPropsSchema, RoomPrivateContextSchema, RoomPublicContextSchema, RoomServiceEventSchema,
} from "./room.schemas";

export type RoomInputProps = z.infer<typeof RoomInputPropsSchema>;
export type RoomInput = WithActorKitInput<RoomInputProps>;
export type RoomClientEvent = z.infer<typeof RoomClientEventSchema>;
export type RoomServiceEvent = z.infer<typeof RoomServiceEventSchema>;

/** The OGS player behind a verified game token (never parsed from a client message). */
export type OgsPlayer = { id: string; handle: string; name: string; avatar: string };
/** A JOIN whose OGS token the Room server verified. Not in the client schema: only the server sends it. */
export type OgsJoinEvent = { type: "OGS_JOIN"; profile: OgsPlayer };
/** Who's on the OGS couch: the Room server verified the TV's game token. */
export type OgsCouchEvent = { type: "OGS_COUCH"; players: { id: string; name: string }[] };

export type RoomEvent = (
  | WithActorKitEvent<RoomClientEvent, "client">
  | WithActorKitEvent<OgsJoinEvent, "client">
  | WithActorKitEvent<OgsCouchEvent, "client">
  | WithActorKitEvent<RoomServiceEvent, "service">
  | ActorKitSystemEvent
) &
  BaseActorKitEvent<Env>;

export type RoomPublicContext = z.infer<typeof RoomPublicContextSchema>;
export type RoomPrivateContext = z.infer<typeof RoomPrivateContextSchema>;
export type Boot = z.infer<typeof BootSchema>;

/** The parsed lake and the room's own Lake type must stay the same shape. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const LAKE_SCHEMA_MATCHES: Same<z.infer<typeof LakeSchema>, Lake> = true;

/** Never sent to any client. */
export type RoomServerOnlyContext = {
  tvId: string | null;
  /** callerId → seat. */
  seats: Record<string, number>;
  hostId: string | null;
};

export type RoomServerContext = {
  public: RoomPublicContext;
  private: Record<string, RoomPrivateContext>;
  server: RoomServerOnlyContext;
};

import { createActorKitRouter, createMachineServer } from "actor-kit/worker";
import { verifyOgsToken } from "@open-game-system/profile-kit/server";
import { z } from "zod";
import type { Env } from "./env";
import { OGS_APP_ID, couchFromMessage, joinFromMessage, trustCouch, trustJoin } from "./ogsJoin";
import { roomMachine } from "./room.machine";
import { RoomClientEventSchema, RoomInputPropsSchema, RoomServiceEventSchema } from "./room.schemas";

const RoomMachineServer = createMachineServer({
  machine: roomMachine,
  schemas: {
    clientEvent: RoomClientEventSchema,
    serviceEvent: RoomServiceEventSchema,
    inputProps: RoomInputPropsSchema,
  },
  options: {
    persisted: true,
  },
});

/** actor-kit keeps each socket's caller in its attachment. */
const AttachmentSchema = z.object({ caller: z.object({ id: z.string(), type: z.enum(["client", "service", "system"]) }) });

/**
 * The room's Durable Object. A phone in the OGS app joins with its OGS game token: the token is
 * verified here (async, so before the event reaches the machine) and a valid one becomes OGS_JOIN,
 * which names the seat with the token's name. The OGS TV's COUCH is verified the same way and becomes
 * OGS_COUCH (who's on the couch). Every other message goes to actor-kit as before.
 */
export class Room extends RoomMachineServer {
  readonly #jwksUrl: string | undefined;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.#jwksUrl = env.OGS_JWKS_URL;
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const join = joinFromMessage(message);
    const couch = couchFromMessage(message);
    const attachment = AttachmentSchema.safeParse(ws.deserializeAttachment());
    if ((join || couch) && attachment.success && attachment.data.caller.type === "client") {
      const caller = { id: attachment.data.caller.id, type: "client" as const };
      const verify = (token: string) => verifyOgsToken(token, { appId: OGS_APP_ID, jwksUrl: this.#jwksUrl });
      const event = join ? await trustJoin(join, verify) : couch ? await trustCouch(couch, verify) : null;
      // Like actor-kit's own delivery: the event plus the socket's caller (the machine checks the TV sent a couch).
      if (!event) return;
      const withCaller = { ...event, caller };
      this.send(withCaller);
      return;
    }
    return super.webSocketMessage?.(ws, message);
  }
}

export type RoomServer = InstanceType<typeof Room>;

export interface WorkerEnv extends Env {
  ASSETS: Fetcher;
  ROOM: DurableObjectNamespace<RoomServer>;
}

export const actorKitRouter = createActorKitRouter<WorkerEnv>(["room"]);

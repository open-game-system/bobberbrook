import { assign, setup } from "xstate";
import { action, join, loadProgress, move, newLake, reelHold, setCampfire, setEasy, step, type Lake } from "./game/lake";
import type { RoomEvent, RoomInput, RoomPrivateContext, RoomServerContext } from "./room.types";

/** A typed name, tidied: trimmed, inner spaces collapsed, at most 14 characters; blank = null. */
function tidyName(raw: string | undefined): string | null {
  const name = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 14).trim();
  return name.length > 0 ? name : null;
}

const callerOf = (event: RoomEvent): string | null => ("caller" in event && event.caller.type === "client" ? event.caller.id : null);

function seatOf(context: RoomServerContext, event: RoomEvent): number | null {
  const id = callerOf(event);
  return id === null ? null : (context.server.seats[id] ?? null);
}

const isHost = (context: RoomServerContext, event: RoomEvent) => callerOf(event) !== null && callerOf(event) === context.server.hostId;

/** Every caller's own slot: the TV, or a fisher (its seat, and whether it is the host). */
function withViews(context: RoomServerContext): RoomServerContext {
  const views: Record<string, RoomPrivateContext> = {};
  if (context.server.tvId) views[context.server.tvId] = { role: "tv" };
  for (const [id, seat] of Object.entries(context.server.seats)) views[id] = { role: "fisher", seat, host: id === context.server.hostId };
  return { ...context, private: views };
}

function withLake(context: RoomServerContext, lake: Lake): RoomServerContext {
  if (lake === context.public.lake) return context;
  return { ...context, public: { ...context.public, lake } };
}

export const roomMachine = setup({
  types: {} as { context: RoomServerContext; events: RoomEvent; input: RoomInput },
  actions: {
    tick: assign(({ context }) => withLake(context, step(context.public.lake, Date.now()))),
    join: assign(({ context, event }) => {
      const id = callerOf(event);
      if ((event.type !== "JOIN" && event.type !== "OGS_JOIN") || id === null || id === context.server.tvId) return context;
      if (context.server.seats[id] !== undefined) return context;
      const name = tidyName(event.type === "OGS_JOIN" ? event.profile.name : event.name);
      const ogsId = event.type === "OGS_JOIN" ? event.profile.id : null;
      const joined = join(step(context.public.lake, Date.now()), { name, ogsId });
      if (joined.seat === null) return context;
      const seats = { ...context.server.seats, [id]: joined.seat };
      // An OGS player coming back on a new device takes their seat back from the old one.
      for (const [other, seat] of Object.entries(seats)) if (other !== id && seat === joined.seat) delete seats[other];
      const hostId = context.server.hostId ?? id;
      return withViews({ ...withLake(context, joined.lake), server: { ...context.server, seats, hostId } });
    }),
    move: assign(({ context, event }) => {
      const seat = seatOf(context, event);
      if (event.type !== "MOVE" || seat === null) return context;
      return withLake(context, move(context.public.lake, seat, { x: event.x, y: event.y }, Date.now()));
    }),
    action: assign(({ context, event }) => {
      const seat = seatOf(context, event);
      if (event.type !== "ACTION" || seat === null) return context;
      return withLake(context, action(context.public.lake, seat, Date.now()));
    }),
    reel: assign(({ context, event }) => {
      const seat = seatOf(context, event);
      if (event.type !== "REEL" || seat === null) return context;
      return withLake(context, reelHold(context.public.lake, seat, event.holding, Date.now()));
    }),
    easy: assign(({ context, event }) => {
      if (event.type !== "EASY" || !isHost(context, event)) return context;
      return withLake(context, setEasy(context.public.lake, event.seat, event.on));
    }),
    campfire: assign(({ context, event }) => {
      if (event.type !== "CAMPFIRE" || !isHost(context, event)) return context;
      return withLake(context, setCampfire(context.public.lake, event.on, Date.now()));
    }),
    progress: assign(({ context, event }) => {
      if (event.type !== "PROGRESS" || !isHost(context, event)) return context;
      return withLake(context, loadProgress(context.public.lake, event.progress));
    }),
    couch: assign(({ context, event }) => {
      if (event.type !== "OGS_COUCH" || callerOf(event) !== context.server.tvId) return context;
      return { ...context, public: { ...context.public, couch: event.players.map((p) => ({ id: p.id, name: p.name })) } };
    }),
  },
}).createMachine({
  id: "room",
  context: ({ input }) =>
    withViews({
      public: { roomCode: input.id, lake: newLake(Math.floor(Math.random() * 2 ** 31), Date.now()), couch: [] },
      private: {},
      server: { tvId: input.caller.type === "client" ? input.caller.id : null, seats: {}, hostId: null },
    }),
  initial: "open",
  states: {
    open: {
      on: {
        JOIN: { actions: "join" },
        OGS_JOIN: { actions: "join" },
        MOVE: { actions: "move" },
        ACTION: { actions: "action" },
        REEL: { actions: "reel" },
        EASY: { actions: "easy" },
        CAMPFIRE: { actions: "campfire" },
        PROGRESS: { actions: "progress" },
        TICK: { actions: "tick" },
        OGS_COUCH: { actions: "couch" },
        // A room restored from storage (a deploy, an eviction) catches up with its clock.
        RESUME: { actions: "tick" },
      },
    },
  },
});

import { assign, setup } from "xstate";
import { action, join, loadProgress, move, newLake, reelHold, rename, setCampfire, setEasy, step, tidyName, type Lake, type SeatColor } from "./game/lake";
import type { RoomEvent, RoomInput, RoomPrivateContext, RoomServerContext } from "./room.types";


const callerOf = (event: RoomEvent): string | null => ("caller" in event && event.caller.type === "client" ? event.caller.id : null);

function seatOf(context: RoomServerContext, event: RoomEvent): number | null {
  const id = callerOf(event);
  return id === null ? null : (context.server.seats[id] ?? null);
}

const isHost = (context: RoomServerContext, event: RoomEvent) => callerOf(event) !== null && callerOf(event) === context.server.hostId;

/** Who is asking for a seat and as whom; null for the TV, a seated caller, or any other event. */
function joinerOf(context: RoomServerContext, event: RoomEvent): { id: string; name: string | null; ogsId: string | null; color?: SeatColor } | null {
  const id = callerOf(event);
  if (id === null || id === context.server.tvId || context.server.seats[id] !== undefined) return null;
  if (event.type === "OGS_JOIN") return { id, name: tidyName(event.profile.name), ogsId: event.profile.id, color: event.color };
  if (event.type === "JOIN") return { id, name: tidyName(event.name), ogsId: null, color: event.color };
  return null;
}

/** The seat map with a caller in a seat. An OGS player coming back on a new device takes their seat back from the old one. */
function seatsWith(seats: Record<string, number>, id: string, seat: number): Record<string, number> {
  const next = { ...seats, [id]: seat };
  for (const [other, s] of Object.entries(next)) if (other !== id && s === seat) delete next[other];
  return next;
}

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
      const who = joinerOf(context, event);
      if (who === null) return context;
      const joined = join(step(context.public.lake, Date.now()), { name: who.name, ogsId: who.ogsId, color: who.color });
      if (joined.seat === null) return context;
      const seats = seatsWith(context.server.seats, who.id, joined.seat);
      const hostId = context.server.hostId ?? who.id;
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
    rename: assign(({ context, event }) => {
      if (event.type !== "RENAME" || !isHost(context, event)) return context;
      return withLake(context, rename(context.public.lake, event.seat, event.name));
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
        RENAME: { actions: "rename" },
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { roomMachine } from "./room.machine";
import { LakeSchema } from "./room.schemas";
import type { RoomEvent } from "./room.types";
import { lakeRadius, WEST } from "./game/world";

const env = {} as never;
const storage = {} as never;
const client = (id: string) => ({ id, type: "client" as const });

function room() {
  const actor = createActor(roomMachine, { input: { id: "ABCD", caller: client("tv"), storage, env } as never });
  actor.start();
  const send = (id: string, e: Record<string, unknown>) => actor.send({ ...e, caller: client(id), env, storage } as unknown as RoomEvent);
  return { actor, send, ctx: () => actor.getSnapshot().context };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe("the room", () => {
  it("seats phones as fishers, the first one hosts, the TV never takes a seat", () => {
    const r = room();
    r.send("tv", { type: "JOIN", name: "TV" });
    r.send("dad", { type: "JOIN", name: "  Dad  " });
    r.send("kid", { type: "JOIN", name: "Juneau" });
    r.send("dad", { type: "JOIN", name: "Dad again" });
    const c = r.ctx();
    expect(c.public.lake.fishers.map((f) => f.name)).toEqual(["Dad", "Juneau"]);
    expect(c.private.dad).toEqual({ role: "fisher", seat: 0, host: true });
    expect(c.private.kid).toEqual({ role: "fisher", seat: 1, host: false });
    expect(c.private.tv).toEqual({ role: "tv" });
  });

  it("lets an OGS player take their seat back on a new device", () => {
    const r = room();
    r.send("dad-phone", { type: "OGS_JOIN", profile: { id: "p1", handle: "dad", name: "Dad", avatar: "" } });
    r.send("dad-tablet", { type: "OGS_JOIN", profile: { id: "p1", handle: "dad", name: "Dad", avatar: "" } });
    expect(r.ctx().server.seats).toEqual({ "dad-tablet": 0 });
    expect(r.ctx().public.lake.fishers).toHaveLength(1);
  });

  it("only takes moves, casts and reels from seated fishers", () => {
    const r = room();
    r.send("dad", { type: "JOIN", name: "Dad" });
    r.send("stranger", { type: "MOVE", x: 1, y: 0 });
    expect(r.ctx().public.lake.fishers[0]!.vel).toEqual({ x: 0, z: 0 });
    r.send("dad", { type: "MOVE", x: 1, y: 0 });
    expect(r.ctx().public.lake.fishers[0]!.vel.x).toBeGreaterThan(0);
  });

  it("only lets the host set easy mode, start the campfire and load progress", () => {
    const r = room();
    r.send("dad", { type: "JOIN", name: "Dad" });
    r.send("kid", { type: "JOIN", name: "Kid" });
    r.send("kid", { type: "EASY", seat: 1, on: true });
    r.send("kid", { type: "CAMPFIRE", on: true });
    r.send("kid", { type: "PROGRESS", progress: { journal: {}, shells: 99 } });
    expect(r.ctx().public.lake.fishers[1]!.easy).toBe(false);
    expect(r.ctx().public.lake.campfire).toBe(false);
    expect(r.ctx().public.lake.shells).toBe(0);
    r.send("dad", { type: "EASY", seat: 1, on: true });
    r.send("dad", { type: "CAMPFIRE", on: true });
    r.send("dad", { type: "PROGRESS", progress: { journal: {}, shells: 99 } });
    expect(r.ctx().public.lake.fishers[1]!.easy).toBe(true);
    expect(r.ctx().public.lake.campfire).toBe(true);
    expect(r.ctx().public.lake.shells).toBe(99);
  });

  it("plays a whole catch over events and ticks, keeping a lake every screen can parse", () => {
    const r = room();
    r.send("dad", { type: "JOIN", name: "Dad" });
    // Walk to the west shore: teleport through the lake state is not possible from a phone, so walk there.
    const target = { x: -(lakeRadius(WEST) + 1), z: 0 };
    const p = r.ctx().public.lake.fishers[0]!.pos;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const len = Math.hypot(dx, dz);
    r.send("dad", { type: "MOVE", x: dx / len, y: -dz / len });
    vi.advanceTimersByTime((len / 4.2) * 1000);
    r.send("dad", { type: "MOVE", x: 0, y: 0 });
    r.send("dad", { type: "ACTION" });
    expect(r.ctx().public.lake.fishers[0]!.mode).toBe("cast");
    for (let i = 0; i < 400 && r.ctx().public.lake.fishers[0]!.mode !== "bite"; i++) {
      vi.advanceTimersByTime(100);
      r.send("tv", { type: "TICK" });
    }
    expect(r.ctx().public.lake.fishers[0]!.mode).toBe("bite");
    r.send("dad", { type: "ACTION" });
    r.send("dad", { type: "REEL", holding: true });
    for (let i = 0; i < 400 && r.ctx().public.lake.fishers[0]!.mode === "reel"; i++) {
      vi.advanceTimersByTime(100);
      r.send("tv", { type: "TICK" });
    }
    expect(r.ctx().public.lake.fishers[0]!.mode).toBe("catch");
    expect(r.ctx().public.lake.log).toHaveLength(1);
    expect(LakeSchema.safeParse(r.ctx().public.lake).success).toBe(true);
  });

  it("names the couch only from the TV", () => {
    const r = room();
    r.send("dad", { type: "OGS_COUCH", players: [{ id: "x", name: "X" }] });
    expect(r.ctx().public.couch).toEqual([]);
    r.send("tv", { type: "OGS_COUCH", players: [{ id: "x", name: "X" }] });
    expect(r.ctx().public.couch).toEqual([{ id: "x", name: "X" }]);
  });
});

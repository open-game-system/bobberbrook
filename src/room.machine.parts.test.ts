import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { roomMachine } from "./room.machine";
import type { RoomEvent } from "./room.types";

const env = {} as never;
const storage = {} as never;
const client = (id: string) => ({ id, type: "client" as const });

function room() {
  const actor = createActor(roomMachine, { input: { id: "ABCD", caller: client("tv"), storage, env } as never });
  actor.start();
  const send = (id: string, e: Record<string, unknown>, caller: { id: string; type: string } = client(id)) =>
    actor.send({ ...e, caller, env, storage } as unknown as RoomEvent);
  return { actor, send, ctx: () => actor.getSnapshot().context };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe("joining the room", () => {
  it("tidies names: trimmed, inner spaces collapsed, at most 14 characters, blank is no name", () => {
    const r = room();
    r.send("a", { type: "JOIN", name: "  Big   Bear  " });
    r.send("b", { type: "JOIN", name: "Abcdefghijklmnopqrst" });
    r.send("c", { type: "JOIN", name: "    " });
    r.send("d", { type: "JOIN" });
    expect(r.ctx().public.lake.fishers.map((f) => f.name)).toEqual(["Big Bear", "Abcdefghijklmn", null, null]);
  });
  it("trims a name cut at 14 characters", () => {
    const r = room();
    r.send("a", { type: "JOIN", name: "Abcdefghijklm nop" });
    expect(r.ctx().public.lake.fishers[0]!.name).toBe("Abcdefghijklm");
  });
  it("turns a fifth phone away and keeps the first host", () => {
    const r = room();
    for (const id of ["a", "b", "c", "d", "e"]) r.send(id, { type: "JOIN", name: id });
    expect(r.ctx().server.seats).toEqual({ a: 0, b: 1, c: 2, d: 3 });
    expect(r.ctx().server.hostId).toBe("a");
    expect(r.ctx().private.e).toBeUndefined();
  });
  it("seats an OGS player under their OGS name and id", () => {
    const r = room();
    r.send("p", { type: "OGS_JOIN", profile: { id: "p1", handle: "mum", name: " Mum ", avatar: "" } });
    expect(r.ctx().public.lake.fishers[0]).toMatchObject({ name: "Mum", ogsId: "p1" });
    expect(r.ctx().private.p).toEqual({ role: "fisher", seat: 0, host: true });
  });
  it("never seats the TV, even as an OGS player", () => {
    const r = room();
    r.send("tv", { type: "OGS_JOIN", profile: { id: "p1", handle: "x", name: "X", avatar: "" } });
    expect(r.ctx().public.lake.fishers).toEqual([]);
  });
  it("ignores events that don't come from a client", () => {
    const r = room();
    r.send("srv", { type: "JOIN", name: "Ghost" }, { id: "srv", type: "service" });
    expect(r.ctx().public.lake.fishers).toEqual([]);
  });
});

describe("playing in the room", () => {
  it("brings the lake up to the clock on a tick or a resume", () => {
    const r = room();
    vi.advanceTimersByTime(5000);
    r.send("tv", { type: "TICK" });
    expect(r.ctx().public.lake.now).toBe(1_005_000);
    vi.advanceTimersByTime(5000);
    r.send("tv", { type: "RESUME" });
    expect(r.ctx().public.lake.now).toBe(1_010_000);
  });
  it("takes casts and reels only from seated fishers", () => {
    const r = room();
    r.send("dad", { type: "JOIN", name: "Dad" });
    const before = r.ctx().public.lake;
    r.send("stranger", { type: "ACTION" });
    r.send("stranger", { type: "REEL", holding: true });
    expect(r.ctx().public.lake).toBe(before);
  });
  it("keeps the same lake when nothing changed", () => {
    const r = room();
    r.send("dad", { type: "JOIN", name: "Dad" });
    const before = r.ctx().public.lake;
    r.send("dad", { type: "REEL", holding: true });
    expect(r.ctx().public.lake).toBe(before);
  });
  it("lets only the host load progress, once", () => {
    const r = room();
    r.send("dad", { type: "JOIN", name: "Dad" });
    r.send("dad", { type: "PROGRESS", progress: { journal: {}, shells: 25 } });
    r.send("dad", { type: "PROGRESS", progress: { journal: {}, shells: 25 } });
    expect(r.ctx().public.lake.shells).toBe(25);
    expect(r.ctx().public.lake.rodTier).toBe(1);
  });
  it("starts a fresh lake for the TV that made the room", () => {
    const r = room();
    expect(r.ctx().public.roomCode).toBe("ABCD");
    expect(r.ctx().server).toEqual({ tvId: "tv", seats: {}, hostId: null });
    expect(r.ctx().private).toEqual({ tv: { role: "tv" } });
    expect(r.ctx().public.lake.startedAt).toBe(1_000_000);
    expect(r.ctx().public.couch).toEqual([]);
  });
});

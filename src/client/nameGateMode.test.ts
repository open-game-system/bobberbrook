import { describe, expect, it } from "vitest";
import { nameGateMode } from "./nameGateMode";

const dad = { id: "p_dad", handle: "dad", name: "Dad", avatar: "https://x.test/dad.webp", token: "h.p.s" };

describe("nameGateMode: what a phone shows before it has a seat", () => {
  it("asks 'Who's playing here?' only in a plain browser (no OGS profile)", () => {
    expect(nameGateMode(null)).toEqual({ kind: "form" });
  });
  it("waits calmly while the OGS app is still answering", () => {
    expect(nameGateMode(undefined)).toEqual({ kind: "waiting" });
  });
  it("joins at once as the OGS player, with their token", () => {
    expect(nameGateMode(dad)).toEqual({ kind: "join", name: "Dad", ogsToken: "h.p.s" });
  });
});

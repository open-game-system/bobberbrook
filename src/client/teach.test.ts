import { describe, expect, it } from "vitest";
import { shouldTeach, teachFor, type TeachMemory } from "./teach";

describe("teaching lines", () => {
  it("teaches each fisher the bite twice, then trusts them", () => {
    const mem: TeachMemory = new Map();
    const bite = { kind: "bite" as const, seat: 1 };
    expect(teachFor([bite], mem)).toEqual(["teach-bite"]);
    expect(teachFor([bite], mem)).toEqual(["teach-bite"]);
    expect(teachFor([bite], mem)).toEqual([]);
    expect(teachFor([{ kind: "bite", seat: 2 }], mem)).toEqual(["teach-bite"]);
  });
  it("says walk-to-the-water once per fisher and the swirl tip once for everyone", () => {
    const mem: TeachMemory = new Map();
    expect(teachFor([{ kind: "joined", seat: 0 }], mem)).toEqual(["teach-walk", "teach-swirl"]);
    expect(teachFor([{ kind: "joined", seat: 1 }], mem)).toEqual(["teach-walk"]);
  });
  it("teaches holding on a hook and nothing for other moments", () => {
    const mem: TeachMemory = new Map();
    expect(teachFor([{ kind: "hooked", seat: 0 }, { kind: "cast", seat: 0 }, { kind: "golden-swirl" }], mem)).toEqual(["teach-hold"]);
  });
  it("counts letting go per fisher", () => {
    const mem: TeachMemory = new Map();
    expect([1, 2, 3].map(() => shouldTeach("teach-letgo", 0, mem))).toEqual([true, true, false]);
  });
});

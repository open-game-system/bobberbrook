import { describe, expect, it } from "vitest";
import { phoneJoinUi, tvJoinUi } from "./joinMode";

describe("phoneJoinUi", () => {
  it("shows the QR outside OGS", () => {
    expect(phoneJoinUi({ inOgs: false, couch: [{ id: "a", name: "A" }], fishingIds: [] })).toEqual({ kind: "scan" });
  });
  it("lists the couch inside OGS, marking who is already fishing", () => {
    expect(phoneJoinUi({ inOgs: true, couch: [{ id: "a", name: "Dad" }, { id: "b", name: "Juneau" }], fishingIds: ["a", null] })).toEqual({
      kind: "couch",
      couch: [{ name: "Dad", fishing: true }, { name: "Juneau", fishing: false }],
    });
  });
});

describe("tvJoinUi", () => {
  it("shows the ticket when not framed or framed by a non-OGS page", () => {
    expect(tvJoinUi({ framed: false, session: undefined })).toBe("ticket");
    expect(tvJoinUi({ framed: true, session: null })).toBe("ticket");
  });
  it("waits, then hides it on the OGS TV", () => {
    expect(tvJoinUi({ framed: true, session: undefined })).toBe("pending");
    expect(tvJoinUi({ framed: true, session: { players: [], token: "", instanceId: "i", mode: "new" } })).toBe("couch");
  });
});

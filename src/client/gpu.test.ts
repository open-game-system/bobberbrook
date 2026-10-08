import { describe, expect, it } from "vitest";
import { qualityFor } from "./gpu";

describe("qualityFor", () => {
  it("is lite on software renderers", () => {
    expect(qualityFor("Google SwiftShader", null)).toBe("lite");
    expect(qualityFor("llvmpipe (LLVM 15)", null)).toBe("lite");
    expect(qualityFor("ANGLE (NVIDIA L4)", null)).toBe("full");
  });
  it("can be forced", () => {
    expect(qualityFor("Google SwiftShader", "full")).toBe("full");
    expect(qualityFor("Apple M3", "lite")).toBe("lite");
  });
});

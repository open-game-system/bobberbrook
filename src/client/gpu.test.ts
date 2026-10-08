import { describe, expect, it } from "vitest";
import { nameFrom, qualityFor, rendererName, type GlLike } from "./gpu";

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

describe("renderer name", () => {
  const gl = (unmasked: boolean, name: unknown): GlLike => ({
    RENDERER: 7937,
    getExtension: () => (unmasked ? { UNMASKED_RENDERER_WEBGL: 37446 } : null),
    getParameter: (p: number) => (p === 37446 || p === 7937 ? name : null),
  });
  it("reads the unmasked name when allowed, else the plain one", () => {
    expect(nameFrom(gl(true, "Apple M5"))).toBe("Apple M5");
    expect(nameFrom(gl(false, "WebKit WebGL"))).toBe("WebKit WebGL");
  });
  it("copes with no context or an odd answer", () => {
    expect(nameFrom(null)).toBe("none");
    expect(nameFrom(gl(true, 42))).toBe("unknown");
  });
  it("says none where there is no DOM", () => {
    expect(rendererName()).toBe("none");
  });
});

import { describe, expect, it } from "vitest";
import { MeshLambertMaterial } from "three";
import { makeCoverUniforms, patchCover } from "./cover";
import { wisteriaCards } from "./foliage";

const fakeShader = () => ({
  uniforms: {} as Record<string, unknown>,
  vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}",
  fragmentShader: "#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}",
});

/**
 * Round 28 (round 27 session 120.9-121.1 s, 128.6-129.2 s): a giant tree's wisteria strand is one tall card
 * per side, its corners above and below a fisher's screen box, so a per-corner fade left the middle of the
 * card over the catcher during the push-in. A strand card fades by the whole strand: every vertex carries the
 * way to the other end of its strand and takes the most cover anywhere along it.
 */
describe("cover span: a hanging strand fades as a whole", () => {
  it("every wisteria vertex points to the other end of its strand, along the same side", () => {
    const g = wisteriaCards([{ x: 1, y: 10, z: 2, len: 8, w: 1, ox: 1, oz: 0 }], 0x888888, 0xffffff, 3);
    const p = g.getAttribute("position");
    const s = g.getAttribute("aCovSpan");
    expect(s.count).toBe(p.count);
    for (let i = 0; i < p.count; i++) {
      const ey = p.getY(i) + s.getY(i);
      // The other end is the strand's other end: the top (y + 0.25) or the bottom (y + 0.25 - 1.25 len).
      const top = 10.25;
      const bottom = 10.25 - 8 * 1.25;
      const atTop = Math.abs(p.getY(i) - top) < 1e-4;
      expect(ey).toBeCloseTo(atTop ? bottom : top, 4);
    }
  });

  it("a material that asks samples cover along the span in its vertex shader, keyed apart", () => {
    const u = makeCoverUniforms();
    const m = new MeshLambertMaterial();
    m.userData.coverPerVertex = true;
    m.userData.coverSpan = true;
    m.customProgramCacheKey = () => "leaf";
    patchCover(m, u);
    const s = fakeShader();
    m.onBeforeCompile(s as never, null as never);
    expect(s.vertexShader).toContain("attribute vec3 aCovSpan;");
    expect(s.vertexShader).toContain("covSpanAmount(");
    expect(m.customProgramCacheKey()).toBe("leaf|cover-vs");
  });

  it("a point behind the lens (a strand the camera is pushing through) counts as fully in the near band", () => {
    const u = makeCoverUniforms();
    const m = new MeshLambertMaterial();
    m.userData.coverPerVertex = true;
    patchCover(m, u);
    const s = fakeShader();
    m.onBeforeCompile(s as never, null as never);
    expect(s.vertexShader).not.toContain("if (clip.w <= 0.05) return 0.0;");
    expect(s.vertexShader).toContain("if (clip.w <= 0.05) return uCovNear.y > 0.01 ? 2.0 * step(uCovNear.z + 0.12, p.y) : 0.0;");
  });
});

describe("cover: the near band leaves nothing", () => {
  it("a surface in the near band dithers to none of its pixels, one over a fisher to uCovKeep", () => {
    const u = makeCoverUniforms();
    const m = new MeshLambertMaterial();
    patchCover(m, u);
    const s = fakeShader();
    m.onBeforeCompile(s as never, null as never);
    expect(s.fragmentShader).toContain("return max(occ, 2.0 * nearOcc);");
    expect(s.fragmentShader).toContain("float cut = min(cov, 1.0) * (1.0 - uCovKeep) + max(cov - 1.0, 0.0) * uCovKeep;");
  });
});

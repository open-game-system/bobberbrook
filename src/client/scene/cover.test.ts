import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, ShaderChunk, ShaderMaterial, Vector3 } from "three";
import { COVER_MAX, coverScene, isCoverPatched, makeCoverUniforms, patchCover, setCoverFishers } from "./cover";

const fakeShader = () => ({
  uniforms: {} as Record<string, unknown>,
  vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}",
  fragmentShader: "#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n#include <alphatest_fragment>\n}",
});
const compile = (m: { onBeforeCompile: (s: never, r: never) => void }) => {
  const s = fakeShader();
  m.onBeforeCompile(s as never, null as never);
  return s;
};

function camAt(pos: Vector3, look: Vector3): PerspectiveCamera {
  const c = new PerspectiveCamera(45, 16 / 9, 0.1, 500);
  c.position.copy(pos);
  c.lookAt(look);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

describe("cover: every scenery material dissolves where it stands over a fisher", () => {
  it("adds the fade to a material's shader after its own patch, and keys its program apart", () => {
    const u = makeCoverUniforms();
    const m = new MeshLambertMaterial();
    m.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace("#include <alphatest_fragment>", "#include <alphatest_fragment>\n// own"); };
    m.customProgramCacheKey = () => "bobber-own";
    patchCover(m, u);
    const s = compile(m);
    expect(s.fragmentShader).toContain("// own");
    expect(s.fragmentShader).toContain("covAmount(vCovW, vCovClip)");
    expect(s.vertexShader).toContain("vCovW =");
    expect(s.uniforms.uCovBox).toBe(u.uCovBox);
    expect(m.customProgramCacheKey()).toBe("bobber-own|cover");
    expect(isCoverPatched(m)).toBe(true);
  });

  it("patches once (a material shared by many meshes keeps one program)", () => {
    const u = makeCoverUniforms();
    const m = new MeshLambertMaterial();
    patchCover(m, u);
    patchCover(m, u);
    const s = compile(m);
    expect(s.fragmentShader.split("covAmount(vCovW, vCovClip)").length).toBe(2);
    expect(m.customProgramCacheKey().endsWith("|cover|cover")).toBe(false);
  });

  it("keys a material without its own key by its original compile hook (two different builders never share a program)", () => {
    const u = makeCoverUniforms();
    const a = new MeshLambertMaterial();
    a.onBeforeCompile = (s) => { s.vertexShader += "// a"; };
    const b = new MeshLambertMaterial();
    b.onBeforeCompile = (s) => { s.vertexShader += "// b"; };
    patchCover(a, u);
    patchCover(b, u);
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });

  it("leaves a shader without the standard chunks alone", () => {
    const u = makeCoverUniforms();
    const m = new ShaderMaterial({ vertexShader: "void main(){}", fragmentShader: "void main(){}" });
    patchCover(m, u);
    const s = { uniforms: {}, vertexShader: "void main(){}", fragmentShader: "void main(){}" };
    m.onBeforeCompile(s as never, null as never);
    expect(s.fragmentShader).toBe("void main(){}");
  });

  it("injects GLSL that the real Lambert chunks accept (the anchors exist in three)", () => {
    expect(ShaderChunk.meshlambert_vert).toContain("#include <project_vertex>");
    expect(ShaderChunk.meshlambert_frag).toContain("#include <clipping_planes_fragment>");
  });

  it("patches every scenery mesh by default, skips exempt subtrees, and gives them an unpatched twin of a shared material", () => {
    const u = makeCoverUniforms();
    const root = new Group();
    const shared = new MeshLambertMaterial();
    const prop = new Mesh(new BoxGeometry(), shared);
    const lamp = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const nested = new Group();
    nested.add(lamp);
    const ride = new Group();
    ride.userData.coverExempt = true;
    const hull = new Mesh(new BoxGeometry(), shared);
    ride.add(hull);
    const fisher = new Group();
    fisher.userData.coverExempt = true;
    const body = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
    fisher.add(body);
    root.add(prop, nested, ride, fisher);
    coverScene(root, u);
    expect(isCoverPatched(shared)).toBe(true);
    expect(isCoverPatched(lamp.material)).toBe(true);
    expect(isCoverPatched(body.material)).toBe(false);
    expect(hull.material).not.toBe(shared);
    expect(isCoverPatched(hull.material)).toBe(false);
    // A later pass keeps the twin (one clone per shared material, its program the original's).
    const twin = hull.material;
    coverScene(root, u);
    expect(hull.material).toBe(twin);
  });

  it("frames each fisher's body in a screen box with its depth and feet, and blanks the unused slots", () => {
    const u = makeCoverUniforms();
    const cam = camAt(new Vector3(0, 6, 12), new Vector3(0, 1, 0));
    setCoverFishers(u, cam, [{ x: -1.5, y: 0, z: 0 }, { x: 1.5, y: 0.4, z: -1 }]);
    const [a, b, c] = u.uCovBox.value;
    const [fa, fb] = u.uCovFish.value;
    // Inside the screen, left fisher left of the right one, body taller than wide.
    expect(a!.x).toBeGreaterThan(0);
    expect(a!.z).toBeLessThan(b!.z);
    expect(a!.w - a!.y).toBeGreaterThan(a!.z - a!.x);
    // The body's centre projects inside its own box.
    const p = new Vector3(-1.5, 1.1, 0).project(cam);
    expect(p.x * 0.5 + 0.5).toBeGreaterThan(a!.x);
    expect(p.x * 0.5 + 0.5).toBeLessThan(a!.z);
    expect(p.y * 0.5 + 0.5).toBeGreaterThan(a!.y);
    expect(p.y * 0.5 + 0.5).toBeLessThan(a!.w);
    // View depth (metres along the view) and feet height.
    expect(fa!.x).toBeGreaterThan(10);
    expect(fa!.x).toBeLessThan(15);
    expect(fb!.y).toBeCloseTo(0.4);
    // Looking down, the feet lie deeper than the chest: view depth falls per metre up.
    const fwd = new Vector3();
    cam.getWorldDirection(fwd);
    expect(fa!.z).toBeCloseTo(fwd.y);
    expect(fa!.z).toBeLessThan(0);
    // Unused slots are empty boxes (x0 > x1), and there are COVER_MAX of them.
    expect(u.uCovBox.value.length).toBe(COVER_MAX);
    expect(c!.x).toBeGreaterThan(c!.z);
  });

  it("sets a near band that follows the nearest fisher (a push-in clears everything well in front of the catcher)", () => {
    const u = makeCoverUniforms();
    setCoverFishers(u, camAt(new Vector3(0, 3, 8), new Vector3(0, 1, 0)), [{ x: 0, y: 0, z: 0 }]);
    const pushed = u.uCovNear.value.clone();
    setCoverFishers(u, camAt(new Vector3(0, 12, 26), new Vector3(0, 1, 0)), [{ x: 0, y: 0, z: 0 }]);
    const wide = u.uCovNear.value.clone();
    expect(pushed.x).toBeLessThan(pushed.y);
    expect(pushed.y).toBeLessThan(8);
    expect(wide.y).toBeGreaterThan(pushed.y);
    // Nobody to protect: no band (and no zero-width smoothstep).
    setCoverFishers(u, camAt(new Vector3(0, 3, 8), new Vector3(0, 1, 0)), []);
    expect(u.uCovNear.value.y).toBeGreaterThan(u.uCovNear.value.x);
    expect(u.uCovNear.value.y).toBeLessThan(0.01);
  });
});

import { Color, Light, UnsignedByteType, WebGLRenderTarget, type Camera, type Object3D, type Scene, type Vector4, type WebGLRenderer } from "three";
import type { CoverUniforms } from "./cover";

export type CoverReport = { boxes: { px: number; covered: number; frac: number }[]; worst: number; /** With `detail`: worst share per top-level scenery object that covers anyone. */ by?: Record<string, number> };

const W = 640;
const H = 360;
/** The clear colour no fisher pixel paints exactly (the fisher mask is "anything else"). */
const KEY = new Color(1, 0, 1);

/** Counts, per fisher box, fisher pixels in `all` that are missing from `seen` (both read as RGBA bytes). */
export function coveredIn(all: Uint8Array, seen: Uint8Array, w: number, h: number, boxes: readonly Vector4[]): CoverReport {
  const out: CoverReport = { boxes: [], worst: 0 };
  const isKey = (a: Uint8Array, i: number) => a[i] === 255 && a[i + 1] === 0 && a[i + 2] === 255;
  for (const b of boxes) {
    if (b.z < b.x) continue;
    let px = 0;
    let covered = 0;
    const x0 = Math.max(0, Math.floor(b.x * w)), x1 = Math.min(w - 1, Math.ceil(b.z * w));
    const y0 = Math.max(0, Math.floor(b.y * h)), y1 = Math.min(h - 1, Math.ceil(b.w * h));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        if (isKey(all, i)) continue;
        px++;
        if (isKey(seen, i)) covered++;
      }
    const frac = px > 0 ? covered / px : 0;
    out.boxes.push({ px, covered, frac });
    out.worst = Math.max(out.worst, frac);
  }
  return out;
}

/**
 * The lab's cover check (an ID-mask pass): draws the fishers alone, then the scenery (everything not
 * exempt) followed by the fishers depth-tested against it, with the fade's dither off (covering pixels
 * fully gone). A fisher pixel inside its box that the second pass loses is scenery left over a fisher.
 * Same render-target kind as the post chain, so no new shader programs.
 */
export function coverCheck(renderer: WebGLRenderer, scene: Scene, camera: Camera, fishers: Object3D, cover: CoverUniforms, detail: boolean | string = false): CoverReport {
  const rt = new WebGLRenderTarget(W, H, { type: UnsignedByteType });
  const prevTarget = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  const prevClear = renderer.getClearColor(new Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevBg = scene.background;
  const prevKeep = cover.uCovKeep.value;
  const vis = new Map<Object3D, boolean>();
  for (const o of scene.children) vis.set(o, o.visible);
  // Exempt objects nested in the scenery (seats the family sits on) are not scenery either.
  const nested: Object3D[] = [];
  for (const o of scene.children) if (o.userData.coverExempt !== true) o.traverse((c) => { if (c !== o && c.userData.coverExempt === true && c.visible) nested.push(c); });
  for (const c of nested) c.visible = false;
  // Ground decals that belong to a fisher (the seat ring at the feet) are not the fisher's body.
  const decals: Object3D[] = [];
  fishers.traverse((c) => { if (c.userData.coverCheckSkip === true && c.visible) decals.push(c); });
  for (const c of decals) c.visible = false;
  const show = (pick: (o: Object3D) => boolean) => {
    for (const o of scene.children) o.visible = (vis.get(o) ?? false) && (o instanceof Light || pick(o));
  };
  const read = () => {
    const buf = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    return buf;
  };
  try {
    scene.background = null;
    cover.uCovKeep.value = 0;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(KEY, 1);
    renderer.autoClear = false;
    // 1: the fishers alone.
    show((o) => o === fishers);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    const all = read();
    // 2: the scenery, then the fishers against its depth.
    show((o) => o !== fishers && o.userData.coverExempt !== true);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.clear(true, false, false);
    show((o) => o === fishers);
    renderer.render(scene, camera);
    const seen = read();
    const report = coveredIn(all, seen, W, H, cover.uCovBox.value);
    if (typeof detail === "string") {
      // Greedy descent from one named object to the leaves that cover (what in it covers).
      report.by = {};
      let host = scene.getObjectByName(detail);
      const top = host ? scene.children.find((c) => c === host || c.getObjectById(host!.id) !== undefined) : undefined;
      let path = detail;
      for (let depth = 0; host && top && depth < 8; depth++) {
        const kids = [...host.children];
        if (kids.length === 0) break;
        const kv = kids.map((k) => k.visible);
        let best = -1;
        let bestW = 0;
        kids.forEach((one, idx) => {
          if (!kv[idx]) return;
          kids.forEach((k, j) => { k.visible = j === idx; });
          show((o) => o === top);
          renderer.clear(true, true, true);
          renderer.render(scene, camera);
          renderer.clear(true, false, false);
          show((o) => o === fishers);
          renderer.render(scene, camera);
          const r = coveredIn(all, read(), W, H, cover.uCovBox.value);
          const mat = "material" in one && one.material && typeof one.material === "object" && "type" in one.material ? String(one.material.type) : "";
          if (r.worst > 0.002 && report.by) report.by[`${path}/${one.name || one.type}#${idx}:${mat}`] = Math.round(r.worst * 1000) / 1000;
          if (r.worst > bestW) { bestW = r.worst; best = idx; }
        });
        kids.forEach((k, j) => { k.visible = kv[j] ?? true; });
        if (best < 0) break;
        host = kids[best];
        path = `${path}/${host?.name || host?.type}#${best}`;
      }
    } else if (detail) {
      report.by = {};
      scene.children.forEach((one, idx) => {
        if (one === fishers || one instanceof Light || one.userData.coverExempt === true || !vis.get(one)) return;
        show((o) => o === one);
        renderer.clear(true, true, true);
        renderer.render(scene, camera);
        renderer.clear(true, false, false);
        show((o) => o === fishers);
        renderer.render(scene, camera);
        const r = coveredIn(all, read(), W, H, cover.uCovBox.value);
        if (r.worst > 0.002 && report.by) report.by[`${one.name || one.type}#${idx}`] = Math.round(r.worst * 1000) / 1000;
      });
    }
    return report;
  } finally {
    for (const [o, v] of vis) o.visible = v;
    for (const c of nested) c.visible = true;
    for (const c of decals) c.visible = true;
    scene.background = prevBg;
    cover.uCovKeep.value = prevKeep;
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevTarget);
    rt.dispose();
  }
}

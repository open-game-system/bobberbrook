import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { dayPhase } from "../../game/daycycle";
import type { Lake } from "../../game/lake";
import { CameraRig, isView, VIEWS } from "./camera";
import { FisherViews, type CatchFocus } from "./fishers";
import { FishShadows, FishTextures, sharedCardGeometry } from "./fishviz";
import { Fx } from "./fx";
import { MAX_FOCUS, occluderMaterial, patchLambertWrap } from "./geo";
import { makeParticles } from "./particles";
import { buildPost, type Post } from "./post";
import { buildProps } from "./props";
import { buildSky } from "./sky";
import { SwirlViews } from "./swirls";
import { buildGround } from "./terrain";
import { newTodState, sampleTod } from "./tod";
import type { LakeScene, SceneQuality } from "./types";
import { buildWater } from "./water";
import { buildRays } from "./rays";
import { buildForest } from "./forest";
import { buildTrails } from "./trails";
import { buildAreaDressing } from "./areas";
import { paintedMaterial } from "./geo";
import { Mood } from "./mood";
import { buildMist } from "./mist";
import { Splashes } from "./splash";
import { AREAS, areaAt, areaById } from "../../game/world";
import { AREA_INDEX } from "./valley";
import { DoubleSide } from "three";

export type { LakeScene, SceneQuality } from "./types";

export type SceneInfo = {
  renderer: string;
  quality: SceneQuality;
  programs: number;
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
  frameP50: number;
  frameP95: number;
  frames: number;
  phase: number;
  view: string;
};

export type SceneDebug = {
  info(): SceneInfo;
  setView(name: string): string;
  setPhase(phase: number | null): number | null;
  debug(): unknown;
};

declare global {
  interface Window {
    __scene?: SceneDebug;
  }
}

const FRAME_SAMPLES = 600;

/** Wind sway for instanced grass, flowers and reeds (one shared program). */
function swayMaterial(time: { value: number }): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sw = position.y * position.y * 0.22;
  float gust = 0.6 + 0.4 * sin(uTime * 0.7 + ip.x * 0.05);
  transformed.x += sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.21) * sw * gust;
  transformed.z += cos(uTime * 1.3 + ip.x * 0.18 - ip.z * 0.3) * sw * 0.6 * gust;
#endif`,
      );
  };
  m.customProgramCacheKey = () => "bobber-sway";
  return m;
}

export async function createLakeScene(canvas: HTMLCanvasElement, opts: { quality: SceneQuality; assetBase?: string }): Promise<LakeScene> {
  patchLambertWrap();
  const full = opts.quality === "full";
  const renderer = new WebGLRenderer({ canvas, antialias: !full, powerPreference: "high-performance", alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, full ? 1.5 : 1));
  renderer.toneMapping = NeutralToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = full;
  renderer.info.autoReset = false;
  renderer.shadowMap.type = PCFShadowMap;
  const size = () => ({ w: Math.max(1, canvas.clientWidth || window.innerWidth), h: Math.max(1, canvas.clientHeight || window.innerHeight) });
  let { w, h } = size();
  renderer.setSize(w, h, false);

  const scene = new Scene();
  scene.background = new Color(0x88aacc);
  const fog = new Fog(0xcfe4f4, 60, 230);
  scene.fog = fog;
  const rig = new CameraRig(w / h);
  const camera = rig.camera;

  // Lights: a fixed set (changing the count recompiles every material).
  const sun = new DirectionalLight(0xffffff, 3);
  sun.castShadow = full;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -44;
  sun.shadow.camera.right = 44;
  sun.shadow.camera.top = 44;
  sun.shadow.camera.bottom = -44;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 5;
  sun.shadow.intensity = 0.5;
  scene.add(sun, sun.target);
  const hemi = new HemisphereLight(0xffffff, 0x556644, 1);
  scene.add(hemi);

  const time = { value: 0 };
  const sway = swayMaterial(time);
  const sky = buildSky();
  scene.add(sky.dome, sky.mountains);
  const groundMat = new MeshLambertMaterial({ vertexColors: true });
  const ground = buildGround(groundMat, full ? 0.6 : 1.1);
  scene.add(ground.group);
  const water = buildWater();
  scene.add(...water.ponds, water.brook, water.falls);
  const occ = {
    uCam: { value: new Vector3() },
    uFocus: { value: Array.from({ length: MAX_FOCUS }, () => new Vector3(0, -100, 0)) },
    uBox: { value: new Vector4(0, 0, 0, 0) },
    uNear: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
  };
  const treeMat = occluderMaterial(occ);
  const props = buildProps(opts.quality, sway, treeMat);
  scene.add(props.group);
  const painted = paintedMaterial();
  const paintedDouble = paintedMaterial({ side: DoubleSide });
  const forest = buildForest(full, treeMat);
  scene.add(forest.group);
  const trails = buildTrails(full, painted);
  scene.add(trails.group);
  const areas = buildAreaDressing(full, { painted, paintedDouble, sway, tree: treeMat });
  scene.add(areas.group);
  const mood = new Mood();
  const mist = buildMist(full);
  scene.add(mist.mesh);
  const glowBoost = new Float32Array(AREAS.length);
  const pulse = new Float32Array(AREAS.length);
  const veil = new Float32Array(AREAS.length).fill(1);
  let discoverySeq = -1;
  let revealAt = -1;
  let revealArea = AREAS[0]!;
  let trailW = 0;
  let veilInit = false;
  const rays = buildRays();
  if (full) scene.add(rays.mesh);
  const parts = makeParticles();
  scene.add(parts.water.points, parts.glow.points);
  const fx = new Fx(parts.water, parts.glow, water, !full);
  const splashes = new Splashes();
  scene.add(splashes.group);
  fx.splashes = splashes;
  const shadows = new FishShadows();
  scene.add(shadows.mesh);
  const textures = new FishTextures(opts.assetBase ?? "/art/fish/");
  const cardGeo = sharedCardGeometry();
  const rigMats = {
    body: new MeshLambertMaterial({ vertexColors: true }),
    glowRod: new MeshBasicMaterial({ vertexColors: true, color: new Color(1.6, 1.8, 2.4) }),
  };
  const fishers = new FisherViews(rigMats, cardGeo, textures, fx, shadows);
  scene.add(fishers.group);
  const swirls = new SwirlViews(water, shadows, fx);
  scene.add(swirls.group);
  const world = new Group();
  scene.add(world);

  let post: Post | null = full ? buildPost(renderer, scene, camera, w, h) : null;
  const pr = renderer.getPixelRatio();
  post?.setSize(w, h);
  parts.water.setScale(h * pr, camera.fov);
  parts.glow.setScale(h * pr, camera.fov);

  // State.
  const tod = newTodState();
  let lake: Lake | null = null;
  let offset = 0;
  let haveOffset = false;
  let phaseOverride: number | null = null;
  const frameMs = new Float32Array(FRAME_SAMPLES);
  let frameN = 0;
  let last = performance.now();
  const t0 = last;
  let raf = 0;
  let disposed = false;
  const tmpO = new Vector3();
  const catchBuf: CatchFocus = { x: 0, y: 0, z: 0, age: 0 };

  const applyTod = (phase: number) => {
    sampleTod(phase, tod);
    mood.apply(tod);
    sun.color.copy(tod.sun);
    sun.intensity = tod.sunI;
    // The shadow frustum follows the action (snapped to its texels so shadows do not crawl).
    const texel = 88 / 2048;
    const fx0 = Math.round(rig.focus.x / texel) * texel;
    const fz0 = Math.round(rig.focus.z / texel) * texel;
    sun.target.position.set(fx0, 0, fz0);
    sun.position.copy(tod.lightDir).multiplyScalar(90).add(sun.target.position);
    hemi.color.copy(tod.hemiSky);
    hemi.groundColor.copy(tod.hemiGround);
    hemi.intensity = tod.hemiI;
    fog.color.copy(tod.fog);
    fog.near = tod.fogNear;
    fog.far = tod.fogFar;
    renderer.toneMappingExposure = tod.exposure;
    scene.background = tod.skyHorizon;
    if (post) (post.grade.uniforms.uGain!.value as Color).copy(tod.grade);
  };

  const serverNow = (now: number) => now + offset;

  const frame = (now: number, dt: number) => {
    const t = (now - t0) / 1000;
    time.value = t;
    const sn = serverNow(now);
    const phase = phaseOverride ?? (lake ? dayPhase(lake.startedAt, sn) : 0.15);
    mood.follow(rig.focus.x, rig.focus.z, dt);
    applyTod(phase);
    // Places nobody has found yet stay veiled; a new find lifts its veil and plays the reveal.
    AREAS.forEach((a, i) => {
      const found = !lake || lake.discovered.includes(a.id);
      veil[i] = veilInit ? Math.max(0, Math.min(1, veil[i]! + (found ? -dt / 2.2 : dt / 2.2))) : found ? 0 : 1;
      water.setVeil(i, veil[i]!);
      glowBoost[i] = mood.glowOf(a.id);
    });
    if (lake) veilInit = true;
    if (lake?.discovery && lake.discovery.seq !== discoverySeq) {
      const fresh = discoverySeq !== -1 || sn - lake.discovery.at < 4000;
      discoverySeq = lake.discovery.seq;
      if (fresh) {
        revealAt = t;
        revealArea = areaById(lake.discovery.area);
        fx.discoverySwirl(revealArea.center.x, revealArea.center.z, revealArea.pond.r + 6);
      }
    } else if (lake && !lake.discovery && discoverySeq === -1) discoverySeq = 0;
    const revealAge = revealAt >= 0 ? t - revealAt : -1;
    if (revealAge > 0.9 && revealAge - dt <= 0.9) fx.discoverySwirl(revealArea.center.x, revealArea.center.z, revealArea.pond.r + 3);
    forest.update(camera);
    trails.update(tod, t);
    // The found place's landmark glows through the reveal.
    AREAS.forEach((a, i) => {
      const on = revealAge >= 0 && a.id === revealArea.id ? Math.max(0, Math.min(1, revealAge / 0.6, (5 - revealAge) / 1.5)) : 0;
      pulse[i] = on;
    });
    areas.update(tod, camera, glowBoost, pulse, t);
    sky.mountains.position.set(camera.position.x, 0, camera.position.z);
    sky.update(tod, camera, t);
    water.update(tod, t);
    rays.update(tod, t);
    props.update(tod, t, lake?.campfire ? 1 : 0);
    shadows.begin();
    swirls.frame(lake, sn, t, dt, tod.glow);
    fishers.frame(lake, sn, t, dt, camera, props.campSeats);
    shadows.end();
    fx.ambient(dt, tod, lake?.campfire ? 1 : 0, rig.focus.x, rig.focus.z);
    parts.water.update(dt, t);
    splashes.frame(t);
    parts.glow.update(dt, t);
    rig.beginFocus();
    fishers.forEachFocus((x, y, z) => rig.addFocus(x, y, z));
    const cf = fishers.catchFocus(t, catchBuf);
    // Out on a trail (between places), the camera looks further ahead.
    let n = 0;
    let gx = 0;
    let gz = 0;
    fishers.forEachFisher((x, _y, z) => { gx += x; gz += z; n++; });
    const onTrail = n > 0 && areaAt({ x: gx / n, z: gz / n }) === null ? 1 : 0;
    trailW += (onTrail - trailW) * Math.min(1, dt * 1.5);
    const reveal = revealAge >= 0 && revealAge < 3.5 ? { x: revealArea.center.x, z: revealArea.center.z, age: revealAge } : null;
    rig.update(t, dt, lake?.campfire ?? false, cf, trailW, reveal);
    // Trees between the camera and the action dissolve.
    occ.uCam.value.copy(camera.position);
    let fi = 0;
    const foc = occ.uFocus.value;
    foc[fi++]!.copy(rig.focus);
    if (cf) foc[fi++]!.set(cf.x, cf.y + 2.5, cf.z);
    fishers.forEachFisher((x, y, z) => {
      if (fi < MAX_FOCUS) foc[fi++]!.set(x, y + 1, z);
    });
    while (fi < MAX_FOCUS) foc[fi++]!.set(0, -100, 0);
    // The action's screen box and how far away its nearest fisher is (see occluderMaterial).
    camera.updateMatrixWorld();
    let bx0 = 1, by0 = 1, bx1 = 0, by1 = 0, near = Infinity;
    const boxPt = (x: number, y: number, z: number) => {
      tmpO.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      near = Math.min(near, -tmpO.z);
      tmpO.applyMatrix4(camera.projectionMatrix);
      const sx = tmpO.x * 0.5 + 0.5;
      const sy = tmpO.y * 0.5 + 0.5;
      bx0 = Math.min(bx0, sx); bx1 = Math.max(bx1, sx); by0 = Math.min(by0, sy); by1 = Math.max(by1, sy);
    };
    fishers.forEachFisher((x, y, z) => {
      boxPt(x, y, z);
      boxPt(x, y + 3.2, z);
    });
    if (near < Infinity) {
      occ.uBox.value.set(bx0, by0, bx1, by1);
      occ.uNear.value = near - 1.5;
    } else occ.uNear.value = 0;
    renderer.getDrawingBufferSize(occ.uRes.value);
    mist.update(tod, t, veil, occ.uNear.value);
    renderer.info.reset();
    if (post) post.render();
    else renderer.render(scene, camera);
  };

  const loop = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dtMs = Math.min(100, Math.max(0, now - last));
    last = now;
    frameMs[frameN % FRAME_SAMPLES] = dtMs;
    frameN++;
    frame(now, dtMs / 1000);
  };

  // ---- shader prewarm: everything visible, compiled against the target we really draw into ----
  fishers.showAllForPrewarm();
  swirls.showAllForPrewarm();
  splashes.showAllForPrewarm();
  rig.update(0, 0, false, null);
  camera.updateMatrixWorld();
  applyTod(0.15);
  const prevTarget = renderer.getRenderTarget();
  if (post) renderer.setRenderTarget(post.target);
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(prevTarget);
  if (post) post.render();
  else renderer.render(scene, camera);
  if (post) post.render();
  fishers.hideAll();
  frame(performance.now(), 0);

  const percentile = (p: number) => {
    const n = Math.min(frameN, FRAME_SAMPLES);
    if (n === 0) return 0;
    const arr = Array.from(frameMs.subarray(0, n)).sort((a, b) => a - b);
    return arr[Math.min(n - 1, Math.floor(p * n))] ?? 0;
  };
  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));

  window.__scene = {
    info: () => ({
      renderer: rendererName,
      quality: opts.quality,
      programs: renderer.info.programs?.length ?? 0,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      frameP50: percentile(0.5),
      frameP95: percentile(0.95),
      frames: frameN,
      phase: tod.phase,
      view: rig.view,
    }),
    setView(name) {
      if (!isView(name)) throw new Error(`unknown view "${name}"; views: ${VIEWS.join(", ")}`);
      rig.setView(name);
      return name;
    },
    debug: () => ({ fishers: fishers.debug(), camera: camera.position.toArray(), rig: rig.debug(), trees: forest.count, veil: Array.from(veil), mood: mood.debug() }),
    setPhase(p) {
      if (p !== null && (!Number.isFinite(p) || p < 0 || p > 1)) throw new Error(`phase must be 0..1 or null, got ${String(p)}`);
      phaseOverride = p;
      return p;
    },
  };

  raf = requestAnimationFrame(loop);
  const tmpV = new Vector3();

  return {
    update(next, receivedAt) {
      const target = next.now - receivedAt;
      if (!haveOffset || Math.abs(target - offset) > 1500) {
        offset = target;
        haveOffset = true;
      } else if (target > offset) offset += (target - offset) * 0.3;
      else offset += (target - offset) * 0.05;
      lake = next;
    },
    focalRect() {
      const cw = canvas.clientWidth || w;
      const ch = canvas.clientHeight || h;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const addPt = (x: number, y: number, z: number) => {
        tmpV.set(x, y, z).project(camera);
        const sx = (tmpV.x * 0.5 + 0.5) * cw;
        const sy = (-tmpV.y * 0.5 + 0.5) * ch;
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      };
      fishers.forEachFocus((x, y, z) => {
        addPt(x, y, z);
        addPt(x, y + 3.2, z);
      });
      if (!Number.isFinite(x0)) return { x: cw * 0.22, y: ch * 0.18, w: cw * 0.56, h: ch * 0.64 };
      const pad = Math.min(cw, ch) * 0.06;
      const rx = Math.max(0, x0 - pad);
      const ry = Math.max(0, y0 - pad);
      return { x: rx, y: ry, w: Math.min(cw, x1 + pad) - rx, h: Math.min(ch, y1 + pad) - ry };
    },
    resize() {
      ({ w, h } = size());
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      post?.setSize(w, h);
      parts.water.setScale(h * renderer.getPixelRatio(), camera.fov);
      parts.glow.setScale(h * renderer.getPixelRatio(), camera.fov);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      sky.dispose();
      ground.dispose();
      forest.dispose();
      trails.dispose();
      areas.dispose();
      mist.dispose();
      splashes.dispose();
      painted.dispose();
      paintedDouble.dispose();
      groundMat.dispose();
      water.dispose();
      rays.dispose();
      props.dispose();
      sway.dispose();
      treeMat.dispose();
      parts.water.dispose();
      parts.glow.dispose();
      shadows.dispose();
      textures.dispose();
      cardGeo.rays.dispose();
      cardGeo.plane.dispose();
      fishers.dispose();
      swirls.dispose();
      rigMats.body.dispose();
      rigMats.glowRod.dispose();
      post?.dispose();
      post = null;
      renderer.dispose();
      if (window.__scene) delete window.__scene;
    },
  };
}

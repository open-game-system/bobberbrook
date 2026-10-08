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
  Vector3,
  WebGLRenderer,
} from "three";
import { dayPhase } from "../../game/daycycle";
import type { Lake } from "../../game/lake";
import { CameraRig, isView, VIEWS } from "./camera";
import { FisherViews, type CatchFocus } from "./fishers";
import { FishShadows, FishTextures, sharedCardGeometry } from "./fishviz";
import { Fx } from "./fx";
import { patchLambertWrap } from "./geo";
import { makeParticles } from "./particles";
import { buildPost, type Post } from "./post";
import { buildProps } from "./props";
import { buildSky } from "./sky";
import { SwirlViews } from "./swirls";
import { buildGround } from "./terrain";
import { newTodState, sampleTod } from "./tod";
import type { LakeScene, SceneQuality } from "./types";
import { buildWater } from "./water";

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
  sun.shadow.radius = 3;
  sun.shadow.intensity = 0.72;
  scene.add(sun, sun.target);
  const hemi = new HemisphereLight(0xffffff, 0x556644, 1);
  scene.add(hemi);

  const time = { value: 0 };
  const sway = swayMaterial(time);
  const sky = buildSky();
  scene.add(sky.dome, sky.mountains);
  const groundMat = new MeshLambertMaterial({ vertexColors: true });
  const ground = buildGround(groundMat, full ? 320 : 200);
  scene.add(ground.mesh);
  const water = buildWater();
  scene.add(water.lake, water.brook, water.falls);
  const props = buildProps(opts.quality, sway);
  scene.add(props.group);
  const parts = makeParticles();
  scene.add(parts.water.points, parts.glow.points);
  const fx = new Fx(parts.water, parts.glow, water, !full);
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
  const catchBuf: CatchFocus = { x: 0, y: 0, z: 0, age: 0 };

  const applyTod = (phase: number) => {
    sampleTod(phase, tod);
    sun.color.copy(tod.sun);
    sun.intensity = tod.sunI;
    sun.position.copy(tod.lightDir).multiplyScalar(90);
    sun.target.position.set(0, 0, 0);
    hemi.color.copy(tod.hemiSky);
    hemi.groundColor.copy(tod.hemiGround);
    hemi.intensity = tod.hemiI;
    fog.color.copy(tod.fog);
    fog.near = tod.fogNear;
    fog.far = tod.fogFar;
    renderer.toneMappingExposure = tod.exposure;
    scene.background = tod.skyHorizon;
  };

  const serverNow = (now: number) => now + offset;

  const frame = (now: number, dt: number) => {
    const t = (now - t0) / 1000;
    time.value = t;
    const sn = serverNow(now);
    const phase = phaseOverride ?? (lake ? dayPhase(lake.startedAt, sn) : 0.15);
    applyTod(phase);
    sky.update(tod, camera, t);
    water.update(tod, t);
    props.update(tod, t, lake?.campfire ? 1 : 0);
    shadows.begin();
    swirls.frame(lake, sn, t, dt);
    fishers.frame(lake, sn, t, dt, camera, props.campSeats);
    shadows.end();
    fx.ambient(dt, tod, lake?.campfire ? 1 : 0);
    parts.water.update(dt, t);
    parts.glow.update(dt, t);
    rig.beginFocus();
    fishers.forEachFocus((x, y, z) => rig.addFocus(x, y, z));
    rig.update(t, dt, lake?.campfire ?? false, fishers.catchFocus(t, catchBuf));
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
      groundMat.dispose();
      water.dispose();
      props.dispose();
      sway.dispose();
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

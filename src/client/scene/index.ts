import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MeshBasicMaterial,
  Mesh,
  MeshLambertMaterial,
  NeutralToneMapping,
  Matrix4,
  PCFShadowMap,
  Raycaster,
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
import { MAX_FOCUS, occluderDepthMaterial, occluderMaterial, patchLambertWrap } from "./geo";
import { makeParticles } from "./particles";
import { buildPost, type Post } from "./post";
import { buildProps } from "./props";
import { buildSky } from "./sky";
import { SwirlViews } from "./swirls";
import { buildGroundStream } from "./terrain";
import { placeHash } from "./valley";
import { buildEscape } from "./escape";
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
import { SplitFocus, type Member } from "./split";
import { EdgeMarkers, type Marker } from "./markers";
import { BufferAttribute, DoubleSide, PlaneGeometry, PointLight } from "three";
import type { Place } from "../../game/regions";
import { createJobs } from "./stream";
import { buildFogOfWar } from "./fow";
import { buildVehicles } from "./vehicles";
import { buildShells } from "./shells";
import { activeWorld, placesWithin, setWorld, trailsWithin } from "./worldQuery";

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
  /** What is drawn at a screen point (0..1 from the top left): object names along the ray. */
  pick?(x: number, y: number): string[];
  /** Hides (or shows again) every object with this name; returns how many. */
  toggle?(name: string): number;
  /** Names of the scene's top-level objects (for toggle). */
  names?(): string[];
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
  const jobs = createJobs();
  const groundMat = new MeshLambertMaterial({ vertexColors: true });
  const water = buildWater();
  const ground = buildGroundStream(groundMat, water.sea, jobs, full);
  scene.add(ground.group);
  scene.add(...water.ponds, water.brook, water.falls);
  const occ = {
    uCam: { value: new Vector3() },
    uFocus: { value: Array.from({ length: MAX_FOCUS }, () => new Vector3(0, -100, 0)) },
    uBox: { value: new Vector4(0, 0, 0, 0) },
    uNear: { value: 0 },
    uVP: { value: new Matrix4() },
  };
  const treeMat = occluderMaterial(occ);
  const props = buildProps(opts.quality, sway, treeMat);
  scene.add(props.group);
  const painted = paintedMaterial();
  const paintedDouble = paintedMaterial({ side: DoubleSide });
  const forest = buildForest(full, treeMat, jobs);
  scene.add(forest.group);
  const trails = buildTrails(full, painted, jobs);
  scene.add(trails.group);
  const areas = buildAreaDressing(full, { painted, paintedDouble, sway, tree: treeMat }, jobs);
  scene.add(areas.group);
  const mood = new Mood();
  const mist = buildMist(full);
  scene.add(mist.mesh);
  const fow = buildFogOfWar(jobs);
  scene.add(fow.mesh);
  const treeMatDouble = occluderMaterial(occ);
  treeMatDouble.side = DoubleSide;
  const shells = buildShells();
  scene.add(shells.mesh);
  const vehicles = buildVehicles(full, painted, paintedDouble, treeMat, treeMatDouble);
  scene.add(vehicles.group);
  const rideFocus = [new Vector3(), new Vector3(), new Vector3()];
  /** Each nearby place's veil (1 = not found yet), eased. */
  const veil = new Map<string, number>();
  const veilOf = (id: string) => veil.get(id) ?? 1;
  let nearPlaces: Place[] = [];
  let nearX = 1e9;
  let nearZ = 1e9;
  let discoverySeq = -1;
  let revealAt = -1;
  let revealArea: Place = activeWorld().placeAt({ i: 0, j: 0 })!;
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
  const escape = buildEscape(painted);
  scene.add(escape.group);
  fx.escape = escape;
  const shadows = new FishShadows();
  scene.add(shadows.mesh);
  const textures = new FishTextures(opts.assetBase ?? "/art/fish/");
  const cardGeo = sharedCardGeometry();
  const rigMats = {
    body: new MeshLambertMaterial({ vertexColors: true }),
    glowRod: new MeshBasicMaterial({ vertexColors: true, color: new Color(1.6, 1.8, 2.4) }),
  };
  const fishers = new FisherViews(rigMats, cardGeo, textures, fx, shadows);
  fishers.rideOf = (seat, out) => vehicles.rideSeat(seat, out);
  scene.add(fishers.group);
  const swirls = new SwirlViews(water, shadows, fx);
  scene.add(swirls.group);
  const world = new Group();
  scene.add(world);
  const splitFocus = new SplitFocus();
  const members: Member[] = [];
  const markerList: Marker[] = [];
  let framed: ReadonlySet<number> = new Set();
  const markers = new EdgeMarkers();
  scene.add(...markers.meshes);
  // Every dissolving tree casts its shadow through the same fade (no shadow without its tree).
  const treeDepth = occluderDepthMaterial(occ);
  scene.traverse((o) => {
    if ((o as Mesh).isMesh && (o as Mesh).material === treeMat) o.customDepthMaterial = treeDepth;
  });

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
  /** Streaming work per frame (ms): keeps a frame from hitching while new ground is built. */
  const streamBudget = 3;
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

  /** Streams the world round the focus: plans chunks, then builds within the frame's budget. */
  const stream = (fx: number, fz: number, budgetMs: number) => {
    // A cut across the world (or a new world): build the new surroundings at once.
    if (Math.hypot(fx - nearX, fz - nearZ) > 120) budgetMs = Infinity;
    if (Math.hypot(fx - nearX, fz - nearZ) > 4) {
      nearX = fx;
      nearZ = fz;
      nearPlaces = placesWithin(fx, fz, 2).sort((a, b) => Math.hypot(a.center.x - fx, a.center.z - fz) - Math.hypot(b.center.x - fx, b.center.z - fz));
      water.assign(nearPlaces);
      mist.assign(nearPlaces.slice(0, 9), trailsWithin(fx, fz, 2));
    }
    ground.update(fx, fz);
    if (budgetMs === Infinity) {
      forest.update(camera, fx, fz);
      trails.update(tod, 0, fx, fz);
      areas.update(tod, camera, 0, fx, fz, () => 0, () => 0);
    }
    jobs.run(budgetMs);
  };

  const frame = (now: number, dt: number) => {
    const t = (now - t0) / 1000;
    if (lake && setWorld(lake.worldSeed)) {
      // A different family's world: start the streams again.
      jobs.clear();
      ground.reset();
      forest.reset();
      trails.reset();
      areas.reset();
      mood.reset();
      veil.clear();
      fow.reset();
      vehicles.reset();
      nearX = 1e9;
    }
    time.value = t;
    const sn = serverNow(now);
    const phase = phaseOverride ?? (lake ? dayPhase(lake.startedAt, sn) : 0.15);
    mood.follow(rig.focus.x, rig.focus.z, dt);
    applyTod(phase);
    // Places nobody has found yet stay veiled; a new find lifts its veil and plays the reveal.
    for (const a of nearPlaces) {
      const found = !lake || lake.discovered.includes(a.id);
      const was = veil.get(a.id);
      const v = veilInit && was !== undefined ? Math.max(0, Math.min(1, was + (found ? -dt / 2.2 : dt / 2.2))) : found ? 0 : 1;
      veil.set(a.id, v);
      water.setVeil(a.id, v);
    }
    if (lake) veilInit = true;
    if (lake?.discovery && lake.discovery.seq !== discoverySeq) {
      const fresh = discoverySeq !== -1 || sn - lake.discovery.at < 4000;
      discoverySeq = lake.discovery.seq;
      if (fresh) {
        revealAt = t;
        revealArea = activeWorld().placeById(lake.discovery.area) ?? revealArea;
        fx.discoverySwirl(revealArea.center.x, revealArea.center.z, revealArea.pond.r + 6);
      }
    } else if (lake && !lake.discovery && discoverySeq === -1) discoverySeq = 0;
    const revealAge = revealAt >= 0 ? t - revealAt : -1;
    if (revealAge > 0.9 && revealAge - dt <= 0.9) fx.discoverySwirl(revealArea.center.x, revealArea.center.z, revealArea.pond.r + 3);
    forest.update(camera, rig.focus.x, rig.focus.z);
    trails.update(tod, t, rig.focus.x, rig.focus.z);
    // The found place's landmark glows through the reveal.
    const pulseOf = (id: string) => (revealAge >= 0 && id === revealArea.id ? Math.max(0, Math.min(1, revealAge / 0.6, (5 - revealAge) / 1.5)) : 0);
    areas.update(tod, camera, t, rig.focus.x, rig.focus.z, (p) => mood.glowOf(p), pulseOf);
    // Far from home, Moonwell's set hides; its two lights stay in the scene (dark), so the light count
    // (and with it every shader) never changes.
    const homeNear = Math.hypot(rig.focus.x, rig.focus.z) < 320;
    for (const o of props.group.children) if (!(o instanceof PointLight)) o.visible = homeNear;
    sky.mountains.position.set(camera.position.x, 0, camera.position.z);
    sky.update(tod, camera, t);
    water.update(tod, t);
    rays.update(tod, t);
    props.update(tod, t, lake?.campfire ? 1 : 0);
    vehicles.update(lake, sn, t, dt, tod, rig.focus.x, rig.focus.z);
    shells.update(lake, sn, t, tod, fx, (seat) => {
      let at: { x: number; y: number; z: number } | null = null;
      fishers.forEachSeat((s2, x, y, z) => {
        if (s2 === seat) at = { x, y, z };
      });
      return at;
    });
    shadows.begin();
    swirls.frame(lake, sn, t, dt, tod.glow);
    fishers.frame(lake, sn, t, dt, camera, props.campSeats);
    shadows.end();
    fx.ambient(dt, tod, lake?.campfire ? 1 : 0, rig.focus.x, rig.focus.z);
    parts.water.update(dt, t);
    splashes.frame(t);
    escape.frame(t, (x, z, ts, away) => fx.slap(x, z, ts, away));
    parts.glow.update(dt, t);
    // Spread out: frame the active place (a line in the water, else the latest mover), mark the rest.
    members.length = 0;
    fishers.forEachSeat((seat, x, _y, z) => {
      const f = lake?.fishers.find((ff) => ff.seat === seat);
      const m = f?.mode;
      const activity = m === "bite" || m === "reel" || m === "catch" ? "hot" : m === "cast" || m === "wait" ? "line" : "idle";
      members.push({ seat, x, z, activity, inputAt: (f?.lastInputAt ?? 0) / 1000, place: activeWorld().areaAt({ x, z })?.id ?? null });
    });
    const sp = splitFocus.update(members, sn / 1000);
    framed = sp.framed;
    const riding = vehicles.riding();
    rig.rateK += ((riding ? 3.2 : 1) - rig.rateK) * Math.min(1, dt * 2);
    rig.ride = riding ? { heading: vehicles.heading(), kind: riding } : null;
    rig.minDist += ((riding === 2 ? 24 : riding === 1 ? 22 : sp.split ? 23 : 17) - rig.minDist) * Math.min(1, dt * (riding ? 0.8 : 2));
    rig.beginFocus();
    fishers.forEachSeat((seat, x, y, z, _c, bob) => {
      if (!framed.has(seat)) return;
      rig.addFocus(x, y, z);
      if (bob) rig.addFocus(bob.x, Math.max(0, bob.y), bob.z);
    });
    const nf = vehicles.rideFocus(rideFocus);
    for (let i = 0; i < nf; i++) rig.addFocus(rideFocus[i]!.x, rideFocus[i]!.y, rideFocus[i]!.z);
    const bf = riding ? null : vehicles.boardFocus(rideFocus);
    if (bf) for (let i = 0; i < bf.n; i++) rig.addFocus(rideFocus[i]!.x, rideFocus[i]!.y, rideFocus[i]!.z);
    rig.board = bf ? { ux: bf.ux, uz: bf.uz, kind: bf.kind } : null;
    const cf = fishers.catchFocus(t, catchBuf);
    // Out on a trail (between places), the camera looks further ahead.
    let n = 0;
    let gx = 0;
    let gz = 0;
    fishers.forEachSeat((seat, x, _y, z) => { if (framed.has(seat)) { gx += x; gz += z; n++; } });
    const here = n > 0 ? activeWorld().areaAt({ x: gx / n, z: gz / n }) : null;
    const onTrail = n > 0 && here === null && !riding ? 1 : 0;
    if (here) {
      rig.anchor.set(here.center.x, 0, here.center.z);
      rig.placeYaw = here.home ? 0 : (placeHash(here.key, 11) - 0.5) * 0.9;
    }
    trailW += (onTrail - trailW) * Math.min(1, dt * 1.5);
    const reveal = revealAge >= 0 && revealAge < 3.5 ? { x: revealArea.center.x, z: revealArea.center.z, age: revealAge } : null;
    rig.update(t, dt, lake?.campfire ?? false, cf, trailW, reveal);
    // Trees between the camera and the action dissolve.
    occ.uCam.value.copy(camera.position);
    let fi = 0;
    const foc = occ.uFocus.value;
    foc[fi++]!.copy(rig.focus);
    if (cf) foc[fi++]!.set(cf.x, cf.y + 2.5, cf.z);
    fishers.forEachSeat((seat, x, y, z) => {
      if (fi < MAX_FOCUS && framed.has(seat)) foc[fi++]!.set(x, y + 1, z);
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
    fishers.forEachSeat((seat, x, y, z) => {
      if (!framed.has(seat)) return;
      boxPt(x, y, z);
      boxPt(x, y + 3.2, z);
    });
    markerList.length = 0;
    fishers.forEachSeat((seat, x, y, z, color) => {
      markerList.push({ seat, x, y, z, color, show: sp.split && !framed.has(seat) });
    });
    markers.update(camera, markerList, t, dt);
    if (near < Infinity) {
      occ.uBox.value.set(bx0, by0, bx1, by1);
      occ.uNear.value = near - 1.5;
    } else occ.uNear.value = 0;
    occ.uVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    mist.update(tod, t, veilOf, occ.uNear.value);
    fow.update(tod, t, dt, rig.focus.x, rig.focus.z, lake ? lake.revealed : null, lake ? lake.discovered : [], camera.position.x, camera.position.z);
    stream(rig.focus.x, rig.focus.z, streamBudget);
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
  vehicles.prewarm(true);
  escape.prewarm(true);
  // A showroom: one place of every style (home builders, the four new kits, every landmark kind), a
  // patch of sea and the fog blanket, all in front of the camera, so every variant compiles now.
  const showroom: Place[] = [];
  {
    const w = activeWorld();
    for (const id of ["mistmarsh", "pools", "hollow", "tarn"]) {
      const p = w.placeById(id);
      if (p) showroom.push(p);
    }
    const want = new Set<string>(["marsh", "pools", "hollow", "tarn", "willow", "crystal", "ember", "frost"]);
    for (let r = 1; r < 9 && want.size > 0; r++)
      for (const p of w.placesNear({ x: 0, z: 0 }, r)) if (!p.home && want.has(p.biome)) {
        want.delete(p.biome);
        showroom.push(p);
      }
  }
  areas.showroom(true, showroom, { x: rig.focus.x, z: rig.focus.z - 6 });
  const seaShow = new Mesh(new PlaneGeometry(6, 6).rotateX(-Math.PI / 2).setAttribute("aSea", new BufferAttribute(new Float32Array(8).fill(1), 2)), water.sea);
  seaShow.position.set(rig.focus.x, 0.5, rig.focus.z);
  scene.add(seaShow);
  fow.mesh.visible = true;
  swirls.showAllForPrewarm();
  splashes.showAllForPrewarm();
  rig.update(0, 0, false, null);
  camera.updateMatrixWorld();
  applyTod(0.15);
  // Build the world round the start before the first frame (a loading pause, not a hitch).
  stream(rig.focus.x, rig.focus.z, Infinity);
  forest.update(camera, rig.focus.x, rig.focus.z);
  trails.update(tod, 0, rig.focus.x, rig.focus.z);
  areas.update(tod, camera, 0, rig.focus.x, rig.focus.z, () => 0, () => 0);
  stream(rig.focus.x, rig.focus.z, Infinity);
  const prevTarget = renderer.getRenderTarget();
  if (post) renderer.setRenderTarget(post.target);
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(prevTarget);
  if (post) post.render();
  else renderer.render(scene, camera);
  if (post) post.render();
  fishers.hideAll();
  vehicles.prewarm(false);
  escape.prewarm(false);
  areas.showroom(false, [], { x: 0, z: 0 });
  scene.remove(seaShow);
  seaShow.geometry.dispose();
  fow.mesh.visible = false;
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
    debug: () => ({ split: { framed: [...framed], markers: markers.debug() }, fishers: fishers.debug(), camera: camera.position.toArray(), rig: rig.debug(), trees: forest.count, chunks: ground.count(), jobs: jobs.pending(), world: activeWorld().seed, progs: (renderer.info.programs ?? []).map((pr) => `${pr.name}#${pr.cacheKey}`), ride: (() => { const o = { x: 0, y: 0, z: 0, facing: 0 }; const ok = vehicles.rideSeat(0, o); const n = vehicles.rideFocus(rideFocus); return { kind: vehicles.riding(), ok, seat0: [o.x, o.y, o.z].map(Math.round), focus: rideFocus.slice(0, n).map((v) => v.toArray().map(Math.round)) }; })(), fow: { on: fow.mesh.visible, ...fow.stats(), map: Array.from({ length: 11 }, (_, j) => Array.from({ length: 11 }, (_, i) => fow.veilAt(rig.focus.x + (i - 5) * 24, rig.focus.z + (j - 5) * 24)).join('')).join('/'), ahead: [fow.veilAt(rig.focus.x, rig.focus.z), fow.veilAt(rig.focus.x + 100, rig.focus.z), fow.veilAt(rig.focus.x - 100, rig.focus.z - 100)] }, near: nearPlaces.map((p) => `${p.id}:${p.biome}`), veil: Object.fromEntries(veil), mood: mood.debug() }),
    pick(x, y) {
      const rc = new Raycaster();
      rc.setFromCamera(new Vector2(x * 2 - 1, 1 - y * 2), camera);
      return rc.intersectObjects(scene.children, true).slice(0, 8).map((h) => `${h.object.name || h.object.type}${h.object.parent?.name ? "<" + h.object.parent.name : ""} d=${h.distance.toFixed(1)} i=${h.instanceId ?? "-"}`);
    },
    names: () => scene.children.map((o, i) => o.name || `${o.type}#${i}`),
    toggle(name) {
      let n = 0;
      if (name.includes("+")) return name.split("+").reduce((acc, nm) => acc + (window.__scene?.toggle?.(nm) ?? 0), 0);
      if (name === "shadows") { sun.castShadow = !sun.castShadow; return 1; }
      scene.children.forEach((o, i) => { if (!o.name && `${o.type}#${i}` === name) { o.visible = !o.visible; n++; } });
      scene.traverse((o) => { if (o.name === name) { o.visible = !o.visible; n++; } });
      return n;
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
      fishers.forEachSeat((seat, x, y, z, _c, bob) => {
        if (!framed.has(seat)) return;
        addPt(x, y, z);
        addPt(x, y + 3.2, z);
        if (bob) addPt(bob.x, Math.max(0, bob.y), bob.z);
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
      jobs.clear();
      ground.dispose();
      forest.dispose();
      trails.dispose();
      areas.dispose();
      mist.dispose();
      vehicles.dispose();
      shells.dispose();
      fow.dispose();
      markers.dispose();
      splashes.dispose();
      escape.dispose();
      painted.dispose();
      paintedDouble.dispose();
      groundMat.dispose();
      water.dispose();
      rays.dispose();
      props.dispose();
      sway.dispose();
      treeMat.dispose();
      treeMatDouble.dispose();
      treeDepth.dispose();
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

import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  MeshBasicMaterial,
  Mesh,
  MeshLambertMaterial,
  NeutralToneMapping,
  type Object3D,
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
import { showOpening } from "./opening";
import { CameraRig, REVEAL_S, isView, VIEWS, type RigFrame } from "./camera";
import { FisherViews, type CatchFocus } from "./fishers";
import { FishShadows, FishTextures, sharedCardGeometry } from "./fishviz";
import { Fx } from "./fx";
import { coverScene, makeCoverUniforms, setCoverFishers } from "./cover";
import { coverCheck, stackCheck, type CoverReport, type StackReport } from "./coverCheck";
import { keepPrograms } from "./keepPrograms";
import { MAX_FOCUS, occluderDepthMaterial, occluderMaterial, patchLambertWrap, registerFade } from "./geo";
import { makeParticles } from "./particles";
import { TAG_LAYER, buildPost, type Post } from "./post";
import { buildProps } from "./props";
import { buildSky } from "./sky";
import { SwirlViews } from "./swirls";
import { buildGroundStream } from "./terrain";
import { imageOf, loadPaintKit, type PaintTex } from "./paintkit";
import { setCrystalTexture } from "./crystal";
import { asCard, cleanCardOf, cloudSheetOf, needleSheetOf, setCards } from "./cards";
import { groundMaterial } from "./groundmat";
import { leafMaterial, setFoliageMaterials } from "./foliage";
import { CHAR_LIGHT, needleSheet, setPaintImages } from "./painter";
import { setCapImages } from "./giantCap";
import { barkMaterial, rockMaterial, setSurfaceMaterials, tilesMaterial } from "./surfaces";
import { placeHash } from "./valley";
import { behindYaw, placeSideYaw, placeYaw, wrapAngle } from "./placeView";
import { buildEscape } from "./escape";
import { newTodState, rideTwilight, sampleTod } from "./tod";
import type { LakeScene, SceneQuality } from "./types";
import { buildWater } from "./water";
import { buildRays } from "./rays";
import { buildForest } from "./forest";
import { buildTrails } from "./trails";
import { buildAreaDressing } from "./areas";
import { plantMaterial, plantSheet } from "./plants";
import { dissolveK } from "./dissolve";
import { paintedMaterial } from "./geo";
import { Mood } from "./mood";
import { buildMist } from "./mist";
import { Splashes } from "./splash";
import { FamilyFrame, SplitFocus, type Member } from "./split";
import { EdgeMarkers, type Marker } from "./markers";
import { BufferAttribute, DoubleSide, PlaneGeometry, PointLight } from "three";
import type { Place } from "../../game/regions";
import { revealReady } from "./revealGate";
import { createJobs } from "./stream";
import { buildFogOfWar } from "./fow";
import { DECK_R, buildVehicles } from "./vehicles";
import { buildShells } from "./shells";
import { activeWorld, placesWithin, platformsAround, setWorld, trailsWithin } from "./worldQuery";

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
  /** Perf probe: hides (on) or restores (off) the visible objects whose name starts with this prefix; returns how many. */
  hide?(prefix: string, on: boolean): number;
  /** Perf probe: visible meshes grouped by name, [name, meshes, triangles drawn incl. instances], heaviest first. */
  breakdown?(): [string, number, number][];
  /** Names of the scene's top-level objects (for toggle). */
  names?(): string[];
  /** Round 23 judder probe: starts (on) or stops and returns (off) the camera rig's per-frame input/pose log. */
  camLog?(on: boolean): RigFrame[];
  /** Where the TV camera is (world metres). */
  cameraAt?(): { x: number; y: number; z: number };
  /** Turns the painterly post (contact shadow, knee, Kuwahara) off or on, for an in-page perf A/B. */
  painterly?(on: boolean): boolean;
  /** Round 21 lab check: per framed fisher, the share of their body pixels scenery still covers (fade dither off). */
  coverCheck?(detail?: boolean | string): CoverReport;
  stackCheck?(only?: number[]): StackReport;
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

/** Night self-light of the glow-rim leaves (round 12). */
// Round 20: 0.9 -> 0.3 (with the lilac tint in foliage.ts: the lit strokes read as specks at 0.9).
const LEAF_GLOW = 0.3;
/** Character night light strengths (fill: warm lantern from the camera side; rim: cool moon edge). */
const CHAR_NIGHT = { fill: 0.55, rim: 0.35, fire: 0.7 };
const tmpFire = new Color();

export async function createLakeScene(canvas: HTMLCanvasElement, opts: { quality: SceneQuality; assetBase?: string; textureBase?: string; openingSrc?: string }): Promise<LakeScene> {
  // Round 23: the painted establishing view shows while everything below compiles (no empty navy TV).
  const opening = await showOpening(canvas, opts.openingSrc ?? "/art/scene/establish.webp");
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
  const kit = await loadPaintKit(opts.textureBase ?? "/art/textures/");
  // The painted kit's planks, canvas, shingles, runestone and snow go into the prop texture array.
  // The painted cards: campfire flames and embers, ride clouds, lamp pools (round 11).
  {
    const ca = imageOf(kit.cloudA);
    const cb = imageOf(kit.cloudB);
    const clouds = ca && cb ? cloudSheetOf(ca, cb) : null;
    setCards(clouds ? { flameA: asCard(kit.flameA.tex), flameB: asCard(kit.flameB.tex), embers: asCard(kit.embers.tex), clouds, poolWarm: asCard(kit.poolWarm.tex), poolCool: asCard(kit.poolCool.tex) } : null);
  }
  setCrystalTexture(kit.crystal);
  setCapImages({ teal: imageOf(kit.capTeal), violet: imageOf(kit.capViolet), gills: imageOf(kit.gills) });
  setPaintImages({ planks: imageOf(kit.planks), canvas: imageOf(kit.canvas), shingles: imageOf(kit.shingles), runestone: imageOf(kit.runestone), snow: imageOf(kit.snow), tiles: imageOf(kit.tiles), rock: imageOf(kit.rock), moss: imageOf(kit.moss),
    quilt: imageOf(kit.quilt), felt: imageOf(kit.felt), leather: imageOf(kit.leather), knit: imageOf(kit.knit), rodwood: imageOf(kit.rodWood), tent: imageOf(kit.tentCanvas) });
  const groundMat = groundMaterial(kit);
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
  // Lamps, lantern posts and their glass, wherever they are built, dissolve through the same fade.
  registerFade(treeMat, occ);
  // Leaf cards for every canopy built from here on (one program for both leaf sheets).
  const leafGlow = { value: 0 };
  /** A kit card cleaned for mipmaps (falls back to the raw texture). */
  const cleanPaint = (t: PaintTex): PaintTex => {
    const img = imageOf(t);
    const c = img ? cleanCardOf(img) : null;
    return c ? { tex: c, inv: t.inv } : t;
  };
  // Round 12: the Codex needle sprays (green, and snow-laden in frost) replace the code-painted sheet.
  const sprayImg = imageOf(kit.pineSpray);
  const snowImg = imageOf(kit.pineSnow);
  const sprayTex = sprayImg ? needleSheetOf(sprayImg) : null;
  const snowTex = snowImg ? needleSheetOf(snowImg) : null;
  const needleTex = sprayTex ? { tex: sprayTex, inv: kit.pineSpray.inv } : needleSheet();
  const leafMats = {
    violet: leafMaterial(kit.leavesViolet, occ, time),
    fern: leafMaterial(kit.leavesFern, occ, time),
    needle: leafMaterial(needleTex, occ, time),
    needleSnow: leafMaterial(snowTex ? { tex: snowTex, inv: kit.pineSnow.inv } : needleTex, occ, time, { hue: 0.7 }),
    // Round 12: teal canopies take the painted teal sheet; every canopy's rim takes the glow sheet,
    // which lights its bright strokes at night (leafGlow follows the moon).
    teal: leafMaterial(cleanPaint(kit.leavesTeal), occ, time),
    glow: leafMaterial(cleanPaint(kit.leavesGlow), occ, time, { hue: 0.6, glow: leafGlow }),
    // Painted wisteria strands on willows and the giant trees (the sheet keeps most of its own colour).
    wisteria: leafMaterial(cleanPaint(kit.wisteria), occ, time, { hue: 0.85 }),
  };
  setFoliageMaterials(leafMats);
  // Painted rock on every boulder and cliff, painted bark on trunks, stone tiles on the tower dais.
  const surfMats = { rock: rockMaterial(kit.rock), bark: barkMaterial(kit.bark, occ), tiles: tilesMaterial(kit.tiles) };
  setSurfaceMaterials(surfMats);
  // Painted alpha-card plants (one sheet, one program) for Moonwell and every place.
  // Round 12: the Codex bluebell, foxglove and glow-cap cards take their cells. The Codex fern (a whole
  // clump) and grass card carpeted the foreground band dark and hid the path: the code-painted ones stay.
  const plantTex = plantSheet({ bluebell: imageOf(kit.bluebell), foxglove: imageOf(kit.foxglove), glowcap: imageOf(kit.glowcapBlue), glowcapViolet: imageOf(kit.glowcapViolet) });
  const plantMat = plantMaterial(plantTex, time, occ);
  const props = buildProps(opts.quality, sway, treeMat, plantMat);
  scene.add(props.group);
  const painted = paintedMaterial();
  const paintedDouble = paintedMaterial({ side: DoubleSide });
  const forest = buildForest(full, treeMat, jobs);
  scene.add(forest.group);
  const trails = buildTrails(full, painted, jobs, plantMat);
  scene.add(trails.group);
  const areas = buildAreaDressing(full, { painted, paintedDouble, sway, tree: treeMat, plant: plantMat }, jobs);
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
  /** Round 18: a find whose reveal waits for the family to reach the water (-1: none waiting). */
  let revealPendingAt = -1;
  const arrivals: { x: number; z: number }[] = [];
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
    // pkScale 0.6 -> 1.8: one cloth stroke no longer spans a whole sleeve or tummy (round 09 blotches).
    body: paintedMaterial({ pkScale: 1.8, crisp: true }),
    glowRod: new MeshBasicMaterial({ vertexColors: true, color: new Color(1.6, 1.8, 2.4) }),
  };
  const fishers = new FisherViews(rigMats, cardGeo, textures, fx, shadows);
  fishers.rideOf = (seat, out) => vehicles.rideSeat(seat, out);
  scene.add(fishers.group);
  const swirls = new SwirlViews(water, shadows, fx);
  const goldAt = { x: 0, z: 0 };
  /** A golden swirl this close to the family's centre joins the camera's framing (metres). */
  const GOLD_FRAME_M = 40;
  scene.add(swirls.group);
  const world = new Group();
  scene.add(world);
  const splitFocus = new SplitFocus();
  const familyFrame = new FamilyFrame();
  /** Round 20: the place the camera's side was last worked out for, and that side (placeView.ts). */
  let yawPlace = "";
  let yawNow = 0;
  const yawFeet: { x: number; z: number }[] = [];
  const allSeats = new Set<number>();
  const members: Member[] = [];
  const markerList: Marker[] = [];
  let framed: ReadonlySet<number> = new Set();
  const markers = new EdgeMarkers();
  scene.add(...markers.meshes);
  // Round 21: every scenery material takes the cover fade (cover.ts); these keep their look: the fishers,
  // the ground and water they stand in, the sky, effects, and the vehicles (the family rides in them).
  const cover = makeCoverUniforms();
  const coverFeet: { x: number; y: number; z: number; top: number }[] = [];
  for (const o of [sky.dome, sky.mountains, ground.group, ...water.ponds, water.brook, water.falls, mist.mesh, fow.mesh, shells.mesh, vehicles.group, rays.mesh, parts.water.points, parts.glow.points, splashes.group, escape.group, shadows.mesh, fishers.group, swirls.group, ...markers.meshes])
    o.userData.coverExempt = true;
  // Every dissolving tree casts its shadow through the same fade (no shadow without its tree).
  const treeDepth = occluderDepthMaterial(occ);
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const m = o.material;
    if (m === treeMat || (Array.isArray(m) && m.includes(treeMat))) o.customDepthMaterial = treeDepth;
  });

  let post: Post | null = full ? buildPost(renderer, scene, camera, w, h) : null;
  // Without the post chain the name tags draw in the main pass.
  if (!post) camera.layers.enable(TAG_LAYER);
  // Name tags wait out the campfire dissolve (over the held old frame they would float in the wrong places).
  else {
    const dissolve = post.dissolve;
    post.overlay = (draw) => {
      if (dissolve.k < 0.35) fishers.forEachTag(draw);
    };
  }
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
  const faceList: { x: number; y: number; z: number; r: number }[] = [];
  const catchBuf: CatchFocus = { x: 0, y: 0, z: 0, age: 0 };

  /** 0..1: how far the sky has gone over to the zeppelin's twilight (eased; last frame's ride). */
  let rideSky = 0;
  /** 0..1: the campfire is lit (eased), so the fire takes over the fishers' warm fill. */
  let campLight = 0;
  const applyTod = (phase: number) => {
    sampleTod(phase, tod);
    mood.apply(tod);
    rideTwilight(tod, rideSky);
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
    if (post) post.gain.copy(tod.grade);
    // Night: a warm lantern fill and a cool moonlit rim on the fishers (they stay readable on the TV).
    // By the campfire the fire itself is the warm key (no second lantern on the faces).
    // Round 11: by the campfire the fill is the fire's own warm key (its direction set per frame below),
    // the rim a cool edge on the side away from it.
    CHAR_LIGHT.fill.value.setRGB(1.0, 0.64, 0.36).multiplyScalar(CHAR_NIGHT.fill * tod.moon * (1 - campLight));
    CHAR_LIGHT.fill.value.add(tmpFire.setRGB(1.0, 0.52, 0.24).multiplyScalar(CHAR_NIGHT.fire * campLight));
    leafGlow.value = LEAF_GLOW * tod.moon;
    CHAR_LIGHT.rim.value.setRGB(0.42, 0.6, 1.0).multiplyScalar(CHAR_NIGHT.rim * Math.max(tod.moon, campLight));
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
    campLight += ((lake?.campfire ? 1 : 0) - campLight) * Math.min(1, dt * 1.5);
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
        // The celebration sparkles now; the camera's reveal waits for the family to arrive (revealGate.ts).
        revealPendingAt = t;
        revealAt = -1;
        revealArea = activeWorld().placeById(lake.discovery.area) ?? revealArea;
        fx.discoverySwirl(revealArea.center.x, revealArea.center.z, revealArea.pond.r + 6);
      }
    } else if (lake && !lake.discovery && discoverySeq === -1) discoverySeq = 0;
    if (revealPendingAt >= 0) {
      arrivals.length = 0;
      fishers.forEachSeat((_s, x, _y, z) => { arrivals.push({ x, z }); });
      if (revealReady(arrivals, revealArea, t - revealPendingAt)) {
        revealPendingAt = -1;
        revealAt = t;
      }
    }
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
    swirls.frame(lake, sn, t, dt, tod.glow, camera.position);
    fishers.frame(lake, sn, t, dt, camera, props.campSeats);
    shadows.end();
    fx.ambient(dt, tod, lake?.campfire ? 1 : 0, rig.focus.x, rig.focus.z);
    parts.water.update(dt, t);
    splashes.frame(t);
    escape.frame(t, (x, z, ts, away) => fx.slap(x, z, ts, away), camera.position.x, camera.position.z);
    parts.glow.update(dt, t);
    // Spread out: frame the active place (a line in the water, else the latest mover), mark the rest.
    members.length = 0;
    fishers.forEachSeat((seat, x, _y, z) => {
      const f = lake?.fishers.find((ff) => ff.seat === seat);
      const m = f?.mode;
      const activity = m === "bite" || m === "reel" || m === "catch" ? "hot" : m === "cast" || m === "wait" ? "line" : "idle";
      members.push({ seat, x, z, activity, inputAt: (f?.lastInputAt ?? 0) / 1000, place: activeWorld().areaAt({ x, z })?.id ?? null });
    });
    // Within the cap the whole family shares the shot (zoomed out); only past it does the camera pick a
    // place and mark the rest at the screen edge. SplitFocus still runs, so its lead and hold stay current.
    const sp0 = splitFocus.update(members, sn / 1000);
    const whole = familyFrame.update(members);
    allSeats.clear();
    for (const mm of members) allSeats.add(mm.seat);
    const sp = whole ? { split: false, lead: sp0.lead, framed: allSeats } : sp0;
    const wide = whole && familyFrame.spread > 18;
    framed = sp.framed;
    // Riders step aboard and ashore in a row across the view (round 21).
    camera.getWorldDirection(tmpO);
    vehicles.setAcross(-tmpO.z, tmpO.x);
    const riding = vehicles.riding();
    rideSky += ((riding === 2 ? 1 : 0) - rideSky) * Math.min(1, dt * 0.8);
    rig.rateK += ((riding ? 3.2 : 1) - rig.rateK) * Math.min(1, dt * 2);
    rig.ride = riding ? { heading: vehicles.heading(), kind: riding } : null;
    // Coming in to land (the last 30 % of an airship ride) the shot closes in on the family in the gondola.
    const rideK = lake?.ride ? Math.min(1, Math.max(0, (sn - lake.ride.departAt) / Math.max(1, lake.ride.arriveAt - lake.ride.departAt))) : 0;
    const landing = riding === 2 ? Math.min(1, Math.max(0, (rideK - 0.7) / 0.2)) : 0;
    rig.minDist += ((riding === 2 ? 24 - 6 * landing : riding === 1 ? 22 : sp.split || wide ? 23 : 17) - rig.minDist) * Math.min(1, dt * (riding ? 0.8 : 2));
    rig.beginFocus();
    fishers.forEachSeat((seat, x, y, z, _c, bob) => {
      if (!framed.has(seat)) return;
      rig.addFocus(x, y, z);
      rig.addFisher(x, z);
      if (bob) rig.addFocus(bob.x, Math.max(0, bob.y), bob.z, true);
    });
    const nf = vehicles.rideFocus(rideFocus);
    for (let i = 0; i < nf; i++) rig.addFocus(rideFocus[i]!.x, rideFocus[i]!.y, rideFocus[i]!.z);
    const bf = riding ? null : vehicles.boardFocus(rideFocus);
    if (bf) for (let i = 0; i < bf.n; i++) rig.addFocus(rideFocus[i]!.x, rideFocus[i]!.y, rideFocus[i]!.z);
    const vehN = nf > 0 ? nf : bf ? bf.n : 0;
    rig.board = bf ? { ux: bf.ux, uz: bf.uz, kind: bf.kind } : null;
    const cf = fishers.catchFocus(t, catchBuf);
    // Out on a trail (between places), the camera looks further ahead.
    let n = 0;
    let gx = 0;
    let gz = 0;
    fishers.forEachSeat((seat, x, _y, z) => { if (framed.has(seat)) { gx += x; gz += z; n++; } });
    // A golden swirl near the family is part of the shot (round 13: one was announced and never seen).
    if (n > 0 && !riding && !bf && !cf && swirls.goldAt(goldAt) > 0.3 && Math.hypot(goldAt.x - gx / n, goldAt.z - gz / n) < GOLD_FRAME_M) rig.addFocus(goldAt.x, 0, goldAt.z, true);
    const here = n > 0 ? activeWorld().areaAt({ x: gx / n, z: gz / n }) : null;
    const onTrail = n > 0 && here === null && !riding ? 1 : 0;
    if (here && n > 0 && !riding && !bf) {
      // Fishers by a pond: frame the water they stand at, not the trail behind them.
      const wx = here.center.x - gx / n;
      const wz = here.center.z - gz / n;
      const wd = Math.hypot(wx, wz);
      if (wd < here.pond.r + here.clearing && wd > 0.5) {
        const k = Math.min(wd, 10) / wd;
        rig.addFocus(gx / n + wx * k, 0, gz / n + wz * k, true);
      }
    }
    // Tower decks near the family: the group camera yaws so it never looks at them through one (round 14).
    rig.blockers.length = 0;
    if (n > 0 && !riding) {
      const fxm = gx / n;
      const fzm = gz / n;
      for (const pl of platformsAround(fxm, fzm)) {
        if (pl.kind !== "zeppelin") continue;
        const place = activeWorld().placeById(pl.place);
        if (!place) continue;
        const tw = activeWorld().towerAt(place);
        if (Math.hypot(tw.x - fxm, tw.z - fzm) < 45 && !rig.blockers.some((b) => b.x === tw.x && b.z === tw.z)) rig.blockers.push({ x: tw.x, z: tw.z, r: DECK_R + 0.3 });
      }
    }
    if (here) {
      rig.anchor.set(here.center.x, 0, here.center.z);
      // Round 20: the place's own side while the family fishes it, round behind them when they fish its far
      // shore (placeView.ts: Mistmarsh's boardwalk shore was framed from across the pond).
      yawFeet.length = 0;
      fishers.forEachSeat((seat, x, _y, z) => { if (framed.has(seat) && yawFeet.length < 8) yawFeet.push({ x, z }); });
      const pref = placeSideYaw(here);
      if (here.key !== yawPlace) {
        yawPlace = here.key;
        yawNow = rig.placeYaw + wrapAngle(pref - rig.placeYaw);
      }
      yawNow = placeYaw(pref, behindYaw(here.center.x, here.center.z, yawFeet), yawNow);
      rig.placeYaw = yawNow;
    }
    trailW += (onTrail - trailW) * Math.min(1, dt * 1.5);
    const reveal = revealAge >= 0 && revealAge < REVEAL_S + 0.4 ? { x: revealArea.center.x, z: revealArea.center.z, age: revealAge, r: revealArea.pond.r } : null;
    rig.update(t, dt, lake?.campfire ?? false, cf, trailW, reveal);
    if (post) post.dissolve.k = dissolveK(t - rig.campCutAt);
    // Sparkles keep off faces (round 11: they covered Juneau's at night).
    faceList.length = 0;
    fishers.forEachFace((x, y, z) => { if (faceList.length < 4) faceList.push({ x, y, z, r: 0.85 }); });
    parts.glow.setFaces(faceList);
    parts.water.setFaces(faceList);
    // The campfire in view space: the fishers' warm key comes from it (painter.ts, characters only).
    props.fireLight.getWorldPosition(tmpO).applyMatrix4(camera.matrixWorldInverse);
    CHAR_LIGHT.fire.value.set(tmpO.x, tmpO.y, tmpO.z, campLight);
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
    let bx0 = 1, by0 = 1, bx1 = 0, by1 = 0, near = Infinity, far = 0, farDist = 0;
    const boxPt = (x: number, y: number, z: number) => {
      tmpO.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      near = Math.min(near, -tmpO.z);
      far = Math.max(far, -tmpO.z);
      tmpO.applyMatrix4(camera.projectionMatrix);
      const sx = tmpO.x * 0.5 + 0.5;
      const sy = tmpO.y * 0.5 + 0.5;
      bx0 = Math.min(bx0, sx); bx1 = Math.max(bx1, sx); by0 = Math.min(by0, sy); by1 = Math.max(by1, sy);
    };
    fishers.forEachSeat((seat, x, y, z) => {
      if (!framed.has(seat)) return;
      farDist = Math.max(farDist, camera.position.distanceTo(tmpO.set(x, y, z)));
      boxPt(x, y, z);
      boxPt(x, y + 3.2, z);
    });
    // The vehicle the family boards or rides is part of the action: nothing in front of it either.
    for (let i = 0; i < vehN; i++) boxPt(rideFocus[i]!.x, rideFocus[i]!.y, rideFocus[i]!.z);
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
    mist.update(tod, t, veilOf, near < Infinity ? far + 1.5 : 0);
    fow.update(tod, t, dt, rig.focus.x, rig.focus.z, lake ? lake.revealed : null, lake ? lake.discovered : [], camera.position.x, camera.position.z, farDist);
    stream(rig.focus.x, rig.focus.z, streamBudget);
    // Nothing between the camera and a fisher (cover.ts): every framed fisher's body box, and whatever the
    // streams just built takes the fade before it first draws.
    coverFeet.length = 0;
    fishers.forEachBody((seat, x, y, z, top) => { if (framed.has(seat)) coverFeet.push({ x, y, z, top }); });
    setCoverFishers(cover, camera, coverFeet);
    coverScene(scene, cover);
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
  {
    const ahead = camera.getWorldDirection(new Vector3()).multiplyScalar(9).add(camera.position);
    fishers.prewarmAt(ahead.x, ahead.y - 1, ahead.z);
  }
  applyTod(0.15);
  // Build the world round the start before the first frame (a loading pause, not a hitch).
  stream(rig.focus.x, rig.focus.z, Infinity);
  forest.update(camera, rig.focus.x, rig.focus.z);
  trails.update(tod, 0, rig.focus.x, rig.focus.z);
  areas.update(tod, camera, 0, rig.focus.x, rig.focus.z, () => 0, () => 0);
  stream(rig.focus.x, rig.focus.z, Infinity);
  seaShow.userData.coverExempt = true;
  coverScene(scene, cover);
  const prevTarget = renderer.getRenderTarget();
  if (post) renderer.setRenderTarget(post.target);
  await renderer.compileAsync(scene, camera);
  // Keep every prewarmed program alive after the showroom is disposed (keepPrograms.ts).
  const keepers = keepPrograms(renderer, scene, camera);
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
  opening.reveal();

  const percentile = (p: number) => {
    const n = Math.min(frameN, FRAME_SAMPLES);
    if (n === 0) return 0;
    const arr = Array.from(frameMs.subarray(0, n)).sort((a, b) => a - b);
    return arr[Math.min(n - 1, Math.floor(p * n))] ?? 0;
  };
  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));

  const hidden: Object3D[] = [];
  window.__scene = {
    camLog(on) {
      const got = rig.record ?? [];
      rig.record = on ? [] : null;
      return on ? [] : got;
    },
    cameraAt: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
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
    debug: () => ({ bodies: (() => {
      const out: number[][] = [];
      fishers.forEachSeat((seat, x, y, z) => {
        const a = tmpO.set(x, y + 0.5, z).project(camera);
        const ax = a.x, ay = a.y;
        const b = tmpO.set(x, y + 2.0, z).project(camera);
        out.push([seat, (ax + b.x) * 0.25 + 0.5, 0.5 - b.y * 0.5, 0.5 - ay * 0.5]);
      });
      return out;
    })(), split: { framed: [...framed], markers: markers.debug() }, fishers: fishers.debug(), camera: camera.position.toArray(), rig: rig.debug(), trees: forest.count, chunks: ground.count(), jobs: jobs.pending(), world: activeWorld().seed, progs: (renderer.info.programs ?? []).map((pr) => `${pr.name}#${pr.cacheKey}`), ride: (() => { const o = { x: 0, y: 0, z: 0, facing: 0 }; const ok = vehicles.rideSeat(0, o); const n = vehicles.rideFocus(rideFocus); return { kind: vehicles.riding(), ok, seat0: [o.x, o.y, o.z].map(Math.round), focus: rideFocus.slice(0, n).map((v) => v.toArray().map(Math.round)) }; })(), fow: { on: fow.mesh.visible, ...fow.stats(), map: Array.from({ length: 11 }, (_, j) => Array.from({ length: 11 }, (_, i) => fow.veilAt(rig.focus.x + (i - 5) * 24, rig.focus.z + (j - 5) * 24)).join('')).join('/'), ahead: [fow.veilAt(rig.focus.x, rig.focus.z), fow.veilAt(rig.focus.x + 100, rig.focus.z), fow.veilAt(rig.focus.x - 100, rig.focus.z - 100)] }, near: nearPlaces.map((p) => `${p.id}:${p.biome}`), veil: Object.fromEntries(veil), mood: mood.debug() }),
    painterly(on) {
      post?.setPainterly(on);
      frameN = 0;
      return post !== null;
    },
    pick(x, y) {
      const rc = new Raycaster();
      rc.setFromCamera(new Vector2(x * 2 - 1, 1 - y * 2), camera);
      const shown = (o: Object3D | null): boolean => !o || (o.visible && shown(o.parent));
      return rc.intersectObjects(scene.children, true).filter((h) => shown(h.object)).slice(0, 8).map((h) => `${h.object.name || h.object.type}${h.object.parent?.name ? "<" + h.object.parent.name : ""} d=${h.distance.toFixed(1)} i=${h.instanceId ?? "-"}`);
    },
    coverCheck: (detail) => coverCheck(renderer, scene, camera, fishers.group, cover, detail ?? false),
    stackCheck: (only) => stackCheck(renderer, scene, camera, fishers.group, fishers.stackParts().filter((p) => !only || only.includes(p.seat))),
    names: () => scene.children.map((o, i) => o.name || `${o.type}#${i}`),
    toggle(name) {
      let n = 0;
      if (name.includes("+")) return name.split("+").reduce((acc, nm) => acc + (window.__scene?.toggle?.(nm) ?? 0), 0);
      if (name === "shadows") { sun.castShadow = !sun.castShadow; return 1; }
      scene.children.forEach((o, i) => { if (!o.name && `${o.type}#${i}` === name) { o.visible = !o.visible; n++; } });
      scene.traverse((o) => { if (o.name === name) { o.visible = !o.visible; n++; } });
      return n;
    },
    hide(prefix, on) {
      let n = 0;
      if (on) {
        scene.traverseVisible((o) => {
          if (o !== scene && o.name.startsWith(prefix)) hidden.push(o);
        });
        for (const o of hidden) o.visible = false;
        n = hidden.length;
      } else {
        for (const o of hidden) o.visible = true;
        n = hidden.length;
        hidden.length = 0;
      }
      frameN = 0;
      return n;
    },
    breakdown() {
      const by = new Map<string, [number, number]>();
      scene.traverseVisible((o) => {
        if (!(o instanceof Mesh)) return;
        const g = o.geometry;
        const tris = (g.index ? g.index.count : g.getAttribute("position").count) / 3;
        const inst = o instanceof InstancedMesh ? o.count : 1;
        const key = `${o.parent?.name ?? ""}/${o.name || "?"}`;
        const e = by.get(key) ?? [0, 0];
        e[0] += 1;
        e[1] += tris * inst;
        by.set(key, e);
      });
      return [...by].map(([k, [m, t]]): [string, number, number] => [k, m, Math.round(t)]).sort((a, b) => b[2] - a[2]).slice(0, 40);
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
      opening.dispose();
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
      kit.dispose();
      leafMats.violet.dispose();
      leafMats.fern.dispose();
      leafMats.needle.map?.dispose();
      leafMats.needle.dispose();
      for (const m of [leafMats.needleSnow, leafMats.teal, leafMats.glow, leafMats.wisteria]) {
        m.map?.dispose();
        m.dispose();
      }
      setFoliageMaterials(null);
      for (const m of Object.values(surfMats)) m.dispose();
      setSurfaceMaterials(null);
      water.dispose();
      rays.dispose();
      props.dispose();
      sway.dispose();
      plantMat.dispose();
      plantTex.dispose();
      treeMat.dispose();
      treeMatDouble.dispose();
      treeDepth.dispose();
      keepers.dispose();
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

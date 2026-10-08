/**
 * Scene lab: the TV scene full-window, driven by a local simulation with the real lake rules and
 * simple bots. ?scenario=morning|four-reel|golden-swirl|night-catch|rod-upgrade|campfire|empty|
 * moonwell|mistmarsh|pools|hollow|tarn|trail|discovery|night-tarn &phase=0..1 &seed=N &lite=1 &view=name
 */
import { produce } from "immer";
import { CATCH_SKIP_MS, SEAT_COLORS, action, join, move, newLake, reelHold, setCampfire, step, type Fisher, type Lake } from "../game/lake";
import { DAY_MS, DAY_START } from "../game/daycycle";
import { fishById } from "../game/fish";
import { thrashingAt } from "../game/reel";
import { AREAS, DOCK, TRAILS, areaAt, areaById, castFrom, castRing, castRingIn, distance, lakeRadius, pondRadius, type AreaId, type Vec } from "../game/world";
import { createLakeScene } from "./scene";

type Bot = { target: Vec; hookAt: number; nextCastAt: number; stick: { x: number; y: number }; holding: boolean; reactAt: number; wander: boolean };
type Scenario = {
  phase: number;
  fishers: { seat: number; name: string; spot: Vec | "swirl" | "golden"; easy?: boolean; at?: Vec }[];
  setup?: (lake: Lake, now: number) => Lake;
  /** Tweaks every step (the "director"). */
  direct?: (lake: Lake, now: number) => Lake;
  /** Fast-forward (virtual time) until this holds, before going real time. */
  warmUntil?: (lake: Lake) => boolean;
  hero: (lake: Lake, now: number, startedRealAt: number) => boolean;
  campfire?: boolean;
};

const shore = (theta: number, out = 1.3): Vec => {
  const r = lakeRadius(theta) + out;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
};
/** A spot on a place's shore, `out` metres from the water. */
const shoreIn = (id: AreaId, theta: number, out = 1.3): Vec => {
  const a = areaById(id);
  const r = pondRadius(a, theta) + out;
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
};
const discoverAll = (l: Lake): Lake => produce(l, (d) => { d.discovered = AREAS.map((a) => a.id); });
const discoverOnly = (ids: AreaId[]) => (l: Lake): Lake => produce(l, (d) => { d.discovered = ["moonwell", ...ids]; });
const swirlIn = (id: AreaId, theta: number, golden: boolean) => (l: Lake, now: number): Lake =>
  produce(l, (d) => {
    d.swirls = d.swirls.filter((s) => s.area !== id);
    d.swirlSeq += 1;
    d.swirls.push({ id: d.swirlSeq, area: id, pos: castRingIn(areaById(id), theta), theta, golden, since: now - 3000, until: now + 90_000, catches: 0 });
  });
const both = (...fs: ((l: Lake, now: number) => Lake)[]) => (l: Lake, now: number): Lake => fs.reduce((acc, f) => f(acc, now), l);
/** A point on a trail: `t` 0..1 from its first place to its second, `lat` metres to its left. */
const onTrailAt = (i: number, t: number, lat = 0): Vec => {
  const tr = TRAILS[i]!;
  const dx = tr.to.x - tr.from.x;
  const dz = tr.to.z - tr.from.z;
  const len = Math.hypot(dx, dz);
  return { x: tr.from.x + dx * t - (dz / len) * lat, z: tr.from.z + dz * t + (dx / len) * lat };
};
/** A calm moment to show a place: a while in, nobody holding up a catch. */
const calm = (l: Lake, now: number, s: number) => now - s > 5000 && !l.fishers.some((f) => f.mode === "catch");
const centroid = (l: Lake): Vec => {
  const n = Math.max(1, l.fishers.length);
  return { x: l.fishers.reduce((s, f) => s + f.pos.x, 0) / n, z: l.fishers.reduce((s, f) => s + f.pos.z, 0) / n };
};
const forceCatchFish = (seat: number, fishId: string, cm: number) => (l: Lake): Lake =>
  produce(l, (d) => {
    for (const f of d.fishers) if (f.mode === "reel" && f.reel && f.seat === seat && f.reel.fishId !== fishId) {
      f.reel.fishId = fishId;
      f.reel.cm = cm;
    }
    d.journal = Object.fromEntries(Object.entries(d.journal).filter(([id]) => id !== fishId));
  });

const DOCK_SPOT: Vec = { x: 0.3, z: DOCK.tipZ + 0.9 };

function swirlSpot(lake: Lake, golden: boolean): Vec | null {
  const s = lake.swirls.find((x) => x.golden === golden);
  return s ? shore(s.theta) : null;
}

function forceSwirl(lake: Lake, theta: number, golden: boolean, now: number): Lake {
  return produce(lake, (d) => {
    d.swirls = d.swirls.filter((s) => Math.abs(s.theta - theta) > 1);
    d.swirlSeq += 1;
    d.swirls.push({ id: d.swirlSeq, area: "moonwell", pos: castRing(theta), theta, golden, since: now - 3000, until: now + 90_000, catches: 0 });
  });
}

const inCatch = (lake: Lake, now: number, min: number, max: number) =>
  lake.fishers.some((f) => f.mode === "catch" && f.catch !== null && now - f.catch.at >= min && now - f.catch.at <= max);

const SCENARIOS: Record<string, Scenario> = {
  morning: {
    phase: 0.14,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(2.2) },
      { seat: 2, name: "Juneau", spot: DOCK_SPOT },
    ],
    hero: (_l, now, s) => now - s > 5000,
  },
  "four-reel": {
    phase: 0.22,
    fishers: [
      { seat: 0, name: "Dad", spot: DOCK_SPOT, at: { x: 0, z: DOCK.tipZ + 1.5 } },
      { seat: 1, name: "Mom", spot: "swirl" },
      { seat: 2, name: "Juneau", spot: shore(2.75), at: shore(2.75, 2) },
      { seat: 3, name: "Sis", spot: shore(0.5), easy: true, at: shore(0.5, 2) },
    ],
    setup: (l, now) => forceSwirl(l, 3.6, false, now),
    warmUntil: (l) => l.fishers.filter((f) => f.mode === "reel").length >= 2,
    hero: (l, now) => inCatch(l, now, 1100, 1900) && l.fishers.some((f) => f.mode === "reel"),
  },
  "golden-swirl": {
    phase: 0.43,
    fishers: [
      { seat: 2, name: "Juneau", spot: "golden", at: shore(2.4, 3) },
      { seat: 0, name: "Dad", spot: "golden", at: shore(2.0, 3) },
    ],
    setup: (l, now) => forceSwirl(l, 2.3, true, now),
    warmUntil: (l) => l.fishers.some((f) => f.mode === "wait"),
    hero: (l, now, s) => now - s > 4000 && l.fishers.some((f) => f.mode === "reel" || f.mode === "bite"),
  },
  "night-catch": {
    phase: 0.7,
    fishers: [
      { seat: 2, name: "Juneau", spot: shore(2.6), at: shore(2.6, 2) },
      { seat: 0, name: "Dad", spot: DOCK_SPOT },
    ],
    direct: (l) =>
      produce(l, (d) => {
        for (const f of d.fishers) if (f.mode === "reel" && f.reel && f.seat === 2 && f.reel.fishId !== "glowfin") {
          f.reel.fishId = "glowfin";
          f.reel.cm = 34;
        }
        d.journal = Object.fromEntries(Object.entries(d.journal).filter(([id]) => id !== "glowfin"));
      }),
    warmUntil: (l) => l.fishers.some((f) => f.seat === 2 && f.mode === "reel"),
    hero: (l, now) => inCatch(l, now, 1300, 2000),
  },
  "rod-upgrade": {
    phase: 0.3,
    fishers: [
      { seat: 2, name: "Juneau", spot: shore(2.5), at: shore(2.5, 2) },
      { seat: 1, name: "Mom", spot: shore(1.9), at: shore(1.9, 2) },
    ],
    setup: (l) => produce(l, (d) => { d.shells = 19; d.rodTier = 0; }),
    warmUntil: (l) => l.fishers.some((f) => f.mode === "reel"),
    hero: (l, now) => l.upgradeSeq > 0 && inCatch(l, now, 1000, 1700),
  },
  campfire: {
    phase: 0.62,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(1.6) },
      { seat: 1, name: "Mom", spot: shore(1.4) },
      { seat: 2, name: "Juneau", spot: shore(1.2) },
      { seat: 3, name: "Sis", spot: shore(1.0) },
    ],
    campfire: true,
    hero: (_l, now, s) => now - s > 4500,
  },
  empty: { phase: 0.4, fishers: [], hero: (_l, now, s) => now - s > 3000 },
  // ---- the valley: each place with the family fishing there ----
  moonwell: {
    phase: 0.2,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(2.4), at: shore(2.4, 2) },
      { seat: 1, name: "Mom", spot: shore(0.9), at: shore(0.9, 2) },
      { seat: 2, name: "Juneau", spot: DOCK_SPOT },
    ],
    setup: discoverAll,
    hero: calm,
  },
  mistmarsh: {
    phase: 0.44,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", 0.2), at: shoreIn("mistmarsh", 0.2, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", 1.0), at: shoreIn("mistmarsh", 1.0, 2) },
      { seat: 3, name: "Sis", spot: shoreIn("mistmarsh", 1.7), easy: true, at: shoreIn("mistmarsh", 1.7, 2) },
    ],
    setup: both(discoverOnly(["mistmarsh"]), swirlIn("mistmarsh", 0.6, false)),
    hero: calm,
  },
  pools: {
    phase: 0.24,
    fishers: [
      { seat: 1, name: "Mom", spot: shoreIn("pools", 0.4), at: shoreIn("pools", 0.4, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("pools", 1.4), at: shoreIn("pools", 1.4, 2) },
    ],
    setup: both(discoverOnly(["pools"]), swirlIn("pools", 0.9, false)),
    hero: calm,
  },
  hollow: {
    phase: 0.3,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("hollow", 2.0), at: shoreIn("hollow", 2.0, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("hollow", 1.2), at: shoreIn("hollow", 1.2, 2) },
      { seat: 3, name: "Sis", spot: shoreIn("hollow", 0.5), easy: true, at: shoreIn("hollow", 0.5, 2) },
    ],
    setup: both(discoverOnly(["hollow"]), swirlIn("hollow", 1.4, false)),
    hero: calm,
  },
  tarn: {
    phase: 0.12,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("tarn", 1.9), at: shoreIn("tarn", 1.9, 2) },
      { seat: 1, name: "Mom", spot: shoreIn("tarn", 1.2), at: shoreIn("tarn", 1.2, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("tarn", 0.6), at: shoreIn("tarn", 0.6, 2) },
      { seat: 3, name: "Sis", spot: shoreIn("tarn", 2.6), easy: true, at: shoreIn("tarn", 2.6, 2) },
    ],
    setup: both(discoverAll, swirlIn("tarn", 1.3, false)),
    hero: calm,
  },
  // The family walking the trail from Moonwell Lake toward Mistmarsh (not found yet: it glows ahead).
  trail: {
    phase: 0.36,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", -0.6, 1.5), at: onTrailAt(0, -0.16, 1.2) },
      { seat: 1, name: "Mom", spot: shoreIn("mistmarsh", -0.4, 1.5), at: onTrailAt(0, -0.22, -1.2) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -0.8, 1.5), at: onTrailAt(0, -0.1, 0) },
      { seat: 3, name: "Sis", spot: shoreIn("mistmarsh", -0.5, 1.5), at: onTrailAt(0, -0.26, 0.4) },
    ],
    warmUntil: () => true,
    hero: (l, now, s) => now - s > 3500 && areaAt(centroid(l)) === null && centroid(l).x < -38,
  },
  // Two catches at once, side by side.
  "double-catch": {
    phase: 0.25,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(2.3), easy: true, at: shore(2.3, 2) },
      { seat: 3, name: "Sis", spot: shore(2.15), easy: true, at: shore(2.15, 2) },
    ],
    direct: (l) => produce(l, (d) => { for (const f of d.fishers) if (f.reel) f.reel.fishId = f.seat === 0 ? "perch" : "bluegill"; }),
    warmUntil: (l) => l.fishers.every((f) => f.mode === "reel"),
    hero: (l, now) => l.fishers.filter((f) => f.mode === "catch" && f.catch !== null && now - f.catch.at > 900 && now - f.catch.at < 2600).length >= 2,
  },
  // The family strung out along the trail: one at the lake, one mid-trail, one at the marsh's edge.
  spread: {
    phase: 0.3,
    fishers: [
      { seat: 0, name: "Dad", spot: onTrailAt(0, -0.3), at: onTrailAt(0, -0.3) },
      { seat: 2, name: "Juneau", spot: onTrailAt(0, 0.5), at: onTrailAt(0, 0.5) },
      { seat: 1, name: "Mom", spot: onTrailAt(0, 1.05), at: onTrailAt(0, 1.05) },
    ],
    setup: discoverOnly(["mistmarsh"]),
    warmUntil: () => true,
    hero: (_l, now, s) => now - s > 4500,
  },
  // Juneau walks out of the trees into Mistmarsh: the discovery moment.
  discovery: {
    phase: 0.4,
    fishers: [
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -0.55, 1.5), at: onTrailAt(0, 0.22, 0) },
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", -0.3, 1.5), at: onTrailAt(0, 0.08, 1.2) },
      { seat: 1, name: "Mom", spot: shoreIn("mistmarsh", -0.8, 1.5), at: onTrailAt(0, 0.02, -1.2) },
    ],
    warmUntil: () => true,
    hero: (l, now) => l.discovery !== null && now - l.discovery.at > 1300,
  },
  // A Moonfin, the legend of Starfall Tarn, at night.
  "night-tarn": {
    phase: 0.68,
    fishers: [
      { seat: 2, name: "Juneau", spot: shoreIn("tarn", 1.1), at: shoreIn("tarn", 1.1, 2) },
      { seat: 0, name: "Dad", spot: shoreIn("tarn", 1.8), at: shoreIn("tarn", 1.8, 2) },
    ],
    setup: discoverAll,
    direct: forceCatchFish(2, "moonfin", 96),
    warmUntil: (l) => l.fishers.some((f) => f.seat === 2 && f.mode === "reel"),
    hero: (l, now) => inCatch(l, now, 1300, 2000),
  },
};

declare global {
  interface Window {
    __lab?: { ready: boolean; heroReady: boolean; scenario: string; lake(): Lake | null; skipTo(ms: number): void };
  }
}

function joinAs(lake: Lake, seat: number, name: string, at: Vec | undefined, easy: boolean): Lake {
  // Join until the requested seat is ours, then drop the placeholders.
  let l = lake;
  const placeholders: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = join(l, { name, ogsId: null });
    l = r.lake;
    if (r.seat === seat || r.seat === null) break;
    placeholders.push(r.seat);
  }
  return produce(l, (d) => {
    d.fishers = d.fishers.filter((f) => !placeholders.includes(f.seat) || f.seat === seat);
    const f = d.fishers.find((x) => x.seat === seat);
    if (f) {
      f.easy = easy;
      if (at) f.pos = { ...at };
    }
  });
}

function botStep(lake: Lake, f: Fisher, bot: Bot, now: number): Lake {
  let l = lake;
  if (l.campfire) return l;
  if (f.mode === "walk") {
    const dx = bot.target.x - f.pos.x;
    const dz = bot.target.z - f.pos.z;
    const len = Math.hypot(dx, dz);
    const can = castFrom(f.pos);
    if (len > 0.5 && !(can && len < 1.6)) {
      const stick = { x: dx / len, y: -dz / len };
      if (Math.abs(stick.x - bot.stick.x) + Math.abs(stick.y - bot.stick.y) > 0.15) {
        bot.stick = stick;
        l = move(l, f.seat, stick, now);
      }
    } else {
      if (bot.stick.x !== 0 || bot.stick.y !== 0) {
        bot.stick = { x: 0, y: 0 };
        l = move(l, f.seat, bot.stick, now);
      }
      if (now >= bot.nextCastAt) l = action(l, f.seat, now);
    }
  } else if (f.mode === "bite") {
    if (bot.hookAt === 0) bot.hookAt = now + 300 + ((f.seat * 97) % 400);
    if (now >= bot.hookAt) {
      bot.hookAt = 0;
      l = action(l, f.seat, now);
    }
  } else if (f.mode === "reel" && f.reel) {
    const def = fishById(f.reel.fishId);
    const thrash = def ? thrashingAt(def.fight, f.reel, now) : false;
    const want = !thrash;
    if (want !== bot.holding && now >= bot.reactAt) {
      bot.holding = want;
      bot.reactAt = now + 180;
      l = reelHold(l, f.seat, want, now);
    } else if (f.reel.holding !== bot.holding) l = reelHold(l, f.seat, bot.holding, now);
  } else if (f.mode === "catch" && f.catch) {
    if (now >= f.catch.at + CATCH_SKIP_MS + 1600) {
      bot.nextCastAt = now + 400;
      l = action(l, f.seat, now);
    }
  }
  return l;
}

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const name = q.get("scenario") ?? "morning";
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`unknown scenario ${name}; try ${Object.keys(SCENARIOS).join(", ")}`);
  const seed = Number(q.get("seed") ?? "7");
  const forceFish = q.get("fish");
  const phaseQ = q.get("phase");
  const phase = phaseQ !== null ? Number(phaseQ) : sc.phase;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block";
  document.body.style.margin = "0";
  document.body.style.background = "#000";
  document.body.appendChild(canvas);

  let now = 1_000_000;
  const startedAt = now - (((phase - DAY_START) % 1) + 1) % 1 * DAY_MS;
  let lake = newLake(seed, startedAt);
  lake = step(lake, now);
  const bots = new Map<number, Bot>();
  for (const spec of sc.fishers) {
    lake = joinAs(lake, spec.seat, spec.name, spec.at, spec.easy ?? false);
    bots.set(spec.seat, { target: { x: 0, z: 0 }, hookAt: 0, nextCastAt: 0, stick: { x: 0, y: 0 }, holding: false, reactAt: 0, wander: false });
  }
  if (sc.setup) lake = sc.setup(lake, now);
  // ?swapColors=1: colours are chosen per device, not by seat; reverse them to prove the TV follows `color`.
  if (q.get("swapColors")) lake = produce(lake, (d) => { for (const f of d.fishers) f.color = SEAT_COLORS[3 - f.seat]!; });
  const assignTargets = () => {
    for (const spec of sc.fishers) {
      const bot = bots.get(spec.seat);
      if (!bot) continue;
      const t = spec.spot === "swirl" ? swirlSpot(lake, false) : spec.spot === "golden" ? swirlSpot(lake, true) : spec.spot;
      bot.target = t ?? shore(spec.seat * 1.3 + 1.8);
    }
  };
  assignTargets();
  if (sc.campfire) lake = setCampfire(lake, true, now);

  const tick = (dtMs: number) => {
    now += dtMs;
    lake = step(lake, now);
    for (const f of lake.fishers) {
      const bot = bots.get(f.seat);
      if (bot) lake = botStep(lake, f, bot, now);
    }
    if (sc.direct) lake = sc.direct(lake, now);
    // ?fish=<id>: every hooked fish is this one (to see each rarity's catch moment).
    if (forceFish) lake = produce(lake, (d) => { for (const f of d.fishers) if (f.reel && f.reel.fishId !== forceFish) f.reel.fishId = forceFish; });
    if (now % 2000 < dtMs) assignTargets();
  };
  const warmFrom = now;
  if (sc.warmUntil) {
    for (let i = 0; i < 3000 && !sc.warmUntil(lake); i++) tick(50);
  } else for (let i = 0; i < 40; i++) tick(50);
  // The warm-up is virtual time: keep the scenario's time of day where it asked to be.
  const warmed = now - warmFrom;
  lake = produce(lake, (d) => { d.startedAt += warmed; });

  const scene = await createLakeScene(canvas, { quality: q.get("lite") ? "lite" : "full" });
  if (phaseQ !== null) window.__scene?.setPhase(phase);
  const view = q.get("view");
  if (view) window.__scene?.setView(view);
  window.addEventListener("resize", () => scene.resize());

  const lab = {
    ready: false,
    heroReady: false,
    scenario: name,
    lake: () => lake,
    skipTo: (ms: number) => {
      for (let i = 0; i < ms / 50; i++) tick(50);
    },
  };
  window.__lab = lab;
  let realStart = now;
  let lastReal = performance.now();
  let sendAcc = 0;
  scene.update(lake, performance.now());
  const pump = () => {
    const p = performance.now();
    const dt = Math.min(200, p - lastReal);
    lastReal = p;
    tick(dt);
    sendAcc += dt;
    if (sendAcc >= 125) {
      sendAcc = 0;
      scene.update(lake, performance.now());
    }
    if (!lab.heroReady && sc.hero(lake, now, realStart)) lab.heroReady = true;
    setTimeout(pump, 16);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    lab.ready = true;
    realStart = now;
    lastReal = performance.now();
    pump();
  }));
  void distance;
}

main().catch((e: unknown) => {
  const pre = document.createElement("pre");
  pre.style.cssText = "color:#f88;position:fixed;top:0;left:0;z-index:9;font:14px monospace;white-space:pre-wrap";
  pre.textContent = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
  document.body.appendChild(pre);
  console.error(e);
});

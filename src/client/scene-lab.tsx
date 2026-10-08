/**
 * Scene lab: the TV scene full-window, driven by a local simulation with the real lake rules and
 * simple bots. ?scenario=morning|four-reel|golden-swirl|night-catch|rod-upgrade|campfire|empty
 * &phase=0..1 &seed=N &lite=1 &view=name
 */
import { produce } from "immer";
import { CATCH_SKIP_MS, action, join, move, newLake, reelHold, setCampfire, step, type Fisher, type Lake } from "../game/lake";
import { DAY_MS, DAY_START } from "../game/daycycle";
import { fishById } from "../game/fish";
import { thrashingAt } from "../game/reel";
import { DOCK, castFrom, castRing, distance, lakeRadius, type Vec } from "../game/world";
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
const DOCK_SPOT: Vec = { x: 0.3, z: DOCK.tipZ + 0.9 };

function swirlSpot(lake: Lake, golden: boolean): Vec | null {
  const s = lake.swirls.find((x) => x.golden === golden);
  return s ? shore(s.theta) : null;
}

function forceSwirl(lake: Lake, theta: number, golden: boolean, now: number): Lake {
  return produce(lake, (d) => {
    d.swirls = d.swirls.filter((s) => Math.abs(s.theta - theta) > 1);
    d.swirlSeq += 1;
    d.swirls.push({ id: d.swirlSeq, pos: castRing(theta), theta, golden, since: now - 3000, until: now + 90_000, catches: 0 });
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
    if (now % 2000 < dtMs) assignTargets();
  };
  if (sc.warmUntil) {
    for (let i = 0; i < 3000 && !sc.warmUntil(lake); i++) tick(50);
  } else for (let i = 0; i < 40; i++) tick(50);

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

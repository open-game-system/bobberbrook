#!/usr/bin/env node
// Scene screenshot rig: each lab scenario x key times of day on the real GPU, a motion pair, a
// labelled contact sheet and metrics. Usage:
//   node scripts/shoot-scene.mjs [--round NN] [--only a,b] [--base http://127.0.0.1:8842] [--headed] [--quick] [--lite]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const base = args.base ?? "http://127.0.0.1:8842";
const root = "critic/scene";
mkdirSync(root, { recursive: true });
const round = args.round ?? String(readdirSync(root).filter((d) => /^\d+$/.test(d)).length + 1).padStart(2, "0");
const out = join(root, round);
mkdirSync(out, { recursive: true });

// scenario, phase (null = scenario default), wait for the hero moment?
const SHOTS = [
  ["moonwell", null, true],
  ["far-place", null, true],
  ["shore-frost", null, true],
  ["shore-ember", null, true],
  ["biome-willow", null, true],
  ["biome-crystal", null, true],
  ["biome-ember", null, true],
  ["biome-frost", null, true],
  ["biome-marsh", null, true],
  ["fog", null, true],
  ["boarding", null, true],
  ["tower", null, true],
  ["tower-lamp", null, true],
  ["boat-ride", null, true],
  ["zeppelin-ride", null, true],
  ["arrival", null, true],
  ["mistmarsh", null, true],
  ["hollow", null, true],
  ["pools", null, true],
  ["tarn", null, true],
  ["trail", null, true],
  ["trail-walk", null, true],
  ["trail-file", null, true],
  ["shore-line", null, true],
  ["spread", null, true],
  ["split", null, true],
  ["night-woods", null, true],
  ["discovery", null, true],
  ["night-tarn", null, true],
  ["double-catch", null, true],
  ["mistmarsh-catch", null, true],
  ["mistmarsh-reel", null, true],
  ["mistmarsh-tag", null, true],
  ["mistmarsh-tag-wait", null, true],
  ["mistmarsh-foot-tag", null, true],
  ["moonwell-spawn", null, true],
  ["mistmarsh-dock", null, true],
  ["mistmarsh-dock-foot", null, true],
  ["miss", null, true],
  ["morning", null, false],
  ["morning", 0.97, false],
  ["four-reel", null, true],
  ["reel-thrash", null, true],
  ["golden-swirl", null, true],
  ["golden-trail", null, true],
  ["night-catch", null, true],
  ["rod-upgrade", null, true],
  ["campfire", null, false],
  ["campfire-out", null, true],
  ["empty", 0.1, false],
  ["empty", 0.65, false],
];
// Time-of-day matrix: every hero view again at morning, golden hour, night and dawn (phases per
// src/game/daycycle.ts timeOfDay: morning < 0.36 <= golden < 0.5 <= night < 0.86 <= dawn). Labels
// "<view>@tod-<name>", files "<view>_tod-<name>.png". --no-tod skips it.
const TOD = [["morning", 0.2], ["golden", 0.44], ["night", 0.68], ["dawn", 0.93]];
const TOD_VIEWS = ["moonwell", "far-place", "mistmarsh", "hollow", "tower", "trail", "discovery", "four-reel"];
// Round 28: the cover check on every frame of a catch push-in (the round 27 session's wisteria curtain swept
// over Juneau's Mistmarsh catch mid-push while the settled still passed with 0 cover). Labels "<view>@push":
// from the first catch landing, coverCheck runs on each rendered frame for PUSH_MS (rules running) with the
// fade's dither as drawn (live: a faded surface's kept pixels count), and the worst frame must stay under
// COVER_MAX_FRAC. The still is the end of the push (not the worst frame).
const PUSH_VIEWS = ["mistmarsh-catch", "mistmarsh-dock", "mistmarsh-dock-foot", "mistmarsh-tag", "mistmarsh-foot-tag", "double-catch", "catch-leap", "night-catch"];
const PUSH_MS = 2000;
const only = typeof args.only === "string" ? args.only.split(",") : null;
const matrix = args["no-tod"] ? [] : TOD_VIEWS.flatMap((v) => TOD.map(([name, ph]) => [v, ph, true, name]));
// --soak: only the uncapped soaks (A/B perf), no stills.
const pushes = args["no-push"] ? [] : PUSH_VIEWS.filter((v) => !only || only.includes(v) || only.includes(`${v}@push`)).map((v) => [v, null, true, null, true]);
const shots = args.soak ? [] : [...(args["push-only"] ? [] : [...SHOTS, ...matrix].filter(([s]) => !only || only.includes(s))), ...pushes].slice(0, args.quick ? 4 : undefined);

// Real GPU: full Chromium (not the headless shell, which renders on SwiftShader).
// --disable-audio-output: a fake speaker, so a hung coreaudiod never blocks the TV page's AudioContext.
const flags = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-audio-output"];
const SOAKS = ["four-reel", "tower", "boarding"];
// The soak runs uncapped (no vsync) so frame times measure the real cost; screenshots need vsync.
const perfFlags = [...flags, "--disable-gpu-vsync", "--disable-frame-rate-limit"];
async function launch(f = flags) {
  const attempts = [{ channel: "chromium" }, { channel: "chrome" }];
  let last;
  for (const extra of attempts) {
    try { return await chromium.launch({ headless: !args.headed, args: f, ...extra }); } catch (e) { last = e; }
  }
  throw last;
}
let browser = await launch();
const errors = [];
const metrics = { round, shots: [] };
/** Round 21: at most this share of any framed fisher's body pixels may be covered by scenery (see coverCheck.ts). */
const COVER_MAX_FRAC = 0.02;
/** Round 24: at most this share of any fisher (body and held fish) may be covered by another fisher (stackCheck). */
const STACK_MAX_FRAC = 0.02;
/** Round 28: shots whose fishers fish a shore together (spotCheck): dry feet, and at least this many body widths between neighbours on screen. */
const SPOT_VIEWS = ["mistmarsh", "mistmarsh-catch", "mistmarsh-tag", "mistmarsh-foot-tag", "mistmarsh-tag-wait", "mistmarsh-dock-foot", "moonwell-spawn", "double-catch", "catch-leap"];
const SPOT_MIN_GAP = 1;
const failures = [];
const files = [];
// Everything taken so far is on disk after every shot: a crash later never loses the stills.
const saveMetrics = () => writeFileSync(join(out, "metrics.json"), JSON.stringify({ ...metrics, errors, failures }, null, 2));

// One page per shot (a GPU process that dies takes only that shot), a fresh browser when it is gone.
async function shoot(scenario, phase, hero, tod, push) {
  if (push) return shootPush(scenario);
  if (!browser.isConnected()) browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    const q = new URLSearchParams({ scenario });
    if (phase !== null) q.set("phase", String(phase));
    if (args.lite) q.set("lite", "1");
    const label = tod ? `${scenario}@tod-${tod}` : `${scenario}${phase !== null ? `@${phase}` : ""}`;
    await page.goto(`${base}/scene-lab.html?${q}`, { timeout: 120_000 });
    await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60_000 });
    const before = await page.evaluate(() => window.__scene.info());
    if (hero) {
      // No fallback: a scenario that never reaches its moment is a failed shot, not a still of something else.
      const ok = await page.waitForFunction(() => window.__lab?.heroReady === true, null, { timeout: 45_000 }).then(() => true, () => false);
      if (!ok) return { label, failed: "hero moment not reached (no shot taken)" };
    } else await page.waitForTimeout(6500);
    const file = join(out, `${label.replace(/@tod-/, "_tod-").replace(/[@.]/g, "_")}.png`);
    // Round 25: the checks measure the frame the still shows. They used to run after the screenshot and an
    // in-page PNG decode (seconds under load), so a family still stepping off the airship was checked in
    // another pose than the one shot (round 24: arrival 0-70 % stacked on a frame where nobody overlapped).
    // Now the rules hold still (the page is closed after the shot) while both checks run in one task, and the
    // still is taken right after.
    // Frame times and programs before the checks (their passes are not play).
    const info = await page.evaluate(() => window.__scene.info());
    await page.evaluate(() => window.__lab?.pause?.(true)).catch(() => {});
    const checks = await page.evaluate(() => ({ cover: window.__scene.coverCheck?.() ?? null, stack: window.__scene.stackCheck?.() ?? null, spots: window.__scene.spotCheck?.() ?? null })).catch(() => ({ cover: null, stack: null, spots: null }));
    const png = await page.screenshot({ path: file, timeout: 120_000 });
    files.push([label, file]);
    const luma = await page.evaluate(async (b64) => {
      const c = new Image();
      c.src = `data:image/png;base64,${b64}`;
      await c.decode();
      const s = document.createElement("canvas");
      s.width = 192; s.height = 108;
      const x = s.getContext("2d");
      x.drawImage(c, 0, 0, 192, 108);
      const d = x.getImageData(0, 0, 192, 108).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return sum / (d.length / 4);
    }, png.toString("base64")).catch(() => null);
    // Round 21 cover check (ID-mask pass, fade dither off): the share of each framed fisher's body pixels
    // that scenery still covers. Anything over COVER_MAX_FRAC is a broken "nothing over a fisher" veto.
    const cover = checks.cover;
    const coverWorst = cover ? Math.round(cover.worst * 1000) / 1000 : null;
    const stack = checks.stack;
    const stackWorst = stack ? Math.round(stack.worst * 1000) / 1000 : null;
    metrics.shots.push({ label, renderer: info.renderer, programsAtStart: before.programs, programs: info.programs, calls: info.calls, triangles: info.triangles, p50: info.frameP50, p95: info.frameP95, meanLuma: luma === null ? null : Math.round(luma), cover: coverWorst, coverBoxes: cover?.boxes.map((b) => Math.round(b.frac * 1000) / 1000), stack: stackWorst, stackSeats: stack?.seats.map((b) => [b.seat, Math.round(b.frac * 1000) / 1000]), feet: checks.spots?.feet.map((f) => [f.seat, f.bank]), minGap: checks.spots && Number.isFinite(checks.spots.minGap) ? checks.spots.minGap : null });
    console.log(label, JSON.stringify(metrics.shots.at(-1)));
    if (coverWorst !== null && coverWorst > COVER_MAX_FRAC) return { label, failed: `scenery covers a fisher (${coverWorst} of the body > ${COVER_MAX_FRAC})` };
    if (stackWorst !== null && stackWorst > STACK_MAX_FRAC) return { label, failed: `a fisher covers another (${stackWorst} > ${STACK_MAX_FRAC})` };
    // Round 28 (the Mistmarsh dock foot): feet on dry land, and at a place's shore neighbours a body width apart on screen.
    if (SPOT_VIEWS.includes(scenario) && checks.spots) {
      if (checks.spots.wet > 0) return { label, failed: `a fisher stands in the water (${JSON.stringify(checks.spots.feet)})` };
      if (checks.spots.minGap < SPOT_MIN_GAP) return { label, failed: `neighbours ${checks.spots.minGap} body widths apart on screen < ${SPOT_MIN_GAP}` };
    }
    return { label };
  } finally {
    await page.close().catch(() => {});
  }
}

async function shootPush(scenario) {
  if (!browser.isConnected()) browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  const label = `${scenario}@push`;
  try {
    await page.goto(`${base}/scene-lab.html?scenario=${scenario}`, { timeout: 120_000 });
    await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60_000 });
    const landed = await page.waitForFunction(() => window.__lab?.lake()?.fishers.some((f) => f.mode === "catch" && f.catch !== null) === true, null, { timeout: 45_000, polling: 16 }).then(() => true, () => false);
    if (!landed) return { label, failed: "no catch landed (no push sampled)" };
    // One check per rendered frame (each check is its own task, so the scene keeps drawing in between).
    const samples = await page.evaluate(async (ms) => {
      const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        // Live: the fade's kept pixels count (as the TV draws them).
        let c = window.__scene.coverCheck?.(false, true);
        if (c && c.worst > 0.02) c = window.__scene.coverCheck?.(true, true) ?? c;
        if (c) out.push({ t: Math.round(performance.now() - t0), worst: Math.round(c.worst * 1000) / 1000, by: c.by ?? {} });
      }
      return out;
    }, PUSH_MS);
    const worst = samples.reduce((w, s) => (s.worst > w.worst ? s : w), { t: -1, worst: 0, by: {} });
    const file = join(out, `${scenario}_push.png`);
    await page.screenshot({ path: file, timeout: 120_000 });
    files.push([label, file]);
    const info = await page.evaluate(() => window.__scene.info());
    metrics.shots.push({ label, frames: samples.length, cover: worst.worst, coverAt: worst.t, coverBy: worst.by, coverOver: samples.filter((s) => s.worst > COVER_MAX_FRAC).length, p95: info.frameP95, programs: info.programs });
    console.log(label, JSON.stringify(metrics.shots.at(-1)));
    if (samples.length < 8) return { label, failed: `only ${samples.length} frames sampled in the push` };
    if (worst.worst > COVER_MAX_FRAC) return { label, failed: `scenery covers a fisher during the push (${worst.worst} at ${worst.t} ms > ${COVER_MAX_FRAC})` };
    return { label };
  } finally {
    await page.close().catch(() => {});
  }
}

for (const [scenario, phase, hero, tod, push] of shots) {
  const label = push ? `${scenario}@push` : tod ? `${scenario}@tod-${tod}` : `${scenario}${phase !== null ? `@${phase}` : ""}`;
  let res;
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    try {
      res = await shoot(scenario, phase, hero, tod, push);
    } catch (e) {
      console.error(`ERR ${label} (attempt ${attempt + 1}): ${String(e).split("\n")[0]}`);
      if (!browser.isConnected()) browser = await launch();
    }
  }
  if (!res || res.failed) {
    failures.push(label);
    console.error(`FAIL ${label}: ${res?.failed ?? "crashed twice"}`);
  }
  saveMetrics();
}

// Motion pair + a 20 s soak on four-reel (programs must not grow).
if (!args["push-only"] && (!only || only.includes("four-reel") || args.soak)) try {
  if (!browser.isConnected()) browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/scene-lab.html?scenario=four-reel${args.lite ? "&lite=1" : ""}`, { timeout: 120_000 });
  await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60_000 });
  await page.screenshot({ path: join(out, "motion_a.png") });
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(out, "motion_b.png") });
  await page.close();
  // Soaks (uncapped): four-reel (programs must not grow), tower (zeppelin boards then flies, streaming
  // new chunks at 20 m/s), boarding (the boat boards then sails).
  const perf = await launch(perfFlags);
  metrics.soaks = {};
  for (const sc of SOAKS) {
    const pp = await perf.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await pp.goto(`${base}/scene-lab.html?scenario=${sc}${args.lite ? "&lite=1" : ""}`, { timeout: 120_000 });
    await pp.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60_000 });
    await pp.waitForTimeout(1500);
    const p0 = await pp.evaluate(() => window.__scene.info().programs);
    await pp.waitForTimeout(args.quick ? 3000 : 20_000);
    const soak = await pp.evaluate(() => window.__scene.info());
    await pp.close();
    metrics.soaks[sc] = { programsBefore: p0, programsAfter: soak.programs, p50: soak.frameP50, p95: soak.frameP95, renderer: soak.renderer, frames: soak.frames };
    console.log("soak", sc, JSON.stringify(metrics.soaks[sc]));
  }
  metrics.soak = metrics.soaks["four-reel"];
  await perf.close();
} catch (e) {
  console.error(`ERR motion/soak: ${String(e).split("\n")[0]}`);
  failures.push("soak");
}
saveMetrics();

// Contact sheet: 3 columns of 640x360 tiles with labels.
const tiles = files.map(([label, f]) => ({ label, f }));
const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,640px);gap:4px;font:600 18px system-ui;color:#fff">${tiles
  .map(({ label, f }) => `<div style="position:relative"><img src="file://${process.cwd()}/${f}" style="width:640px;height:360px;display:block"><div style="position:absolute;left:6px;top:4px;background:#0009;padding:2px 8px;border-radius:6px">${label}</div></div>`)
  .join("")}</body></html>`;
const sheetHtml = join(out, "sheet.html");
writeFileSync(sheetHtml, html);
try {
  if (!browser.isConnected()) browser = await launch();
  const sp = await browser.newPage({ viewport: { width: 1928, height: Math.max(364, Math.ceil(tiles.length / 3) * 364) } });
  await sp.goto(`file://${process.cwd()}/${sheetHtml}`);
  await sp.waitForTimeout(500);
  await sp.screenshot({ path: join(out, "sheet.png"), fullPage: true });
  console.log(`sheet: ${join(out, "sheet.png")}`);
} catch (e) {
  console.error(`ERR sheet: ${String(e).split("\n")[0]} (stills and sheet.html are saved)`);
}
await browser.close().catch(() => {});
if (errors.length) console.log("errors:", errors.slice(0, 10));
if (failures.length) {
  console.error(`\nFAILED: ${failures.length} hero moment(s) not reached: ${failures.join(", ")}`);
  process.exit(1);
}

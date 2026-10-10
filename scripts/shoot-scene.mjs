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
  ["spread", null, true],
  ["split", null, true],
  ["night-woods", null, true],
  ["discovery", null, true],
  ["night-tarn", null, true],
  ["double-catch", null, true],
  ["miss", null, true],
  ["morning", null, false],
  ["morning", 0.97, false],
  ["four-reel", null, true],
  ["golden-swirl", null, true],
  ["night-catch", null, true],
  ["rod-upgrade", null, true],
  ["campfire", null, false],
  ["campfire-out", null, true],
  ["empty", 0.1, false],
  ["empty", 0.65, false],
];
const only = typeof args.only === "string" ? args.only.split(",") : null;
// --soak: only the uncapped soaks (A/B perf), no stills.
const shots = args.soak ? [] : SHOTS.filter(([s]) => !only || only.includes(s)).slice(0, args.quick ? 4 : undefined);

// Real GPU: full Chromium (not the headless shell, which renders on SwiftShader).
const flags = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
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
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const metrics = { round, shots: [] };
const failures = [];
const files = [];
for (const [scenario, phase, hero] of shots) {
  const q = new URLSearchParams({ scenario });
  if (phase !== null) q.set("phase", String(phase));
  if (args.lite) q.set("lite", "1");
  const label = `${scenario}${phase !== null ? `@${phase}` : ""}`;
  await page.goto(`${base}/scene-lab.html?${q}`, { timeout: 120_000 });
  await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60_000 });
  const before = await page.evaluate(() => window.__scene.info());
  if (hero) {
    // No fallback: a scenario that never reaches its moment is a failed shot, not a still of something else.
    const ok = await page.waitForFunction(() => window.__lab?.heroReady === true, null, { timeout: 45_000 }).then(() => true, () => false);
    if (!ok) {
      failures.push(label);
      console.error(`FAIL ${label}: hero moment not reached (no shot taken)`);
      continue;
    }
  } else await page.waitForTimeout(6500);
  const file = join(out, `${label.replace(/[@.]/g, "_")}.png`);
  await page.screenshot({ path: file, timeout: 120_000 });
  files.push([label, file]);
  const info = await page.evaluate(() => window.__scene.info());
  const png = (await import("node:fs")).readFileSync(file).toString("base64");
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
  }, png);
  metrics.shots.push({ label, renderer: info.renderer, programsAtStart: before.programs, programs: info.programs, calls: info.calls, triangles: info.triangles, p50: info.frameP50, p95: info.frameP95, meanLuma: Math.round(luma) });
  console.log(label, JSON.stringify(metrics.shots.at(-1)));
}

// Motion pair + a 20 s soak on four-reel (programs must not grow).
if (!only || only.includes("four-reel") || args.soak) {
  await page.goto(`${base}/scene-lab.html?scenario=four-reel${args.lite ? "&lite=1" : ""}`, { timeout: 120_000 });
  await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60_000 });
  await page.screenshot({ path: join(out, "motion_a.png") });
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(out, "motion_b.png") });
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
}
metrics.errors = errors;
metrics.failures = failures;
writeFileSync(join(out, "metrics.json"), JSON.stringify(metrics, null, 2));

// Contact sheet: 3 columns of 640x360 tiles with labels.
const tiles = files.map(([label, f]) => ({ label, f }));
const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,640px);gap:4px;font:600 18px system-ui;color:#fff">${tiles
  .map(({ label, f }) => `<div style="position:relative"><img src="file://${process.cwd()}/${f}" style="width:640px;height:360px;display:block"><div style="position:absolute;left:6px;top:4px;background:#0009;padding:2px 8px;border-radius:6px">${label}</div></div>`)
  .join("")}</body></html>`;
await page.close();
const sheetHtml = join(out, "sheet.html");
writeFileSync(sheetHtml, html);
const sp = await browser.newPage({ viewport: { width: 1928, height: Math.ceil(tiles.length / 3) * 364 } });
await sp.goto(`file://${process.cwd()}/${sheetHtml}`);
await sp.waitForTimeout(500);
await sp.screenshot({ path: join(out, "sheet.png"), fullPage: true });
await browser.close();
console.log(`sheet: ${join(out, "sheet.png")}`);
if (errors.length) console.log("errors:", errors.slice(0, 10));
if (failures.length) {
  console.error(`\nFAILED: ${failures.length} hero moment(s) not reached: ${failures.join(", ")}`);
  process.exit(1);
}

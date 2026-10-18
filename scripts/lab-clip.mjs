#!/usr/bin/env node
// Round 27: a short video of one lab scenario from its hero moment (the strip rig's screenshots are ~250 ms
// apart, too slow for a 0.5 s leap), plus frames pulled from it every --every ms (ffmpeg).
// Usage: node scripts/lab-clip.mjs --base http://127.0.0.1:8843 --scenario catch-leap --out dir [--ms 1500] [--every 60] [--crop w:h:x:y] [--from catch]
import { chromium } from "playwright";
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]] : acc), []));
const base = a.base ?? "http://127.0.0.1:8843";
const out = a.out ?? "clip";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-audio-output"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(`${base}/scene-lab.html?scenario=${a.scenario}`, { timeout: 120_000 });
await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 90_000 });
// --from catch (round 28): start at the first catch landing (the push-in) instead of the scenario's hero moment.
if (a.from === "catch") await page.waitForFunction(() => window.__lab?.lake()?.fishers.some((f) => f.mode === "catch" && f.catch !== null) === true, null, { timeout: 90_000, polling: 16 });
else await page.waitForFunction(() => window.__lab?.heroReady === true, null, { timeout: 90_000, polling: 16 });
const heroAt = (Date.now() - t0) / 1000;
await page.waitForTimeout(Number(a.ms ?? 1500));
const video = page.video();
await ctx.close();
await browser.close();
const raw = await video.path();
const mp4 = join(out, "clip.webm");
renameSync(raw, mp4);
const every = Number(a.every ?? 60);
const vf = [`fps=${(1000 / every).toFixed(3)}`, ...(a.crop ? [`crop=${a.crop}`] : [])].join(",");
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(Math.max(0, heroAt - 0.25)), "-i", mp4, "-t", String(Number(a.ms ?? 1500) / 1000), "-vf", vf, join(out, "f%02d.png")]);
console.log(`hero at ${heroAt.toFixed(2)} s; frames every ${every} ms -> ${out}`);

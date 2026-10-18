#!/usr/bin/env node
// Round 23: the TV's first seconds. Opens /?as=tv with a screen recording (screenshots stall while the scene
// compiles) and writes the video plus a frame strip at 0.5 s steps from navigation start.
// Usage: node scripts/tv-start.mjs --base http://127.0.0.1:8843 --out dir [--secs 8]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]] : acc), []));
const base = a.base ?? "http://127.0.0.1:8843";
const out = a.out ?? "tv-start";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-audio-output"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 960, height: 540 } } });
const page = await ctx.newPage();
const created = Date.now();
await page.goto(`${base}/?as=tv`, { waitUntil: "commit", timeout: 120_000 });
const navAt = (Date.now() - created) / 1000;
await page.waitForTimeout(Number(a.secs ?? 8) * 1000);
const video = page.video();
await ctx.close();
const path = video ? await video.path() : null;
await browser.close();
if (path) {
  const offset = navAt.toFixed(2);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", offset, "-i", path, "-vf", "fps=2,tile=8x2", "-frames:v", "1", join(out, "strip.png")]);
  console.log(`video ${path}, navigation committed ${offset} s in; strip.png = 0.5 s steps from there`);
}

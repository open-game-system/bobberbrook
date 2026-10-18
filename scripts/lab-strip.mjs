#!/usr/bin/env node
// A frame strip of one lab scenario's hero moment (round 23: the thrash on the TV).
// Usage: node scripts/lab-strip.mjs --base http://127.0.0.1:8843 --scenario reel-thrash --out dir [--n 8] [--every 150] [--crop x,y,w,h]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]] : acc), []));
const base = a.base ?? "http://127.0.0.1:8843";
const out = a.out ?? "strip";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-audio-output"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${base}/scene-lab.html?scenario=${a.scenario}`, { timeout: 120_000 });
await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 90_000 });
await page.waitForFunction(() => window.__lab?.heroReady === true, null, { timeout: 90_000 });
const n = Number(a.n ?? 8);
const clip = a.crop ? (([x, y, width, height]) => ({ x, y, width, height }))(String(a.crop).split(",").map(Number)) : undefined;
for (let i = 0; i < n; i++) {
  await page.screenshot({ path: join(out, `f${String(i).padStart(2, "0")}.png`), clip });
  await page.waitForTimeout(Number(a.every ?? 150));
}
await browser.close();
console.log(`${n} frames -> ${out}`);

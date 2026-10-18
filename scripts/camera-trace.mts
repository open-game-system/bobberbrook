/**
 * Round 23 judder probe: plays the recorded session's bot (game-rig.config.ts) against a dev server with
 * no video, logs the TV camera rig's per-frame inputs and pose (window.__scene.camLog) and writes them as
 * JSON (--cover: also the cover check on every catch-push frame). Usage: npx tsx scripts/camera-trace.mts --base http://127.0.0.1:8843 --out trace.json [--until "explore: trail to Mistmarsh"]
 */
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import config from "../game-rig.config.ts";

const argv = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};
const base = arg("base", "http://127.0.0.1:8843");
const out = arg("out", "camera-trace.json");
const until = arg("until", "");
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-audio-output"] });
const vp = { tv: { width: 1920, height: 1080 }, dad: { width: 393, height: 852 }, kid: { width: 1080, height: 810 } };
const pages: Record<string, Page> = {};
for (const [role, size] of Object.entries(vp)) pages[role] = await (await browser.newContext({ viewport: size })).newPage();
const marks: { label: string; t: number }[] = [];
const t0 = Date.now();
let started = false;
const tv = pages.tv!;
const startLog = async () => {
  if (started) return;
  for (let i = 0; i < 200; i++) {
    const ok = await tv.evaluate(() => typeof window.__scene?.camLog === "function").catch(() => false);
    if (ok) break;
    await tv.waitForTimeout(500);
  }
  await tv.evaluate(() => window.__scene?.camLog?.(true));
  if (argv.includes("--cover")) await tv.evaluate(() => window.__scene?.coverLog?.(true));
  started = true;
};
class Stop extends Error {}
const rig = {
  pages,
  baseUrl: base,
  mark: (label: string) => {
    marks.push({ label, t: (Date.now() - t0) / 1000 });
    console.log(label, ((Date.now() - t0) / 1000).toFixed(1));
    if (label === "everyone in") void startLog();
    if (until && label === until) throw new Stop();
  },
  wait: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  startAudio: async () => {},
};
try {
  if (!config.session) throw new Error("no session");
  await config.session(rig);
} catch (e) {
  if (!(e instanceof Stop)) console.error("session ended:", e);
}
const frames = await tv.evaluate(() => window.__scene?.camLog?.(false) ?? []);
// Round 28 (--cover): the cover check on every frame a catch push is on, with the worst offenders by object.
const cover = argv.includes("--cover") ? await tv.evaluate(() => window.__scene?.coverLog?.(false) ?? []) : [];
const tvStart = await tv.evaluate(() => performance.timeOrigin);
writeFileSync(out, JSON.stringify({ marks, frames, cover, tvStart, t0 }));
if (cover.length) {
  const bad = cover.filter((c) => c.worst > 0.02);
  console.log(`cover: ${cover.length} push frames, ${bad.length} over 0.02, worst ${Math.max(0, ...cover.map((c) => c.worst))}`);
}
console.log(`${frames.length} frames -> ${out}`);
await browser.close();

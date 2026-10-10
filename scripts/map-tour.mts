/**
 * Map tour: Dad walks from Moonwell along the trail to Mistmarsh, opening the full map (fog of war)
 * on the way; records the TV and Dad's phone side by side. Usage: tsx scripts/map-tour.mts OUT.mp4
 */
import { chromium, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";

const BASE = process.env.BB_URL ?? "http://127.0.0.1:8841";
const out = process.argv[2] ?? "recordings/progress/map-tour.mp4";
const raw = `${out}.raw`;
mkdirSync(raw, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required", "--disable-audio-output"] });

type V = { x: number; z: number };
type Bb = { lake: () => { fishers: { seat: number; pos: V }[] }; seat: number; nav: (a: V, b: V) => V };
const pos = (p: Page) =>
  p.evaluate(() => {
    const bb: Bb = Reflect.get(window, "__bb");
    return bb.lake().fishers.find((f) => f.seat === bb.seat)?.pos ?? { x: 0, z: 0 };
  });

async function walkTo(p: Page, target: V, maxMs = 20_000) {
  const box = await p.locator(".stick").boundingBox();
  if (!box) throw new Error("no stick");
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.6;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    const at = await pos(p);
    if (Math.hypot(target.x - at.x, target.z - at.z) < 1.5) break;
    const way = await p.evaluate(([a, b]) => {
      const bb: Bb = Reflect.get(window, "__bb");
      return bb.nav(a, b);
    }, [at, target] satisfies [V, V]);
    const dx = way.x - at.x, dz = way.z - at.z, d = Math.hypot(dx, dz) || 1;
    await p.mouse.move(cx + (dx / d) * r, cy + (dz / d) * r, { steps: 2 });
    await p.waitForTimeout(150);
  }
  await p.mouse.move(cx, cy);
  await p.mouse.up();
}

async function showMap(p: Page, ms: number) {
  await p.locator("button.minimap-btn").click({ timeout: 10_000 });
  await p.waitForTimeout(ms);
  await p.keyboard.press("Escape");
  const close = p.getByRole("button", { name: /close/i });
  if (await close.count()) await close.first().click({ timeout: 3000 }).catch(() => undefined);
  await p.waitForTimeout(500);
}

const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: `${raw}/tv`, size: { width: 1280, height: 720 } } });
const tv = await tvCtx.newPage();
await tv.goto(`${BASE}/?as=tv`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await tv.locator(".ticket-code").waitFor({ timeout: 90_000 });
const code = ((await tv.locator(".ticket-code").textContent()) ?? "").trim();

const phoneCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, hasTouch: false, recordVideo: { dir: `${raw}/phone`, size: { width: 393, height: 852 } } });
const dad = await phoneCtx.newPage();
await dad.goto(`${BASE}/join/${code}?rig=1`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await dad.getByRole("button", { name: /Type your name/ }).click({ timeout: 60_000 });
await dad.locator(".name-input").fill("Dad");
await dad.getByRole("button", { name: "Join" }).click();
await dad.locator("button.action").waitFor({ timeout: 30_000 });
await dad.waitForTimeout(3000);

await showMap(dad, 3500);
const trail: V[] = [{ x: 0, z: 18 }, { x: -10, z: 25 }, { x: -20, z: 19 }, { x: -24, z: 15 }, { x: -35, z: 21.5 }, { x: -45.5, z: 28.1 }, { x: -55, z: 33 }];
for (const [i, p] of trail.entries()) {
  await walkTo(dad, p);
  if (i === 3) await showMap(dad, 3500);
}
await dad.waitForTimeout(3000);
await showMap(dad, 5000);
await dad.waitForTimeout(1500);

await phoneCtx.close();
await tvCtx.close();
await browser.close();
const one = (dir: string) => `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", one(`${raw}/tv`), "-i", one(`${raw}/phone`), "-filter_complex",
  "[0:v]scale=-2:852[a];[a][1:v]hstack=inputs=2[v]", "-map", "[v]", "-c:v", "libx264", "-crf", "23", "-preset", "veryfast", out]);
console.log(out);

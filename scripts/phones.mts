/**
 * Phone strip: every controller state (walk + compass, at the water, waiting, bite, reel, catch) on
 * Juneau's iPad (1080×810) and Dad's phone (393×852), at CSS scale. Usage: tsx scripts/phones.mts OUTDIR
 */
import { chromium, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.env.BB_URL ?? "http://127.0.0.1:8841";
const out = process.argv[2] ?? "critic/phones";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });

type V = { x: number; z: number };
const lakeOf = (p: Page) =>
  p.evaluate(() => {
    const bb = Reflect.get(window, "__bb") as { lake: () => { fishers: { seat: number; pos: V; mode: string; biteAt: number }[]; swirls: { theta: number }[] }; seat: number; now: () => number };
    const lake = bb.lake();
    return { me: lake.fishers.find((f) => f.seat === bb.seat)!, swirls: lake.swirls, now: bb.now() };
  });

async function walkTo(p: Page, target: V) {
  const box = (await p.locator(".stick").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.6;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  for (let i = 0; i < 120; i++) {
    const { me } = await lakeOf(p);
    const dx = target.x - me.pos.x, dz = target.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d < 1) break;
    await p.mouse.move(cx + (dx / d) * r, cy + (dz / d) * r, { steps: 2 });
    await p.waitForTimeout(120);
  }
  await p.mouse.move(cx, cy);
  await p.mouse.up();
}

const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await tv.goto(`${BASE}/?as=tv`);
await tv.locator(".ticket-code").waitFor();
const code = (await tv.locator(".ticket-code").textContent())!.trim();
async function join(name: string, w: number, h: number) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true })).newPage();
  await p.goto(`${BASE}/join/${code}?rig=1`);
  await p.locator(".name-input").fill(name);
  await p.getByRole("button", { name: "Join" }).click();
  await p.locator("button.action").waitFor();
  return p;
}
const dad = await join("Dad", 393, 852);
const kid = await join("Juneau", 1080, 810);
const shots: string[] = [];
const snap = async (label: string) => {
  for (const [who, p] of [["ipad", kid], ["phone", dad]] as const) {
    const f = `${out}/${label}-${who}.png`;
    await p.screenshot({ path: f });
    shots.push(f);
  }
};
await kid.waitForTimeout(800);
await snap("1-walk");
const { swirls } = await lakeOf(kid);
const th = swirls[0]?.theta ?? Math.PI;
const shore = (theta: number, extra: number) => {
  const r = 17 + 2.4 * Math.sin(2 * theta + 0.6) + 1.4 * Math.sin(3 * theta - 1.1) + 0.8 * Math.sin(5 * theta + 2.0) + extra;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
};
await Promise.all([walkTo(kid, shore(th, 1.3)), walkTo(dad, shore(th + 0.35, 1.3))]);
await snap("2-at-water");
for (const p of [kid, dad]) { await p.locator("button.action").dispatchEvent("pointerdown"); await p.locator("button.action").dispatchEvent("pointerup"); }
await kid.waitForTimeout(1200);
await snap("3-waiting");
for (let i = 0; i < 100; i++) {
  const { me, now } = await lakeOf(kid);
  if (me.mode === "bite" || now >= me.biteAt) break;
  await kid.waitForTimeout(100);
}
await kid.waitForTimeout(150);
await snap("4-bite");
await kid.locator("button.action").dispatchEvent("pointerdown");
await kid.waitForTimeout(1500);
await snap("5-reel");
for (let i = 0; i < 200; i++) {
  if ((await lakeOf(kid)).me.mode !== "reel") break;
  await kid.waitForTimeout(100);
}
await kid.locator("button.action").dispatchEvent("pointerup");
await kid.waitForTimeout(700);
await snap("6-catch");
await browser.close();
// One strip per device.
for (const who of ["ipad", "phone"]) {
  const files = shots.filter((f) => f.endsWith(`-${who}.png`));
  execFileSync("python3", ["-c", `
import sys
from PIL import Image, ImageDraw
fs=sys.argv[1:]; ims=[Image.open(f).convert('RGB') for f in fs]
h=420 if '${who}'=='ipad' else 560
ims=[im.resize((int(im.width*h/im.height),h)) for im in ims]
S=Image.new('RGB',(sum(i.width for i in ims)+8*len(ims),h+28),(20,18,40)); x=0; d=ImageDraw.Draw(S)
for f,im in zip(fs,ims): S.paste(im,(x,28)); d.text((x+6,6),f.split('/')[-1].replace('.png',''),fill=(255,255,255)); x+=im.width+8
S.save('${out}/strip-${who}.png')`, ...files]);
}
console.log(`${out}/strip-ipad.png ${out}/strip-phone.png`);

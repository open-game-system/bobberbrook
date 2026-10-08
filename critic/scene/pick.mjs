// node critic/scene/pick.mjs scenario x,y [x,y...]  (screen fractions)
import { chromium } from "playwright";
const [scenario, ...pts] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://127.0.0.1:8842/scene-lab.html?scenario=${scenario}`);
await page.waitForFunction(() => window.__lab?.heroReady === true, null, { timeout: 90_000 });
for (const p of pts) {
  const [x, y] = p.split(",").map(Number);
  console.log(p, await page.evaluate(([x, y]) => window.__scene.pick(x, y), [x, y]));
}
if (process.env.JS) console.log(await page.evaluate(process.env.JS));
await browser.close();

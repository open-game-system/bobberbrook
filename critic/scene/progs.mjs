// node critic/scene/progs.mjs scenario waitMs : programs compiled after start
import { chromium } from "playwright";
const [scenario, wait] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://127.0.0.1:8842/scene-lab.html?scenario=${scenario}`);
await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 90_000 });
await page.waitForTimeout(800);
const a = await page.evaluate(() => window.__scene.debug().progs);
await page.waitForTimeout(Number(wait ?? 20000));
const b = await page.evaluate(() => window.__scene.debug().progs);
console.log(a.length, "->", b.length);
for (const p of b) if (!a.includes(p)) console.log("NEW", p.slice(0, 160), "...", p.length > 400 ? p.slice(p.length - 200) : "");
await browser.close();

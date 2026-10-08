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
for (const p of b) if (!a.includes(p)) {
  const pp = p.split(",");
  let best = null, bd = 1e9;
  for (const q of a) { const qq = q.split(","); if (qq[0].split("#")[1] !== pp[0].split("#")[1]) continue; let d = 0; for (let i = 0; i < Math.max(pp.length, qq.length); i++) if (pp[i] !== qq[i]) d++; if (d < bd) { bd = d; best = qq; } }
  const diffs = [];
  if (best) for (let i = 0; i < Math.max(pp.length, best.length); i++) if (pp[i] !== best[i]) diffs.push(`${i}:${best[i]}->${pp[i]}`);
  console.log(pp[0].slice(0, 30), diffs.join(" ").slice(0, 300));
}
await browser.close();

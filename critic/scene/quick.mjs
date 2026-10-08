// Quick look: node critic/scene/quick.mjs outDir scenario[@phase][~view] ... (real GPU, 1920x1080)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const [out, ...list] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || m.text().startsWith("[lab]")) errors.push(m.text()); });
for (const item of list) {
  const [sv, view] = item.split("~");
  const [scenario, phase] = sv.split("@");
  const q = new URLSearchParams({ scenario });
  if (phase) q.set("phase", phase);
  if (view) q.set("view", view);
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:8842/scene-lab.html?${q}`);
  try {
    await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 90_000 });
    const ready = Date.now() - t0;
    await page.waitForFunction(() => window.__lab?.heroReady === true, null, { timeout: 40_000 }).catch(() => errors.push(`${item}: no hero`));
    await page.waitForTimeout(Number(process.env.EXTRA ?? 0));
    await page.screenshot({ path: `${out}/${item.replace(/[@.~]/g, "_")}.png` });
    const info = await page.evaluate(() => ({ i: window.__scene.info(), d: window.__scene.debug() }));
    console.log(item, `ready ${ready}ms`, JSON.stringify({ p50: info.i.frameP50, p95: info.i.frameP95, prog: info.i.programs, calls: info.i.calls, tris: info.i.triangles, chunks: info.d.chunks, jobs: info.d.jobs, trees: info.d.trees, near: info.d.near?.slice(0, 4), cam: info.d.camera?.map((v) => Math.round(v)) }));
  } catch (e) { errors.push(`${item}: ${e}`); }
}
await browser.close();
if (errors.length) console.log("errors:", errors.slice(0, 12).join("\n"));

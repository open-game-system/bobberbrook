/**
 * Evidence rig config (~/src/skills/game-rig): screens for the contact sheet and the bot that plays a
 * recorded session (Dad on a phone, Juneau on an iPad, the TV). Run: ~/src/skills/game-rig/bin/game-rig.mjs record
 */
import type { Page } from "playwright";
import type { GameRigInput, RigContext } from "../skills/game-rig/src/config.ts";

const URL_BASE = process.env.BB_URL ?? "http://127.0.0.1:8841";

type V = { x: number; z: number };
type FisherLite = { seat: number; pos: V; mode: string; biteAt: number; biteUntil: number; reel: { progress: number } | null };
type LakeLite = { fishers: FisherLite[]; swirls: { pos: V; golden: boolean }[]; now: number; campfire: boolean };

async function lakeOf(page: Page): Promise<{ lake: LakeLite; seat: number; now: number }> {
  return page.evaluate(() => {
    const bb = Reflect.get(window, "__bb") as { lake: () => unknown; seat: number; now: () => number };
    return { lake: bb.lake() as never, seat: bb.seat, now: bb.now() };
  });
}

async function me(page: Page): Promise<{ f: FisherLite; lake: LakeLite; now: number }> {
  const { lake, seat, now } = await lakeOf(page);
  const f = lake.fishers.find((x) => x.seat === seat);
  if (!f) throw new Error("not seated");
  return { f, lake, now };
}

/** Drags the joystick toward a point on the lake until the fisher is close (or time runs out). */
async function walkTo(page: Page, target: V, near = 0.8, maxMs = 12_000): Promise<void> {
  const box = await page.locator(".stick").boundingBox();
  if (!box) throw new Error("no joystick");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = box.width * 0.3;
  const end = Date.now() + maxMs;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  while (Date.now() < end) {
    const { f } = await me(page);
    const dx = target.x - f.pos.x;
    const dz = target.z - f.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < near) break;
    await page.mouse.move(cx + (dx / d) * r * 2, cy + (dz / d) * r * 2, { steps: 2 });
    await page.waitForTimeout(150);
  }
  await page.mouse.move(cx, cy, { steps: 2 });
  await page.mouse.up();
}

async function press(page: Page): Promise<void> {
  await page.locator("button.action").dispatchEvent("pointerdown");
  await page.locator("button.action").dispatchEvent("pointerup");
}

/** Casts, waits for the bite, hooks, reels (letting go when the fish thrashes if `careful`), until the catch. */
async function fishOnce(rig: RigContext, page: Page, who: string, careful: boolean): Promise<void> {
  await press(page);
  rig.mark(`${who} casts`);
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const { f, now } = await me(page);
    if (f.mode === "bite" || (f.mode === "wait" && now >= f.biteAt)) {
      await page.waitForTimeout(250);
      await press(page);
      rig.mark(`${who} hooks`);
      break;
    }
    if (f.mode === "reel") break;
    await page.waitForTimeout(120);
  }
  const btn = page.locator("button.action");
  let holding = false;
  while (Date.now() < deadline + 20_000) {
    const { f } = await me(page);
    if (f.mode !== "reel") break;
    const thrash = await btn.evaluate((el) => el.classList.contains("thrash"));
    const want = !(careful && thrash);
    if (want !== holding) {
      await btn.dispatchEvent(want ? "pointerdown" : "pointerup");
      holding = want;
    }
    await page.waitForTimeout(100);
  }
  if (holding) await btn.dispatchEvent("pointerup");
  rig.mark(`${who} catch`);
  await page.waitForTimeout(3600);
}

async function hostAndJoin(rig: RigContext): Promise<{ tv: Page; dad: Page; kid: Page; code: string }> {
  const tv = rig.pages.tv ?? (await rig.open("tv"));
  await tv.goto(`${rig.baseUrl}/?as=tv&record=1`);
  await tv.locator(".ticket-code").waitFor({ timeout: 30_000 });
  const code = ((await tv.locator(".ticket-code").textContent()) ?? "").trim();
  const join = async (role: string, name: string) => {
    const page = rig.pages[role] ?? (await rig.open(role));
    await page.goto(`${rig.baseUrl}/join/${code}?rig=1`);
    await page.locator(".name-input").fill(name);
    await page.getByRole("button", { name: "Join" }).click();
    await page.locator("button.action").waitFor({ timeout: 20_000 });
    return page;
  };
  const dad = await join("dad", "Dad");
  const kid = await join("kid", "Juneau");
  return { tv, dad, kid, code };
}

const config: GameRigInput = {
  name: "Bobberbrook",
  baseUrl: URL_BASE,
  roles: {
    tv: { kind: "tv", label: "TV" },
    dad: { kind: "phone", label: "Dad's phone" },
    kid: { kind: "tablet", label: "Juneau's iPad (5)" },
  },
  chromeArgs: ["--use-angle=metal", "--ignore-gpu-blocklist"],
  maxTapsPerScreen: 6,
  holdSelector: "button.action.reel",
  screens: [
    { name: "tv-empty-lake", role: "tv", path: "/?as=tv", checks: ["overlay", "text", "safe-area"], settleMs: 4000 },
    { name: "phone-name", role: "dad", setup: async (rig) => { const { code } = await hostAndJoin(rig); await rig.page.goto(`${rig.baseUrl}/join/${code}`); }, focal: false },
    { name: "phone-controller", role: "dad", setup: async (rig) => void (await hostAndJoin(rig)), focal: false },
    { name: "ipad-controller", role: "kid", setup: async (rig) => void (await hostAndJoin(rig)), focal: false },
    { name: "tv-two-fishers", role: "tv", setup: async (rig) => void (await hostAndJoin(rig)), checks: ["overlay", "text", "safe-area"], settleMs: 3000 },
  ],
  session: async (rig) => {
    const { tv, dad, kid } = await hostAndJoin(rig);
    rig.mark("everyone in");
    await rig.wait(2500);
    // Juneau heads for the nearest swirl's shore, Dad for the end of the dock.
    const { lake } = await me(kid);
    const swirl = lake.swirls[0]?.pos ?? { x: -16, z: 0 };
    const k = Math.hypot(swirl.x, swirl.z);
    const shore = { x: (swirl.x / k) * (k + 5.6), z: (swirl.z / k) * (k + 5.6) };
    await Promise.all([walkTo(kid, shore, 1.2), walkTo(dad, { x: 0, z: 17 }, 0.6).then(() => walkTo(dad, { x: 0, z: 9 }, 0.6))]);
    rig.mark("at the water");
    for (let i = 0; i < 3; i++) {
      await Promise.all([fishOnce(rig, kid, "Juneau", i > 0), fishOnce(rig, dad, "Dad", true)]);
    }
    await dad.getByRole("button", { name: "Campfire" }).click();
    rig.mark("campfire");
    await rig.wait(7000);
    await dad.getByRole("button", { name: "Back to fishing" }).click();
    rig.mark("back to fishing");
    await rig.wait(2500);
    void tv;
  },
};
export default config;

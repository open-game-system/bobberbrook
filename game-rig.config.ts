/**
 * Evidence rig config (~/src/skills/game-rig): screens for the contact sheet and the bot that plays a
 * recorded session (Dad on a phone, Juneau on an iPad, the TV). Run: ~/src/skills/game-rig/bin/game-rig.mjs record
 */
import type { Page } from "playwright";
import type { GameRigInput, RigContext, SessionRig } from "../skills/game-rig/src/config.ts";

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
async function fishOnce(rig: SessionRig, page: Page, who: string, careful: boolean): Promise<void> {
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
  if ((await me(page)).f.mode === "catch") rig.mark(`${who} catch`);
  else rig.mark(`${who} no catch (cast failed or line still out)`);
  await page.waitForTimeout(3600);
}

type PageFor = { baseUrl: string; pageFor: (role: string) => Promise<Page> };
const fromSetup = (rig: RigContext): PageFor => ({ baseUrl: rig.baseUrl, pageFor: async (role) => (rig.role === role ? rig.page : rig.open(role)) });
const fromSession = (rig: SessionRig): PageFor => ({
  baseUrl: rig.baseUrl,
  pageFor: async (role) => {
    const p = rig.pages[role];
    if (!p) throw new Error(`no ${role} page`);
    return p;
  },
});

async function hostAndJoin(rig: PageFor): Promise<{ tv: Page; dad: Page; kid: Page; code: string }> {
  const { pageFor } = rig;
  const tv = await pageFor("tv");
  await tv.goto(`${rig.baseUrl}/?as=tv&record=1`);
  await tv.locator(".ticket-code").waitFor({ timeout: 60_000 });
  const code = ((await tv.locator(".ticket-code").textContent()) ?? "").trim();
  const join = async (role: string, name: string | null) => {
    const page = await pageFor(role);
    await page.goto(`${rig.baseUrl}/join/${code}?rig=1`);
    if (name === null) {
      // The kid taps the blue hat (no words on his iPad).
      await page.getByRole("button", { name: "blue hat" }).click({ timeout: 60_000, force: true });
    } else {
      await page.getByRole("button", { name: /Type your name/ }).click({ timeout: 60_000 });
      await page.locator(".name-input").fill(name);
      await page.getByRole("button", { name: "Join" }).click();
    }
    await page.locator("button.action").waitFor({ timeout: 20_000 });
    return page;
  };
  const dad = await join("dad", "Dad");
  const kid = await join("kid", null);
  // Dad names the kid from Fishers (the iPad joined with a hat, no typing).
  await dad.getByRole("button", { name: "Fishers" }).click({ timeout: 30_000 });
  await dad.locator(".rename-input").nth(1).fill("Juneau");
  await dad.locator(".rename-input").nth(1).press("Enter");
  await dad.getByRole("button", { name: "Close" }).click();
  return { tv, dad, kid, code };
}

// One viewport per screen: the shared Mac runs several games' rigs at once, and every extra page load
// under that load risks a 30 s goto timeout.
const TV = { width: 1920, height: 1080 };
const IPAD = { width: 1080, height: 810 };
const PHONE = { width: 393, height: 852 };
const PHONE_SE = { width: 375, height: 667 };

const config: GameRigInput = {
  name: "Bobberbrook",
  baseUrl: URL_BASE,
  roles: {
    tv: { kind: "tv", label: "TV" },
    dad: { kind: "phone", label: "Dad's phone" },
    kid: { kind: "tablet", label: "Juneau's iPad (5)" },
  },
  // The scene reports its focal rect as {x, y, w, h}.
  focal: "(() => { const r = window.__focalRect?.(); return r ? { x: r.x, y: r.y, width: r.w, height: r.h } : null; })()",
  chromeArgs: ["--use-angle=metal", "--ignore-gpu-blocklist"],
  maxTapsPerScreen: 6,
  holdSelector: "button.action.reel",
  screens: [
    { name: "tv-empty-lake", role: "tv", path: "/?as=tv", checks: ["overlay", "text", "safe-area"], settleMs: 4000, viewports: [TV] },
    { name: "kid-hat-picker", role: "kid", setup: async (rig) => { const tv = await rig.open("tv"); await tv.goto(`${rig.baseUrl}/?as=tv`); await tv.locator(".ticket-code").waitFor({ timeout: 60_000 }); const code = ((await tv.locator(".ticket-code").textContent()) ?? "").trim(); await rig.page.goto(`${rig.baseUrl}/join/${code}`); }, focal: false, viewports: [IPAD] },
    { name: "phone-controller", role: "dad", setup: async (rig) => void (await hostAndJoin(fromSetup(rig))), focal: false, viewports: [PHONE, PHONE_SE] },
    { name: "ipad-controller", role: "kid", setup: async (rig) => void (await hostAndJoin(fromSetup(rig))), focal: false, viewports: [IPAD] },
    { name: "tv-two-fishers", role: "tv", setup: async (rig) => void (await hostAndJoin(fromSetup(rig))), checks: ["overlay", "text", "safe-area"], settleMs: 3000, viewports: [TV] },
  ],
  session: async (rig) => {
    const { tv, dad, kid } = await hostAndJoin(fromSession(rig));
    rig.mark("everyone in");
    await rig.wait(2500);
    // Juneau heads for the nearest swirl's shore, Dad for the end of the dock.
    const { lake } = await me(kid);
    const swirl = lake.swirls[0]?.pos ?? { x: -16, z: 0 };
    const k = Math.hypot(swirl.x, swirl.z);
    const shore = { x: (swirl.x / k) * (k + 5.6), z: (swirl.z / k) * (k + 5.6) };
    await Promise.all([walkTo(kid, shore, 1.2), walkTo(dad, { x: 0, z: 17 }, 0.6).then(() => walkTo(dad, { x: 0, z: 9 }, 0.6))]);
    rig.mark("at the water");
    for (let i = 0; i < 2; i++) {
      await Promise.all([fishOnce(rig, kid, "Juneau", i > 0), fishOnce(rig, dad, "Dad", true)]);
    }
    // Exploring: the family walks the trail to Mistmarsh together and fishes there.
    rig.mark("explore: trail to Mistmarsh");
    // Off the dock first (straight across would walk into the lake), then round the south shore to the trailhead.
    const trail = [
      { x: 0, z: 18 },
      { x: -10, z: 25 },
      { x: -20, z: 19 },
      { x: -24, z: 15 },
      { x: -35, z: 21.5 },
      { x: -45.5, z: 28.1 },
    ];
    // Dad walks the trail; Juneau lets go of his stick and tags along by himself (auto-follow).
    for (const p of trail) await walkTo(dad, p, 1.8, 15_000);
    const marsh = (theta: number) => {
      const r = 13 + 2.2 * Math.sin(2 * theta + 1.3) + 1.6 * Math.sin(3 * theta + 0.4) + 1.0 * Math.sin(5 * theta - 0.7) + 1.2;
      return { x: -64 + Math.cos(theta) * r, z: 40 + Math.sin(theta) * r };
    };
    await walkTo(dad, marsh(-0.6), 1, 15_000);
    rig.mark("found Mistmarsh");
    // Wait for Juneau to arrive, then he steps up to the water beside Dad.
    for (let i = 0; i < 60; i++) {
      const { lake } = await me(dad);
      const [a, b] = lake.fishers;
      if (a && b && Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 6) break;
      await dad.waitForTimeout(500);
    }
    rig.mark("Juneau tagged along");
    await walkTo(kid, marsh(-0.25), 1, 15_000);
    for (let i = 0; i < 2; i++) {
      await Promise.all([fishOnce(rig, kid, "Juneau", true), fishOnce(rig, dad, "Dad", true)]);
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

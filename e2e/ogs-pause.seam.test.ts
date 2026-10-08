/**
 * Owner bug (2026-10-04): go into Bobberbrook from the OGS TV launcher, then Home, and the game's
 * music keeps playing. The launcher keeps the parked game's iframe loaded and posts `ogs:suspend`
 * (Home / another game) and `ogs:resume` (Continue): the TV page must go silent and come back.
 * Real TV page (streamed, so sound starts by itself) in an iframe of a tiny launcher page, system Chrome.
 */
import { chromium, type Frame } from "playwright";
import { afterAll, describe, expect, it } from "vitest";

const BASE = process.env.BB_URL ?? "http://localhost:8841";
const browserP = chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
afterAll(async () => (await browserP).close());

async function tvUrl() {
  const res = await fetch(`${BASE}/host`, { redirect: "manual" });
  const hostUrl = new URL(res.headers.get("location") ?? "", BASE);
  const code = hostUrl.pathname.split("/")[2];
  return `${BASE}/tv/${code}?t=${hostUrl.searchParams.get("tv")}&stream=1`;
}

/** The state of every AudioContext the framed page made (recorded by the init script). */
function ctxStates(frame: Frame) {
  return frame.evaluate(() => {
    const list: unknown = Reflect.get(window, "__ctxs");
    return Array.isArray(list) ? list.map((c: AudioContext) => c.state) : [];
  });
}

async function until(check: () => Promise<boolean>, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out");
}

describe("the OGS launcher parks the game", () => {
  it("ogs:suspend silences the TV's sound; ogs:resume brings it back", async () => {
    const browser = await browserP;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    // Keep a handle on every AudioContext the game creates.
    await ctx.addInitScript(() => {
      const Base = window.AudioContext;
      const made: AudioContext[] = [];
      Reflect.set(window, "__ctxs", made);
      window.AudioContext = class extends Base {
        constructor(opts?: AudioContextOptions) {
          super(opts);
          made.push(this);
        }
      };
    });
    const page = await ctx.newPage();
    await page.setContent(`<iframe id="game" allow="autoplay" style="width:1280px;height:720px;border:0" src="${await tvUrl()}"></iframe>`);
    const frame = await (await page.waitForSelector("#game")).contentFrame();
    if (!frame) throw new Error("no game frame");

    await until(async () => (await ctxStates(frame)).includes("running"));

    const post = (type: string) => page.evaluate((t) => document.querySelector("iframe")?.contentWindow?.postMessage({ type: t }, "*"), type);
    await post("ogs:suspend");
    await until(async () => (await ctxStates(frame)).every((s) => s === "suspended"));
    // Still silent a moment later (the music scheduler must not wake it).
    await new Promise((r) => setTimeout(r, 500));
    expect(await ctxStates(frame)).toEqual(["suspended"]);

    await post("ogs:resume");
    await until(async () => (await ctxStates(frame)).every((s) => s === "running"));
    expect(await ctxStates(frame)).toEqual(["running"]);
    await ctx.close();
  }, 30_000);
});

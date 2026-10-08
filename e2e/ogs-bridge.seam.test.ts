/**
 * Seam test for the OGS app integration: Bobberbrook's host page inside a (simulated) OGS WebView.
 * The fake ReactNativeWebView answers BRIDGE_READY with the cast store's STATE_INIT, like the native app.
 *
 * The profile tests sign OGS game tokens with a local key set served on OGS_JWKS_PORT (8831): run the
 * server with `--var OGS_JWKS_URL:http://localhost:8831/.well-known/jwks.json`.
 */
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { BootSchema } from "../src/room.schemas";
import { gameClaims } from "../src/test/ogsTestKeys";
import { ogsSeamKey } from "./ogs-jwks";

const BASE = process.env.BB_URL ?? "http://localhost:8841";
const browserP = chromium.launch({ channel: "chrome" });
afterAll(async () => (await browserP).close());

const NATIVE_CAST_STATE = {
  isAvailable: true,
  devices: [{ id: "tv-1", name: "Living Room TV", type: "chromecast" }],
  session: { status: "disconnected", deviceId: null, deviceName: null, sessionId: null, streamSessionId: null },
  error: null,
  viewUrl: null,
};

/** The fake WebView; `extra` are more STATE_INIT stores (key → state) the app answers with. */
const fakeWebView = (extra: Record<string, unknown> = {}) => `
  window.__ogsSent = [];
  const stores = Object.assign({ cast: ${JSON.stringify(NATIVE_CAST_STATE)} }, ${JSON.stringify(extra)});
  window.ReactNativeWebView = {
    postMessage(raw) {
      const msg = JSON.parse(raw);
      window.__ogsSent.push(msg);
      if (msg.type === "BRIDGE_READY") {
        setTimeout(() => {
          for (const [storeKey, data] of Object.entries(stores))
            window.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "STATE_INIT", storeKey, data }) }));
        }, 50);
      }
    },
  };
`;

const FAKE_WEBVIEW = `
  window.__ogsSent = [];
  window.ReactNativeWebView = {
    postMessage(raw) {
      const msg = JSON.parse(raw);
      window.__ogsSent.push(msg);
      if (msg.type === "BRIDGE_READY") {
        setTimeout(() => window.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({ type: "STATE_INIT", storeKey: "cast", data: ${JSON.stringify(NATIVE_CAST_STATE)} }),
        })), 50);
      }
    },
  };
`;

/** The host page starts with the name gate ("Who's fishing here?"); the controller shows after it. */
async function joinAsHost(page: import("playwright").Page) {
  await page.getByLabel("name").fill("Dad");
  await page.getByRole("button", { name: "Join" }).click();
  await page.locator("button.action").waitFor({ timeout: 15_000 });
}

describe("Bobberbrook inside the OGS app", () => {
  it("declares the streamed TV page and shows no cast UI, no QR and no room code (the OGS app casts)", async () => {
    const browser = await browserP;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAKE_WEBVIEW);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/host`);
    await joinAsHost(page);
    const events = async () =>
      (await page.evaluate("window.__ogsSent")) as { type: string; storeKey?: string; event?: { type: string; url?: string } }[];
    const viewUrl = async () => (await events()).find((m) => m.event?.type === "SET_VIEW_URL")?.event?.url ?? "";
    await expect.poll(viewUrl, { timeout: 10_000 }).not.toBe("");
    const code = new URL(page.url()).pathname.split("/")[2];
    expect(await viewUrl()).toMatch(new RegExp(`/tv/${code}\\?t=[0-9a-f-]{36}&stream=1$`));
    expect(await page.locator(".host-qr").count()).toBe(0);
    expect(await page.getByText(code ?? "????").count()).toBe(0);
    expect(await page.getByText(/TV screen/i).count()).toBe(0);
  }, 30_000);

  it("offers the QR, the code and the TV page link in a plain browser", async () => {
    const browser = await browserP;
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(`${BASE}/host`);
    await joinAsHost(page);
    await expect(page.getByRole("link", { name: "the TV screen" }).getAttribute("href")).resolves.toMatch(/\/tv\/[A-Z]{4}\?t=/);
    expect(await page.locator(".host-qr").count()).toBe(1);
  }, 30_000);
});

// The key set is served for the whole run by e2e/ogs-jwks.global-setup.ts.
const keyP = ogsSeamKey();

const DAD = { id: "p_dad", handle: "dad", name: "Dad" };
type Sent = { type: string; storeKey?: string; event?: { type: string; report?: { instanceId: string; title: string; status: string; resumeUrl?: string } } };

/** The host page in the OGS app as `shown` (the profile store) holding a token signed for `claims`. */
async function hostAs(shown: { id: string; handle: string; name: string }, claims: unknown) {
  const token = await (await keyP).sign(claims);
  const profile = { ...shown, avatar: `https://tv.opengame.org/art/story-nook/char-${shown.handle}.webp`, token };
  const ctx = await (await browserP).newContext({ viewport: { width: 820, height: 1180 } });
  await ctx.addInitScript(fakeWebView({ ogs: { reported: [] }, profile: { status: "ready", profile } }));
  const page = await ctx.newPage();
  // The name form must never appear: watch for it from the first paint.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.body?.textContent?.includes("Who's fishing here?")) Object.assign(window, { __sawNameForm: true });
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto(`${BASE}/host`);
  await page.locator("button.action").waitFor({ timeout: 15_000 });
  return page;
}

/** The seat names, read the way the TV gets them (the TV page's boot snapshot). */
async function seatNames(page: import("playwright").Page) {
  const url = new URL(page.url());
  const code = url.pathname.split("/")[2];
  const html = await (await fetch(`${BASE}/tv/${code}?t=${url.searchParams.get("tv")}`)).text();
  const boot = BootSchema.parse(JSON.parse(html.match(/<script id="boot" type="application\/json">(.*?)<\/script>/)?.[1] ?? "{}"));
  return boot.snapshot.public.lake.fishers.map((f) => f.name);
}

describe("Bobberbrook knows who is playing (OGS profile)", () => {
  it("joins as the OGS player with no name form, and reports the sitting label", async () => {
    const page = await hostAs(DAD, gameClaims("bobberbrook", DAD));
    expect(await page.evaluate("window.__sawNameForm ?? false")).toBe(false);
    expect(await page.getByRole("textbox", { name: "name" }).count()).toBe(0);
    expect(await seatNames(page)).toEqual(["Dad"]);

    const code = new URL(page.url()).pathname.split("/")[2];
    const reports = async () =>
      ((await page.evaluate("window.__ogsSent")) as Sent[]).filter((m) => m.type === "EVENT" && m.storeKey === "ogs" && m.event?.type === "INSTANCE_REPORT");
    await expect.poll(async () => (await reports()).length, { timeout: 10_000 }).toBeGreaterThan(0);
    const report = (await reports()).at(-1)?.event?.report;
    expect(report).toMatchObject({ instanceId: `bobberbrook:${code}`, title: `Room ${code}`, status: "active" });
    expect(report?.resumeUrl).toMatch(new RegExp(`/join/${code}\\?t=`));
  }, 30_000);

  it("names the seat from the verified token, not from what the page sent", async () => {
    const page = await hostAs({ id: "p_dad", handle: "dad", name: "Mallory" }, gameClaims("bobberbrook", DAD));
    await expect.poll(async () => (await seatNames(page))[0], { timeout: 10_000 }).toBe("Dad");
  }, 30_000);

  it("a token for another game (story-nook) does not name the seat: the page's name stands, like a guest's", async () => {
    const page = await hostAs({ id: "p_dad", handle: "dad", name: "Guest" }, gameClaims("story-nook", { ...DAD, name: "Dad" }));
    await expect.poll(async () => (await seatNames(page))[0], { timeout: 10_000 }).toBe("Guest");
  }, 30_000);
});

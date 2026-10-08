/**
 * The TV page framed by the OGS launcher (spec §2): on ogs:start it reports its room (ogs:room, so the
 * couch's phones follow into it) and the sitting (ogs:instance), and shows no room code or QR. In a
 * plain browser the same page shows the join ticket.
 */
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";

const BASE = process.env.BB_URL ?? "http://127.0.0.1:8841";
const browserP = chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required", "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests"] });
afterAll(async () => (await browserP).close());

async function tvUrl() {
  const res = await fetch(`${BASE}/host`, { redirect: "manual" });
  const hostUrl = new URL(res.headers.get("location") ?? "", BASE);
  const code = hostUrl.pathname.split("/")[2] ?? "";
  return { code, url: `${BASE}/tv/${code}?t=${hostUrl.searchParams.get("tv")}&stream=1` };
}

type Msg = { type: string; room?: string; report?: { instanceId: string; title: string } };

describe("the TV page on the OGS TV", () => {
  it("answers ogs:start with its room and sitting, and never shows a room code", async () => {
    const browser = await browserP;
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const { code, url } = await tvUrl();
    // A launcher page with a real origin (not about:blank; local, so Private Network Access allows framing localhost).
    await page.route("http://localhost:8841/__launcher", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<script>window.__got=[];addEventListener("message",(e)=>window.__got.push(e.data));</script>
          <iframe id="game" allow="autoplay" style="width:1280px;height:720px;border:0" src="${url}"></iframe>`,
      }),
    );
    await page.goto("http://localhost:8841/__launcher");
    const frame = await (await page.waitForSelector("#game")).contentFrame();
    if (!frame) throw new Error("no frame");
    const got = () => page.evaluate(() => Reflect.get(window, "__got") as Msg[]);
    await expect.poll(async () => (await got()).some((m) => m.type === "ogs:ready"), { timeout: 15_000 }).toBe(true);
    await page.evaluate(() =>
      document.querySelector("iframe")?.contentWindow?.postMessage(
        { type: "ogs:start", instanceId: "inst-1", mode: "new", roster: [], token: "", players: [{ id: "p1", handle: "dad", name: "Dad", avatar: "https://tv.opengame.org/art/dad.webp" }] },
        "*",
      ),
    );
    await expect.poll(async () => (await got()).find((m) => m.type === "ogs:room")?.room, { timeout: 15_000 }).toBe(code);
    await expect.poll(async () => (await got()).find((m) => m.type === "ogs:instance")?.report?.instanceId, { timeout: 15_000 }).toBe("inst-1");
    expect(await frame.locator(".ticket").count()).toBe(0);
    expect(await frame.getByText(code).count()).toBe(0);
  }, 40_000);

  it("shows the join ticket in a plain browser", async () => {
    const browser = await browserP;
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const { code, url } = await tvUrl();
    await page.goto(url.replace("&stream=1", ""));
    await expect.poll(() => page.locator(".ticket-code").textContent(), { timeout: 15_000 }).toBe(code);
  }, 30_000);
});

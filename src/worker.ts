import type { Caller } from "actor-kit";
import { joinCookie, rememberedToken } from "./joinToken";
import { ogsRoomJoinPath } from "./ogsRoom";
import { createAccessToken } from "actor-kit/server";
import { actorKitRouter, type WorkerEnv } from "./room.server";
import type { Boot } from "./room.types";

export { Room } from "./room.server";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
const ROOM_CODE = /^[A-Z]{4}$/;
const TOKEN = /^[0-9a-f-]{36}$/;

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** JSON safe to inline inside a <script> tag. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Serves /tv/:roomId and /join/:roomCode. The `t` query param is the caller's
 * rejoin token: it becomes the actor-kit caller id, so a refreshed page keeps its role.
 */
async function servePage(req: Request, env: WorkerEnv, page: "tv" | "join", roomCode: string): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token || !TOKEN.test(token)) {
    // A phone coming back to the join link gets its own seat back (one seat per browser per room).
    const again = page === "join" ? rememberedToken(req.headers.get("Cookie"), roomCode) : null;
    url.searchParams.set("t", again ?? crypto.randomUUID());
    return Response.redirect(url.toString(), 302);
  }

  const caller: Caller = { id: token, type: "client" };
  const stub = env.ROOM.get(env.ROOM.idFromName(roomCode));
  if (page === "tv") {
    await stub.spawn({ actorType: "room", actorId: roomCode, caller, input: {} });
  }

  let payload: Awaited<ReturnType<typeof stub.getSnapshot>>;
  try {
    payload = await stub.getSnapshot(caller);
  } catch {
    return new Response("No lake with that code. Scan the code on the TV.", { status: 404 });
  }

  const accessToken = await createAccessToken({
    signingKey: env.ACTOR_KIT_SECRET,
    actorId: roomCode,
    actorType: "room",
    callerId: caller.id,
    callerType: caller.type,
  });

  const boot: Boot = { host: url.host, roomCode, accessToken, checksum: payload.checksum, snapshot: payload.snapshot };
  const html = await (await env.ASSETS.fetch(new URL(`/${page}`, url))).text();
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  if (page === "join") headers.append("Set-Cookie", joinCookie(roomCode, token));
  return new Response(html.replace("<!--BOOT-->", `<script id="boot" type="application/json">${inlineJson(boot)}</script>`), { headers });
}

/**
 * /host — start a game from a phone (e.g. inside the OGS app) whose TV will be cast.
 * Creates the room with its own TV caller, then sends the phone in as the first fisher. The `tv` param lets
 * the host page tell the host app which TV page to cast.
 */
async function hostRoom(req: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(req.url);
  const roomCode = newRoomCode();
  const tvToken = crypto.randomUUID();
  const stub = env.ROOM.get(env.ROOM.idFromName(roomCode));
  await stub.spawn({ actorType: "room", actorId: roomCode, caller: { id: tvToken, type: "client" }, input: {} });
  const join = new URL(`/join/${roomCode}`, url);
  join.searchParams.set("t", crypto.randomUUID());
  join.searchParams.set("tv", tvToken);
  return Response.redirect(join.toString(), 302);
}

/** Debug: a WebSocket echo, so a TV (e.g. in the cloud stream server) can check WebSockets work. */
function wsProbe(req: Request): Response {
  if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.addEventListener("message", (e) => server.send(`echo:${String(e.data)}`));
  // ?push=1: also send unprompted messages, like a game server pushing state.
  if (new URL(req.url).searchParams.has("push")) {
    let n = 0;
    const timer = setInterval(() => {
      try {
        server.send(`tick:${++n}`);
      } catch {
        clearInterval(timer);
      }
      if (n >= 30) clearInterval(timer);
    }, 2000);
    server.addEventListener("close", () => clearInterval(timer));
  }
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const [, head, rawCode] = url.pathname.split("/");
    const roomCode = rawCode?.toUpperCase() ?? "";

    // OGS names the couch's room (ogsRoom): this device joins it rather than making a new one.
    const couchRoom = url.pathname === "/" || url.pathname === "/host" ? ogsRoomJoinPath(url) : null;
    if (couchRoom) return Response.redirect(new URL(couchRoom, url).toString(), 302);
    if (url.pathname === "/") return Response.redirect(new URL(`/tv/${newRoomCode()}${url.search}`, url).toString(), 302);
    if (head === "api") return actorKitRouter(req, env, ctx);
    if (url.pathname === "/host") return hostRoom(req, env);
    if (url.pathname === "/ws-probe") return wsProbe(req);
    if ((head === "tv" || head === "join") && ROOM_CODE.test(roomCode)) return servePage(req, env, head, roomCode);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<WorkerEnv>;

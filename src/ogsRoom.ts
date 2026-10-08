const ROOM_CODE = /^[A-Z]{4}$/;

/**
 * OGS opens the start page with `ogsRoom=<room>` when the couch's sitting names a room (the TV page
 * reported it with ogs:room): this device joins that room (the second one in takes the Fixer's seat)
 * instead of making its own. Null: no room named, or not one of Bobberbrook's codes.
 */
export function ogsRoomJoinPath(url: URL): string | null {
  const room = ogsRoomOf(url);
  return room ? `/join/${room}` : null;
}

/**
 * The room OGS named (spec §7, the query parameter `ogsRoom`), if it is a Bobberbrook room code.
 * Parsed here rather than with profile-kit's `ogsRoomFromUrl`: its entry brings the browser's app bridge
 * into the Worker.
 */
function ogsRoomOf(url: URL): string | null {
  const room = url.searchParams.get("ogsRoom")?.toUpperCase() ?? "";
  return ROOM_CODE.test(room) ? room : null;
}

/** Inside the OGS app the TV page hosts from /host instead, keeping any room OGS named. */
export function hostPath(href: string): string {
  const room = ogsRoomOf(new URL(href));
  return room ? `/host?ogsRoom=${room}` : "/host";
}

/**
 * One seat per browser per room. A phone that comes back to /join/CODE (closed the tab, scanned again)
 * would otherwise get a fresh token and take a second seat; the join page remembers its token in a
 * cookie scoped to that room's join path, and the worker sends it back to the same seat.
 */
const TOKEN = /^[0-9a-f-]{36}$/;
const name = (roomCode: string) => `bb_join_${roomCode}`;

export function joinCookie(roomCode: string, token: string): string {
  return `${name(roomCode)}=${token}; Path=/join/${roomCode}; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`;
}

export function rememberedToken(cookieHeader: string | null, roomCode: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name(roomCode) && v && TOKEN.test(v)) return v;
  }
  return null;
}

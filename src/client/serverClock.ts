/**
 * The room's clock as seen from this screen. Each lake snapshot carries the room's `now`; the offset to
 * this device's clock is taken from the freshest snapshot (smallest offset wins over a short window,
 * since a late-arriving snapshot only ever makes the room look behind).
 */
export function createServerClock(local: () => number = () => Date.now()) {
  let offset = 0;
  let seen = false;
  return {
    observe(serverNow: number): void {
      const o = serverNow - local();
      // Snapshots only arrive late, never early: the largest offset is the closest to the truth.
      offset = seen ? Math.max(offset - 2, o) : o;
      seen = true;
    },
    now(): number {
      return local() + offset;
    },
  };
}

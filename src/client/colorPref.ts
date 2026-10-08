import { SEAT_COLORS, type SeatColor } from "../game/lake";
import type { KeyValue } from "./progressStore";

/** This device's fisher colour (a kid picks the blue hat once; it stays blue on every visit). */
const KEY = "bobberbrook:color";

export function readColor(store: KeyValue | null): SeatColor | null {
  try {
    const v = store?.getItem(KEY) ?? null;
    return SEAT_COLORS.find((c) => c === v) ?? null;
  } catch {
    return null;
  }
}

export function writeColor(store: KeyValue | null, color: SeatColor): void {
  try {
    store?.setItem(KEY, color);
  } catch {
    /* private mode */
  }
}

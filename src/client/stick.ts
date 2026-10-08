/**
 * Joystick maths: the knob's offset becomes a quantized stick (16 directions, half or full speed), so
 * the room only hears about real changes, not every finger wobble.
 */
export type Stick = { x: number; y: number };
export const DEAD_ZONE = 0.22;
const DIRECTIONS = 16;

/** dx right, dy down (screen), radius in the same units; returns x right, y up. */
export function quantizeStick(dx: number, dy: number, radius: number): Stick {
  const len = Math.hypot(dx, dy) / radius;
  if (len < DEAD_ZONE) return { x: 0, y: 0 };
  const mag = len < 0.62 ? 0.5 : 1;
  const step = (2 * Math.PI) / DIRECTIONS;
  const angle = Math.round(Math.atan2(-dy, dx) / step) * step;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { x: round(Math.cos(angle) * mag) + 0, y: round(Math.sin(angle) * mag) + 0 };
}

export function sameStick(a: Stick, b: Stick): boolean {
  return a.x === b.x && a.y === b.y;
}

import type { Lake } from "../../game/lake";

export type SceneQuality = "full" | "lite";

export interface LakeScene {
  /** New lake state from the room. `receivedAt` = performance.now() when it arrived. Server time ≈ lake.now + (performance.now() - receivedAt). */
  update(lake: Lake, receivedAt: number): void;
  /** Screen rectangle (CSS px) of the action the HUD must not cover. */
  focalRect(): { x: number; y: number; w: number; h: number };
  resize(): void;
  dispose(): void;
}

export const SEAT_HEX: Record<string, number> = {
  green: 0x4fc24a,
  yellow: 0xffc22e,
  blue: 0x2f86ff,
  pink: 0xff6fb4,
};

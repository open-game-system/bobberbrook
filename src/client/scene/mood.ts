import { Color } from "three";
import { AREAS, type AreaId } from "../../game/world";
import { AREA_INDEX, LOOKS, areaWeights } from "./valley";
import type { TodState } from "./tod";

/**
 * Each place's light and air on top of the time of day: as the camera moves between places, the fog,
 * key and fill light, glow and grade blend smoothly toward the place it is over.
 */
export class Mood {
  private readonly want = new Float32Array(AREAS.length);
  readonly w = new Float32Array(AREAS.length);
  private first = true;
  private readonly c = new Color();

  follow(x: number, z: number, dt: number): void {
    areaWeights(x, z, this.want);
    const k = this.first ? 1 : Math.min(1, dt * 0.9);
    this.first = false;
    for (let i = 0; i < this.w.length; i++) this.w[i]! += (this.want[i]! - this.w[i]!) * k;
  }

  /** Extra glow (mushrooms, lilies) a place keeps whatever the time of day. */
  glowOf(id: AreaId): number {
    return LOOKS[id].glowAdd;
  }

  apply(tod: TodState): void {
    let fogK = 0;
    let fogScale = 0;
    let sunK = 0;
    let hemiK = 0;
    let glow = 0;
    let mist = 0;
    let exp = 0;
    const fog = this.c.setRGB(0, 0, 0);
    let fogW = 0;
    for (const a of AREAS) {
      const w = this.w[AREA_INDEX[a.id]]!;
      if (w <= 0) continue;
      const L = LOOKS[a.id];
      fogScale += L.fogScale * w;
      sunK += L.sunK * w;
      hemiK += L.hemiK * w;
      glow += L.glowAdd * w;
      mist += L.mistAdd * w;
      exp += L.exposureK * w;
      if (L.fogK > 0) {
        fogK += L.fogK * w;
        fog.r += L.fog.r * w; fog.g += L.fog.g * w; fog.b += L.fog.b * w;
        fogW += w;
      }
      if (a.id !== "moonwell") {
        tod.hemiSky.lerp(this.tint(tod.hemiSky, L.hemiSky), w * 0.5);
        tod.grade.multiply(this.c2.setRGB(1, 1, 1).lerp(L.grade, w));
      }
    }
    if (fogW > 0) {
      fog.multiplyScalar(1 / fogW);
      // Keep the time of day's brightness: tint the fog by the place's hue at the current fog luminance.
      const lum = tod.fog.r * 0.3 + tod.fog.g * 0.59 + tod.fog.b * 0.11;
      const flum = fog.r * 0.3 + fog.g * 0.59 + fog.b * 0.11;
      fog.multiplyScalar(lum / Math.max(0.02, flum));
      tod.fog.lerp(fog, Math.min(1, fogK));
    }
    tod.fogNear *= fogScale;
    tod.fogFar *= 0.5 + 0.5 * fogScale;
    tod.sunI *= sunK;
    tod.hemiI *= hemiK;
    tod.glow = Math.min(1, tod.glow + glow);
    tod.mist = Math.min(1, tod.mist + mist);
    tod.exposure *= exp;
  }

  private readonly c2 = new Color();
  private readonly c3 = new Color();
  private tint(base: Color, hue: Color): Color {
    const lum = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
    const hl = hue.r * 0.3 + hue.g * 0.59 + hue.b * 0.11;
    return this.c3.copy(hue).multiplyScalar(lum / Math.max(0.02, hl));
  }

  debug(): number[] {
    return Array.from(this.w);
  }
}

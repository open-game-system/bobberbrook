import { lakeRadius } from "../../game/world";
import { CAMPFIRE } from "../../game/world";
import type { Particles } from "./particles";
import type { Water } from "./water";
import { FALLS, heightAt } from "./terrain";
import type { TodState } from "./tod";

/** Event effects on top of the particle pools and the water's ripple rings. Stateless helpers + ambient emitters. */
export class Fx {
  private fireflyAcc = 0;
  private mistAcc = 0;
  private emberAcc = 0;
  private mistGroundAcc = 0;
  private seed = 1;

  constructor(
    private readonly water: Particles,
    private readonly glow: Particles,
    private readonly surface: Water,
    private readonly lite: boolean,
  ) {}

  private r(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Bobber plop: a few droplets and a ring. */
  plop(x: number, z: number, t: number): void {
    this.surface.ripple(x, z, t, 0.6);
    for (let i = 0; i < 10; i++) {
      const a = this.r() * Math.PI * 2;
      const s = 0.6 + this.r() * 0.8;
      this.water.emit({ x, y: 0.05, z, vx: Math.cos(a) * s, vy: 1.8 + this.r() * 1.4, vz: Math.sin(a) * s, life: 0.7, size: 0.14, r: 0.95, g: 1, b: 1, gravity: 9, alpha: 0.9 });
    }
  }

  nibble(x: number, z: number, t: number): void {
    this.surface.ripple(x, z, t, 0.35);
    for (let i = 0; i < 4; i++) {
      const a = this.r() * Math.PI * 2;
      this.water.emit({ x, y: 0.05, z, vx: Math.cos(a) * 0.4, vy: 1.0 + this.r() * 0.6, vz: Math.sin(a) * 0.4, life: 0.5, size: 0.1, r: 0.95, g: 1, b: 1, gravity: 9 });
    }
  }

  /** The bite: the most exciting thing on screen. A tall white burst, a crown, a double ring, droplets, glints. */
  biteSplash(x: number, z: number, t: number): void {
    this.surface.ripple(x, z, t, 2.2);
    this.surface.ripple(x, z, t + 0.18, 1.4);
    this.surface.ripple(x, z, t + 0.4, 0.9);
    // Central column.
    for (let i = 0; i < (this.lite ? 25 : 50); i++) {
      const a = this.r() * Math.PI * 2;
      const s = this.r() * 0.7;
      this.water.emit({ x: x + Math.cos(a) * 0.15, y: 0.1, z: z + Math.sin(a) * 0.15, vx: Math.cos(a) * s, vy: 6 + this.r() * 5, vz: Math.sin(a) * s, life: 1.3, size: 0.22 + this.r() * 0.3, r: 1, g: 1, b: 1, gravity: 12, alpha: 1 });
    }
    // Crown.
    for (let i = 0; i < (this.lite ? 45 : 90); i++) {
      const a = this.r() * Math.PI * 2;
      const s = 1.4 + this.r() * 2.8;
      const up = 3.0 + this.r() * 4.0;
      this.water.emit({ x: x + Math.cos(a) * 0.3, y: 0.1, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: up, vz: Math.sin(a) * s, life: 1.1, size: 0.2 + this.r() * 0.26, r: 0.95, g: 1, b: 1, gravity: 11, alpha: 0.95 });
    }
    // White water ring on the surface.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.water.emit({ x: x + Math.cos(a) * 0.6, y: 0.1, z: z + Math.sin(a) * 0.6, vx: Math.cos(a) * 1.4, vy: 0.3, vz: Math.sin(a) * 1.4, life: 1.1, size: 0.6, r: 0.95, g: 1, b: 1, alpha: 0.5, grow: 1.4, drag: 2.2 });
    }
    this.sparkle(x, 0.8, z, 18, 1, 1, 0.9, 2.4, 0.4);
  }

  /** Continuous small spray while a fish thrashes (call every ~0.1 s). */
  thrash(x: number, z: number, t: number, k: number): void {
    if (this.r() < 0.45) this.surface.ripple(x, z, t, 0.95);
    for (let i = 0; i < 11 * k; i++) {
      const a = this.r() * Math.PI * 2;
      const s = 0.8 + this.r() * 1.6;
      this.water.emit({ x: x + Math.cos(a) * 0.3, y: 0.08, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: 2.4 + this.r() * 3.2, vz: Math.sin(a) * s, life: 0.85, size: 0.18 + this.r() * 0.2, r: 0.97, g: 1, b: 1, gravity: 10, alpha: 0.95 });
    }
  }

  /** A small "got away" splash. */
  missSplash(x: number, z: number, t: number): void {
    this.surface.ripple(x, z, t, 0.8);
    for (let i = 0; i < 16; i++) {
      const a = this.r() * Math.PI * 2;
      const s = 0.4 + this.r() * 1.2;
      this.water.emit({ x, y: 0.05, z, vx: Math.cos(a) * s + 1.2, vy: 1.5 + this.r() * 1.5, vz: Math.sin(a) * s, life: 0.7, size: 0.14, r: 0.95, g: 1, b: 1, gravity: 10 });
    }
  }

  /** The fish leaves the water: a crown of white water, a ring, spray. */
  leap(x: number, z: number, t: number, junk: boolean): void {
    this.surface.ripple(x, z, t, 1.5);
    this.surface.ripple(x, z, t + 0.2, 0.9);
    for (let i = 0; i < (this.lite ? 40 : junk ? 80 : 70); i++) {
      const a = this.r() * Math.PI * 2;
      const s = 0.6 + this.r() * (junk ? 2.6 : 2.0);
      this.water.emit({ x: x + Math.cos(a) * 0.2, y: 0.1, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * s, vy: 3 + this.r() * (junk ? 5 : 4.5), vz: Math.sin(a) * s, life: 1.1, size: 0.16 + this.r() * 0.24, r: 0.96, g: 1, b: 1, gravity: 10, alpha: 0.95 });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.water.emit({ x: x + Math.cos(a) * 0.4, y: 0.1, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * 0.9, vy: 0.5, vz: Math.sin(a) * 0.9, life: 0.9, size: 0.5, r: 0.94, g: 0.99, b: 1, alpha: 0.45, grow: 1.4, drag: 2 });
    }
  }

  /** A trail of droplets behind a flying fish. */
  drip(x: number, y: number, z: number): void {
    this.water.emit({ x, y, z, vx: (this.r() - 0.5) * 0.4, vy: -0.5, vz: (this.r() - 0.5) * 0.4, life: 0.6, size: 0.12, r: 0.9, g: 1, b: 1, gravity: 8, alpha: 0.85 });
  }

  sparkle(x: number, y: number, z: number, n: number, r: number, g: number, b: number, speed: number, size = 0.35): void {
    for (let i = 0; i < n; i++) {
      const a = this.r() * Math.PI * 2;
      const e = (this.r() - 0.3) * Math.PI;
      const s = speed * (0.4 + this.r() * 0.8);
      this.glow.emit({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 0.5, vz: Math.sin(a) * Math.cos(e) * s, life: 0.9 + this.r() * 0.8, size: size * (0.6 + this.r() * 0.8), r, g, b, drag: 1.6, shape: 1 });
    }
  }

  /** Gold confetti for a golden-swirl catch. */
  confetti(x: number, y: number, z: number): void {
    const cols: [number, number, number][] = [[1, 0.84, 0.3], [1, 0.95, 0.6], [1, 0.7, 0.2], [1, 1, 1]];
    for (let i = 0; i < (this.lite ? 40 : 90); i++) {
      const a = this.r() * Math.PI * 2;
      const s = 1 + this.r() * 3;
      const c = cols[i % cols.length]!;
      this.water.emit({ x, y, z, vx: Math.cos(a) * s, vy: 3 + this.r() * 4, vz: Math.sin(a) * s, life: 2.4, size: 0.18, r: c[0], g: c[1], b: c[2], gravity: 3.2, drag: 1.2 });
    }
  }

  /** The rod-upgrade burst round a fisher: a rising column of light. */
  upgradeBurst(x: number, y: number, z: number): void {
    for (let i = 0; i < (this.lite ? 30 : 60); i++) {
      const a = this.r() * Math.PI * 2;
      const rr = 0.4 + this.r() * 1.2;
      this.glow.emit({ x: x + Math.cos(a) * rr, y: y + this.r() * 0.5, z: z + Math.sin(a) * rr, vx: -Math.sin(a) * 1.2, vy: 2 + this.r() * 3.5, vz: Math.cos(a) * 1.2, life: 1.6, size: 0.45, r: 1, g: 0.9, b: 0.55, drag: 0.8, shape: 1 });
    }
  }

  /** Ambient: fireflies at night, mist and spray at the falls, embers from the fire. */
  ambient(dt: number, tod: TodState, campfire: number): void {
    // Falls mist + spray.
    this.mistAcc += dt * (this.lite ? 8 : 18);
    while (this.mistAcc > 1) {
      this.mistAcc -= 1;
      const x = (this.r() - 0.5) * 2.4;
      const z = FALLS.footZ + (this.r() - 0.2) * 1.4;
      this.water.emit({ x, y: 0.4 + this.r() * 0.6, z, vx: (this.r() - 0.5) * 0.8, vy: 0.5 + this.r() * 0.6, vz: 0.4 + this.r() * 0.6, life: 2.4, size: 1.1 + this.r() * 0.8, r: 0.95, g: 0.98, b: 1, alpha: 0.22 + 0.15 * tod.mist, grow: 1.2, drag: 0.6 });
      if (this.r() < 0.5) this.water.emit({ x, y: 0.3, z, vx: (this.r() - 0.5) * 1.8, vy: 2 + this.r() * 2, vz: 0.6 + this.r(), life: 0.8, size: 0.15, r: 1, g: 1, b: 1, gravity: 9, alpha: 0.8 });
    }
    // Wisps: glowing teal and violet motes drifting over the shore and water (more at night).
    this.fireflyAcc += dt * (this.lite ? 4 + 6 * tod.glow : 8 + 14 * tod.glow);
    while (this.fireflyAcc > 1) {
      this.fireflyAcc -= 1;
      const th = this.r() * Math.PI * 2;
      const rr = lakeRadius(th) - 4 + this.r() * 14;
      const x = Math.cos(th) * rr;
      const z = Math.sin(th) * rr;
      const violet = this.r() < 0.4;
      this.glow.emit({ x, y: Math.max(0, heightAt(x, z)) + 0.4 + this.r() * 2.2, z, vx: (this.r() - 0.5) * 0.5, vy: (this.r() - 0.3) * 0.25, vz: (this.r() - 0.5) * 0.5, life: 4 + this.r() * 4, size: 0.22 + this.r() * 0.2, r: violet ? 0.75 : 0.45, g: violet ? 0.55 : 1, b: 1, alpha: 0.6 + 0.4 * tod.glow, shape: 0 });
    }
    // Ground mist: big soft lavender puffs hugging the water and the grass.
    this.mistGroundAcc += dt * (this.lite ? 2 : 5) * (0.4 + tod.mist);
    while (this.mistGroundAcc > 1) {
      this.mistGroundAcc -= 1;
      const th = this.r() * Math.PI * 2;
      const rr = lakeRadius(th) - 3 + this.r() * 10;
      const x = Math.cos(th) * rr;
      const z = Math.sin(th) * rr;
      this.water.emit({ x, y: Math.max(0, heightAt(x, z)) + 0.3, z, vx: 0.25 + this.r() * 0.2, vy: 0.02, vz: (this.r() - 0.5) * 0.2, life: 9, size: 5 + this.r() * 4, r: tod.fog.r * 1.2 + 0.15, g: tod.fog.g * 1.2 + 0.15, b: tod.fog.b * 1.1 + 0.2, alpha: 0.07 + 0.07 * tod.mist, grow: 0.6 });
    }
    // Embers.
    const fire = Math.max(tod.glow, campfire);
    this.emberAcc += dt * (2 + 10 * fire);
    while (this.emberAcc > 1) {
      this.emberAcc -= 1;
      this.glow.emit({ x: CAMPFIRE.x + (this.r() - 0.5) * 0.4, y: heightAt(CAMPFIRE.x, CAMPFIRE.z) + 0.6, z: CAMPFIRE.z + (this.r() - 0.5) * 0.4, vx: (this.r() - 0.5) * 0.5, vy: 1 + this.r() * 1.4, vz: (this.r() - 0.5) * 0.5, life: 1.4 + this.r(), size: 0.12, r: 1, g: 0.55, b: 0.2, drag: 0.4 });
    }
  }
}

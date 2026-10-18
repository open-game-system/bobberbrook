import type { Splashes } from "./splash";
import type { Escape } from "./escape";
import { AREAS, pondRadius, type PondPlace } from "../../game/world";
import { placesAround } from "./worldQuery";
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
    this.splashes?.spawn(x, z, t, 1.15);
    // Droplets: small and crisp, thrown up and out from the crown's rim.
    for (let i = 0; i < (this.lite ? 22 : 40); i++) {
      const a = this.r() * Math.PI * 2;
      const s = 1.0 + this.r() * 2.4;
      this.water.emit({ x: x + Math.cos(a) * 0.5, y: 0.5 + this.r() * 0.6, z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * s, vy: 2.6 + this.r() * 3.6, vz: Math.sin(a) * s, life: 1.0, size: 0.09 + this.r() * 0.08, r: 1, g: 1, b: 1, gravity: 11, alpha: 1 });
    }
    // A short central jet.
    for (let i = 0; i < (this.lite ? 8 : 14); i++) {
      const a = this.r() * Math.PI * 2;
      const s = this.r() * 0.4;
      this.water.emit({ x, y: 0.1, z, vx: Math.cos(a) * s, vy: 5 + this.r() * 3.5, vz: Math.sin(a) * s, life: 1.0, size: 0.12 + this.r() * 0.08, r: 1, g: 1, b: 1, gravity: 12, alpha: 1 });
    }
    this.sparkle(x, 0.8, z, 14, 1, 1, 0.9, 2.4, 0.35);
  }

  /** Continuous small spray while a fish thrashes (call every ~0.1 s). */
  thrash(x: number, z: number, t: number, k: number): void {
    if (this.r() < 0.45) this.surface.ripple(x, z, t, 0.95);
    for (let i = 0; i < 11 * k; i++) {
      const a = this.r() * Math.PI * 2;
      const s = 0.8 + this.r() * 1.6;
      this.water.emit({ x: x + Math.cos(a) * 0.3, y: 0.08, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: 2.4 + this.r() * 3.2, vz: Math.sin(a) * s, life: 0.85, size: 0.12 + this.r() * 0.12, r: 0.97, g: 1, b: 1, gravity: 10, alpha: 0.95 });
    }
  }

  /**
   * Round 23: a reel pulse at the bobber (every ~0.5 s while reeling): a ring that grows as the fish comes in
   * (`progress` 0..1) and, while the line is pulled, a little spurt of bright droplets.
   */
  reelTug(x: number, z: number, t: number, progress: number, pulled: boolean): void {
    this.surface.ripple(x, z, t, 0.75 + 0.75 * progress);
    if (!pulled) return;
    for (let i = 0; i < (this.lite ? 3 : 6); i++) {
      const a = this.r() * Math.PI * 2;
      const s = 0.5 + this.r() * 0.7;
      this.water.emit({ x, y: 0.06, z, vx: Math.cos(a) * s, vy: 1.6 + this.r() * 1.2, vz: Math.sin(a) * s, life: 0.6, size: 0.1 + this.r() * 0.06, r: 0.97, g: 1, b: 1, gravity: 9, alpha: 0.95 });
    }
  }

  /** Round 23: the fish thrashes (the phone says let go): a bright crown of white water, a wide ring and glints. */
  thrashBurst(x: number, z: number, t: number): void {
    this.splashes?.spawn(x, z, t, 0.8);
    this.surface.ripple(x, z, t, 1.5);
    this.sparkle(x, 0.6, z, this.lite ? 4 : 8, 1, 0.95, 0.75, 1.8, 0.3);
  }

  /** A small "got away" splash. */
  missSplash(x: number, z: number, t: number, away = this.r() * Math.PI * 2): void {
    this.surface.ripple(x, z, t, 1.1);
    // Round 22: a wider ring spreads out after it, so the miss reads from the far side of the room.
    this.surface.ripple(x, z, t + 0.22, 1.8);
    // The tail breaks the surface: a burst of spray as it comes up, then (escape.ts) it flicks and slaps.
    for (let i = 0; i < (this.lite ? 14 : 24); i++) {
      const a = this.r() * Math.PI * 2;
      const s = 0.4 + this.r() * 1.2;
      this.water.emit({ x, y: 0.05, z, vx: Math.cos(a) * s, vy: 2.2 + this.r() * 2.2, vz: Math.sin(a) * s, life: 0.8, size: 0.13 + this.r() * 0.08, r: 0.96, g: 1, b: 1, gravity: 10, alpha: 0.95 });
    }
    this.escape?.spawn(x, z, t, away);
  }

  /** The escaping tail slaps the water: a sheet of spray thrown along the way it goes, a crown, rings. */
  slap(x: number, z: number, t: number, away: number): void {
    this.surface.ripple(x, z, t, 1.6);
    this.surface.ripple(x, z, t + 0.15, 1.0);
    this.splashes?.spawn(x, z, t, 0.7);
    for (let i = 0; i < (this.lite ? 20 : 36); i++) {
      const a = away + (this.r() - 0.5) * 1.6;
      const s = 1.4 + this.r() * 2.6;
      this.water.emit({ x, y: 0.12, z, vx: Math.cos(a) * s, vy: 2.4 + this.r() * 3.2, vz: Math.sin(a) * s, life: 0.95, size: 0.12 + this.r() * 0.14, r: 0.97, g: 1, b: 1, gravity: 11, alpha: 0.95 });
    }
  }

  escape: Escape | null = null;

  /** The fish leaves the water: a crown of white water, a ring, spray. */
  leap(x: number, z: number, t: number, junk: boolean): void {
    this.surface.ripple(x, z, t, 1.5);
    this.splashes?.spawn(x, z, t, 0.85);
    this.surface.ripple(x, z, t + 0.2, 0.9);
    for (let i = 0; i < (this.lite ? 40 : junk ? 80 : 70); i++) {
      const a = this.r() * Math.PI * 2;
      const s = 0.6 + this.r() * (junk ? 2.6 : 2.0);
      this.water.emit({ x: x + Math.cos(a) * 0.2, y: 0.1, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * s, vy: 3 + this.r() * (junk ? 5 : 4.5), vz: Math.sin(a) * s, life: 1.1, size: 0.11 + this.r() * 0.15, r: 0.96, g: 1, b: 1, gravity: 10, alpha: 0.95 });
    }
    // Round 19: no ring of big soft white puffs (they read as cotton balls); the crown sheet carries the shape.
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

  /** Golden motes rising slowly through a golden swirl's light (round 19), soft dots that drift and fade. */
  motes(x: number, z: number, radius: number): void {
    const a = this.r() * Math.PI * 2;
    const rr = Math.sqrt(this.r()) * radius;
    this.glow.emit({ x: x + Math.cos(a) * rr, y: 0.2 + this.r() * 0.6, z: z + Math.sin(a) * rr, vx: (this.r() - 0.5) * 0.25, vy: 0.7 + this.r() * 0.9, vz: (this.r() - 0.5) * 0.25, life: 2.2 + this.r() * 1.6, size: 0.12 + this.r() * 0.12, r: 1, g: 0.82 + this.r() * 0.12, b: 0.4, drag: 0.15 });
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
  private sporeAcc = 0;
  /** Shaped splashes (ring + crown); droplets stay particles. */
  splashes: Splashes | null = null;

  /** The discovery moment: light motes swirl in from all round a place toward its middle. */
  discoverySwirl(x: number, z: number, radius: number): void {
    const n = this.lite ? 70 : 160;
    for (let i = 0; i < n; i++) {
      const a = this.r() * Math.PI * 2;
      const rr = radius * (0.5 + this.r() * 0.6);
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      // Mostly tangential, a little inward and up: a slow spiral.
      const sp = 2 + this.r() * 2.5;
      const vx = -Math.sin(a) * sp - Math.cos(a) * rr * 0.12;
      const vz = Math.cos(a) * sp - Math.sin(a) * rr * 0.12;
      const gold = this.r() < 0.35;
      this.glow.emit({ x: px, y: 0.6 + this.r() * 3, z: pz, vx, vy: 0.4 + this.r() * 0.8, vz, life: 2.6 + this.r() * 1.2, size: 0.25 + this.r() * 0.25, r: gold ? 1 : 0.6, g: gold ? 0.9 : 0.9, b: gold ? 0.55 : 1, alpha: 1, drag: 0.25, shape: this.r() < 0.3 ? 1 : 0 });
    }
  }

  ambient(dt: number, tod: TodState, campfire: number, fx0 = 0, fz0 = 0): void {
    // Wisps and ground mist gather round the pond nearest the action.
    let near: PondPlace = AREAS[0]!;
    let best = Infinity;
    for (const a of placesAround(fx0, fz0)) {
      const d = Math.hypot(a.center.x - fx0, a.center.z - fz0) - a.pond.r;
      if (d < best) {
        best = d;
        near = a;
      }
    }
    const cx = near.center.x;
    const cz = near.center.z;
    const edgeAt = (th: number) => pondRadius(near, th);
    // Falls mist + spray (only when Moonwell is in view).
    this.mistAcc += dt * (this.lite ? 8 : 18) * (near.id === "moonwell" ? 1 : 0);
    while (this.mistAcc > 1) {
      this.mistAcc -= 1;
      const x = (this.r() - 0.5) * 2.4;
      const z = FALLS.footZ + (this.r() - 0.2) * 1.4;
      this.water.emit({ x, y: 0.4 + this.r() * 0.6, z, vx: (this.r() - 0.5) * 0.8, vy: 0.5 + this.r() * 0.6, vz: 0.4 + this.r() * 0.6, life: 2.4, size: 1.1 + this.r() * 0.8, r: 0.74, g: 0.88, b: 0.94, alpha: 0.13 + 0.1 * tod.mist, grow: 1.2, drag: 0.6 });
      if (this.r() < 0.5) this.water.emit({ x, y: 0.3, z, vx: (this.r() - 0.5) * 1.8, vy: 2 + this.r() * 2, vz: 0.6 + this.r(), life: 0.8, size: 0.15, r: 0.84, g: 0.95, b: 0.98, gravity: 9, alpha: 0.7 });
    }
    // Wisps: glowing teal and violet motes drifting over the shore and water (more at night).
    this.fireflyAcc += dt * (this.lite ? 4 + 6 * tod.glow : 8 + 14 * tod.glow);
    while (this.fireflyAcc > 1) {
      this.fireflyAcc -= 1;
      const th = this.r() * Math.PI * 2;
      const rr = edgeAt(th) - 4 + this.r() * 14;
      const x = cx + Math.cos(th) * rr;
      const z = cz + Math.sin(th) * rr;
      const violet = this.r() < 0.4;
      this.glow.emit({ x, y: Math.max(0, heightAt(x, z)) + 0.4 + this.r() * 2.2, z, vx: (this.r() - 0.5) * 0.5, vy: (this.r() - 0.3) * 0.25, vz: (this.r() - 0.5) * 0.5, life: 4 + this.r() * 4, size: 0.22 + this.r() * 0.2, r: violet ? 0.75 : 0.45, g: violet ? 0.55 : 1, b: 1, alpha: 0.6 + 0.4 * tod.glow, shape: 0 });
    }
    // Ground mist: big soft lavender puffs hugging the water and the grass.
    this.mistGroundAcc += dt * (this.lite ? 2 : 5) * (0.4 + tod.mist);
    while (this.mistGroundAcc > 1) {
      this.mistGroundAcc -= 1;
      const th = this.r() * Math.PI * 2;
      const rr = edgeAt(th) - 3 + this.r() * 10;
      const x = cx + Math.cos(th) * rr;
      const z = cz + Math.sin(th) * rr;
      this.water.emit({ x, y: Math.max(0, heightAt(x, z)) + 0.3, z, vx: 0.25 + this.r() * 0.2, vy: 0.02, vz: (this.r() - 0.5) * 0.2, life: 9, size: 5 + this.r() * 4, r: tod.fog.r * 1.2 + 0.15, g: tod.fog.g * 1.2 + 0.15, b: tod.fog.b * 1.1 + 0.2, alpha: 0.07 + 0.07 * tod.mist, grow: 0.6 });
    }
    // Glowshroom Hollow: spores drifting up from the giant caps.
    if (near.id === "hollow" && best < 40) {
      this.sporeAcc += dt * (this.lite ? 6 : 14);
      while (this.sporeAcc > 1) {
        this.sporeAcc -= 1;
        const th = this.r() * Math.PI * 2;
        const rr = this.r() * (near.pond.r + near.clearing);
        const x = cx + Math.cos(th) * rr;
        const z = cz + Math.sin(th) * rr;
        const teal = this.r() < 0.55;
        this.glow.emit({ x, y: 0.5 + this.r() * 6, z, vx: (this.r() - 0.5) * 0.3, vy: 0.15 + this.r() * 0.3, vz: (this.r() - 0.5) * 0.3, life: 5 + this.r() * 4, size: 0.12 + this.r() * 0.14, r: teal ? 0.4 : 0.8, g: teal ? 1 : 0.6, b: 1, alpha: 0.9, shape: 0 });
      }
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

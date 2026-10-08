import { Group, PointLight, type Mesh, type MeshBasicMaterial } from "three";
import type { Lake } from "../../game/lake";
import { MAX_SWIRLS, type Water } from "./water";
import type { FishShadows } from "./fishviz";
import type { Fx } from "./fx";
import { lightPillar } from "./fishviz";

type Slot = { id: number; x: number; z: number; golden: boolean; alpha: number; live: boolean; seed: number };

/** Fish schools circling under the surface; they fade in and out, never pop. */
export class SwirlViews {
  readonly group = new Group();
  readonly light: PointLight;
  private readonly slots: Slot[] = Array.from({ length: MAX_SWIRLS }, () => ({ id: -1, x: 0, z: 0, golden: false, alpha: 0, live: false, seed: 0 }));
  private readonly pillar: Mesh;
  private readonly pillarMat: MeshBasicMaterial;
  private sparkAcc = 0;

  constructor(
    private readonly water: Water,
    private readonly shadows: FishShadows,
    private readonly fx: Fx,
  ) {
    const p = lightPillar();
    this.pillar = p.mesh;
    this.pillarMat = p.mat;
    this.group.add(this.pillar);
    this.light = new PointLight(0xffc860, 0, 10, 1.4);
    this.light.position.set(0, 1.5, 0);
    this.group.add(this.light);
  }

  showAllForPrewarm(): void {
    this.pillar.visible = true;
  }

  frame(lake: Lake | null, sn: number, t: number, dt: number): void {
    for (const s of this.slots) s.live = false;
    if (lake) {
      for (const sw of lake.swirls) {
        let slot = this.slots.find((s) => s.id === sw.id);
        if (!slot) slot = this.slots.find((s) => s.alpha <= 0.001) ?? this.slots.reduce((a, b) => (a.alpha < b.alpha ? a : b));
        if (slot.id !== sw.id) {
          slot.id = sw.id;
          slot.alpha = 0;
          slot.seed = sw.id * 1.7;
        }
        slot.x = sw.pos.x;
        slot.z = sw.pos.z;
        slot.golden = sw.golden;
        slot.live = true;
        const fadeIn = Math.min(1, Math.max(0, (sn - sw.since) / 2500));
        const fadeOut = Math.min(1, Math.max(0, (sw.until - sn) / 3000));
        const target = Math.min(fadeIn, fadeOut);
        slot.alpha += (target - slot.alpha) * Math.min(1, dt * 2.5);
      }
    }
    let gold = 0;
    let gx = 0;
    let gz = 0;
    this.slots.forEach((s, i) => {
      if (!s.live) s.alpha = Math.max(0, s.alpha - dt * 0.7);
      this.water.setSwirl(i, s.x, s.z, s.alpha, s.golden ? 1 : 0);
      if (s.alpha <= 0.01) return;
      const n = s.golden ? 9 : 10;
      for (let k = 0; k < n; k++) {
        const ring = 0.7 + (k % 3) * 0.75 + Math.sin(s.seed + k) * 0.2;
        const dir = k % 2 === 0 ? 1 : 1;
        const w = (0.9 + 0.35 * Math.sin(k * 2.1 + s.seed)) * dir / ring;
        const a = t * w * 1.4 + (k / n) * Math.PI * 2 + s.seed;
        const x = s.x + Math.cos(a) * ring;
        const z = s.z + Math.sin(a) * ring;
        const heading = a + Math.PI / 2;
        const sc = (0.8 + 0.4 * ((k * 7) % 3) / 2) * s.alpha;
        if (s.golden) this.shadows.add(x, z, heading, sc * 1.15, Math.sin(t * 8 + k) * 0.2, 0.95 * s.alpha + 0.05, 0.7 * s.alpha + 0.15, 0.2 + 0.1 * s.alpha);
        else this.shadows.add(x, z, heading, sc, Math.sin(t * 8 + k) * 0.2, 0.05, 0.2, 0.24);
      }
      if (s.golden && s.alpha > gold) {
        gold = s.alpha;
        gx = s.x;
        gz = s.z;
      }
    });
    // Sparkles over the schools; lots of gold over a golden one.
    this.sparkAcc += dt;
    if (this.sparkAcc > 0.12) {
      this.sparkAcc = 0;
      for (const s of this.slots) {
        if (s.alpha < 0.3) continue;
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * 2.6;
        if (s.golden) this.fx.sparkle(s.x + Math.cos(a) * rr, 0.25, s.z + Math.sin(a) * rr, 2, 1, 0.85, 0.35, 1.2, 0.5);
        else if (Math.random() < 0.5) this.fx.sparkle(s.x + Math.cos(a) * rr, 0.15, s.z + Math.sin(a) * rr, 1, 0.85, 1, 1, 0.5, 0.3);
      }
    }
    this.pillar.visible = gold > 0.01;
    this.pillar.position.set(gx, 0, gz);
    this.pillar.rotation.y = t * 0.2;
    this.pillarMat.color.setScalar(gold * (0.8 + 0.2 * Math.sin(t * 2)));
    this.light.position.set(gx, 1.4, gz);
    this.light.intensity = gold * 9;
  }

  dispose(): void {
    this.pillar.geometry.dispose();
    this.pillarMat.dispose();
  }
}

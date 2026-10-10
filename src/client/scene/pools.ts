import { AdditiveBlending, CanvasTexture, Color, InstancedMesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import { instanced, type Inst } from "./kit";
import type { TodState } from "./tod";
import { getCards } from "./cards";

/**
 * Pools of lamplight on the ground (round 09 critic: "no lantern pools"): soft painted discs of warm
 * light at the foot of every lamp post, lantern and cottage door, added over the ground at night. One
 * shared material and geometry (one program); the scene's light count never changes.
 */
let mat: MeshBasicMaterial | null = null;
let geo: PlaneGeometry | null = null;

function poolTexture(): CanvasTexture {
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d");
  if (ctx) {
    // A soft painted falloff (hot middle, long tail), broken by a few dabs so it never reads as a decal disc.
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, "rgba(235,235,235,0.85)");
    g.addColorStop(0.45, "rgba(150,150,150,0.45)");
    g.addColorStop(0.75, "rgba(50,50,50,0.15)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    let seed = 7;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.globalCompositeOperation = "multiply";
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2;
      const r = (0.15 + R() * 0.3) * S;
      const v = Math.round(170 + R() * 70);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.ellipse(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 6 + R() * 12, 3 + R() * 6, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function poolMaterial(): MeshBasicMaterial {
  if (!mat) {
    // Round 11: the Codex-painted warm pool (drawn additively: its black key adds nothing).
    const painted = getCards()?.poolWarm ?? null;
    tint = painted ? paintedTint : warm;
    mat = new MeshBasicMaterial({ map: painted ?? poolTexture(), color: 0x000000, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = "lamp-pools";
  }
  return mat;
}

/** Ground pools at these spots: x/z the light's foot, y the ground, s the radius in metres. */
export function poolMesh(list: Inst[]): InstancedMesh {
  if (!geo) geo = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(0, 0.12, 0);
  const m = instanced(geo, poolMaterial(), list, false);
  m.receiveShadow = false;
  m.renderOrder = 2;
  m.name = "lamp-pools";
  return m;
}

/**
 * Pools of moonlight (round 12): the Codex cool pool, additive, on open ground in each clearing, by
 * night only (with the moon). Same program as the lamp pools (another material instance). Null when
 * the kit has no cool pool.
 */
let moonMat: MeshBasicMaterial | null = null;
export function moonPoolMesh(list: Inst[]): InstancedMesh | null {
  const painted = getCards()?.poolCool ?? null;
  if (!painted) return null;
  if (!moonMat) {
    moonMat = new MeshBasicMaterial({ map: painted, color: 0x000000, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    moonMat.name = "moon-pools";
  }
  if (!geo) geo = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(0, 0.12, 0);
  const m = instanced(geo, moonMat, list, false);
  m.receiveShadow = false;
  m.renderOrder = 2;
  m.name = "moon-pools";
  return m;
}
/** Moon pool tint and strength at full night (the painted pool is blue already: a dim neutral tint). */
const moonTint = new Color(0.34, 0.38, 0.44);
export const MOON_POOL_STRENGTH = 0.9;

const warm = new Color(1.0, 0.56, 0.24);
/** The painted pool is already warm and fills its card: a dim neutral tint keeps its colour at the old strength. */
const paintedTint = new Color(0.42, 0.34, 0.26);
let tint = warm;
/** Pools brighten with the lamps: nothing by day, full at night. */
export function updatePools(tod: TodState): void {
  if (moonMat) moonMat.color.copy(moonTint).multiplyScalar(MOON_POOL_STRENGTH * tod.moon * tod.moon);
  if (!mat) return;
  const n = Math.max(0, Math.min(1, (tod.glow - 0.4) / 0.55));
  mat.color.copy(tint).multiplyScalar(POOL_STRENGTH * n * n);
}

/** Pool brightness at full night (additive, linear). */
export const POOL_STRENGTH = 1.1;

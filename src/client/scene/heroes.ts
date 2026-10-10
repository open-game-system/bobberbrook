import { Color, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";
import { cottageGeometry, giantGeometry, instanced } from "./kit";
import { merge, paint, prep, surf } from "./geo";
import { PK } from "./painter";
import { disc } from "./decking";
import { valance } from "./valance";
import { rng } from "./noise";
import { heightAt } from "./terrain";
import { farSpot, type KitCtx, type LandmarkKind } from "./biomes";

/**
 * Round 19: one hero silhouette per generated place, in Ashenvale's vocabulary, standing over the far side of
 * the clearing where the group camera looks: a colossal ancient tree with a small elven platform round its trunk
 * (a ring deck, an upswept violet roof, hanging lanterns) or a hamlet of three larger cottages. The place's own
 * landmark stays; this is what makes one place read differently from the next across the room (round 18: places
 * read as one pond template).
 */
export type HeroKind = "ancient" | "hamlet";

/** Which hero a place gets: never a second giant tree beside a giant-tree landmark; else mostly the ancient. */
export function heroFor(landmark: LandmarkKind, pick: number): HeroKind {
  if (landmark === "giant") return "hamlet";
  return pick < 0.68 ? "ancient" : "hamlet";
}

/** The ancient tree's scale (giantGeometry is ~21 m to the crown at 1; the landmark giant is 0.62-0.92). */
export const HERO_SCALE = { min: 1.45, max: 1.75 } as const;

/** Where the platform sits on an ancient tree of scale s: deck height, the trunk's radius there, the deck's. */
export function platformAt(s: number): { y: number; trunkR: number; deckR: number } {
  // giantGeometry's trunk: radius 2.7 at the foot to 1.6 at 16 m, roots to 3.4 m, boughs from 10 m. Low enough
  // (~7 m) that the group camera's close framing still shows the deck and roof under the frame's top edge.
  const yl = 4.6;
  const trunkR = (2.7 - (1.1 * yl) / 16) * s;
  return { y: yl * s, trunkR, deckR: trunkR + 2.6 };
}

const woodShade = (rho: number, _h: number, lip: boolean, out: Color) => {
  out.setHex(lip ? 0x8a6a48 : 0x6a4c34).multiplyScalar(0.9 + 0.12 * Math.min(1, rho / 6));
};

/** The elven platform round the trunk (local: deck top at y 0, trunk axis at the origin). */
function platform(trunkR: number, deckR: number): { wood: BufferGeometry; glow: BufferGeometry } {
  const parts: BufferGeometry[] = [];
  parts.push(surf(disc({ r: deckR, top: 0.0, bottom: -0.45, lip: 0.16, flare: 0.12, rings: 2 }, 32, woodShade), PK.planks));
  // Curved brackets under the deck, into the trunk.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new CylinderGeometry(0.12, 0.16, deckR - trunkR + 0.6, 6).rotateZ(Math.PI / 2 - 0.65).translate((deckR + trunkR) / 2 - 0.2, -1.0, 0).rotateY(a);
    parts.push(surf(paint(prep(b), 0x3a2a26, 0x5a4232), PK.grain));
  }
  // A railing: posts and a rounded rail.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    parts.push(surf(paint(prep(new CylinderGeometry(0.07, 0.09, 1.0, 6).translate(deckR - 0.25, 0.5, 0).rotateY(a)), 0x4a3426, 0x6a4c34), PK.grain));
  }
  parts.push(surf(paint(prep(new TorusGeometry(deckR - 0.25, 0.07, 5, 40).rotateX(Math.PI / 2).translate(0, 1.0, 0)), 0x5a4030, 0x7a5a40), PK.grain));
  // An upswept violet roof: a shallow cone from the eave into the trunk, the eave lifted at the rim.
  const eaveY = 3.1;
  const roofR = deckR + 0.9;
  const roof = new ConeGeometry(roofR, 2.6, 36, 4, true).translate(0, eaveY + 1.3, 0);
  const pos = roof.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / roofR;
    const t = Math.min(1, Math.max(0, (r - 0.7) / 0.3));
    pos.setY(i, pos.getY(i) + 0.55 * t * t);
  }
  roof.computeVertexNormals();
  parts.push(
    surf(
      paint(prep(roof), 0x2e2068, 0x8a6ad0, (p, _n, c) => {
        if (p.y < eaveY + 0.35) c.lerp(new Color(0xd8b878), 0.3);
      }),
      PK.shingles,
    ),
  );
  parts.push(paint(prep(new TorusGeometry(roofR + 0.02, 0.07, 5, 40).rotateX(Math.PI / 2).translate(0, eaveY + 0.55, 0)), 0xb88a30, 0xf0d080));
  parts.push(valance({ r: roofR - 0.05, top: eaveY + 0.5, depth: 0.42, scallops: 16, repeats: 6 }));
  // Four slim posts from the deck to the eave.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(surf(paint(prep(new CylinderGeometry(0.1, 0.12, eaveY + 0.5, 6).translate(deckR - 0.35, (eaveY + 0.5) / 2, 0).rotateY(a)), 0x3a2a26, 0x5a4232), PK.grain));
  }
  // Lanterns hanging under the eave.
  const glow: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    glow.push(paint(prep(new SphereGeometry(0.2, 8, 6).scale(1, 1.25, 1).translate(roofR - 0.55, eaveY - 0.35, 0).rotateY(a)), 0xffe2a8));
  }
  return { wood: merge(parts), glow: merge(glow) };
}

function ancient(c: KitCtx, R: () => number): void {
  const p = farSpot(c, R, c.a.clearing + 5, -Math.PI / 2 + (R() - 0.5) * 0.5);
  const s = HERO_SCALE.min + R() * (HERO_SCALE.max - HERO_SCALE.min);
  const v = Math.floor(R() * 3);
  const ry = R() * 6;
  const y0 = heightAt(p.x, p.z) - 0.8;
  // Instanced like every tree (leaf cards, bark, the occluder fade).
  const gm = instanced(giantGeometry(v), c.tree, [{ x: p.x, y: y0, z: p.z, s, ry }], c.full);
  gm.name = "hero-ancient";
  c.group.add(gm);
  const pf = platformAt(s);
  const { wood, glow } = platform(pf.trunkR, pf.deckR);
  const face = Math.atan2(c.a.center.x - p.x, c.a.center.z - p.z);
  for (const [g, out] of [[wood, c.wood], [glow, c.glow]] as const) {
    g.rotateY(face);
    g.translate(p.x, y0 + pf.y, p.z);
    out.push(g);
  }
}

function hamlet(c: KitCtx, R: () => number): void {
  const p = farSpot(c, R, c.a.clearing + 3, -Math.PI / 2 + (R() - 0.5) * 0.6);
  const r0 = Math.hypot(p.x - c.a.center.x, p.z - c.a.center.z);
  for (let i = 0; i < 3; i++) {
    const th = p.th + (i - 1) * (7.5 / Math.max(10, r0));
    const rr = r0 + (i === 1 ? 4 : 0) + (R() - 0.5) * 1.5;
    const x = c.a.center.x + Math.cos(th) * rr;
    const z = c.a.center.z + Math.sin(th) * rr;
    const k = i === 1 ? 2.2 : 1.6 + R() * 0.2;
    const { body, windows } = cottageGeometry(Math.floor(R() * 1000) + 20);
    const face = Math.atan2(c.a.center.x - x, c.a.center.z - z);
    const y = heightAt(x, z) - 0.15;
    for (const [g, out] of [[body, c.wood], [windows, c.glow]] as const) {
      g.scale(k, k, k);
      g.rotateY(face);
      g.translate(x, y, z);
      out.push(g);
    }
  }
}

export function buildHero(c: KitCtx, landmark: LandmarkKind, pick: number): HeroKind {
  const kind = heroFor(landmark, pick);
  const R = rng(9091 + c.seed);
  if (kind === "ancient") ancient(c, R);
  else hamlet(c, R);
  return kind;
}

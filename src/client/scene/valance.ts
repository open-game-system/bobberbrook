import { CylinderGeometry, type BufferGeometry } from "three";
import { paint, prep, surf } from "./geo";
import { PK } from "./painter";

/**
 * A scalloped cloth drape hung round under an eave (round 15): the Codex tent canvas (violet cloth, gold
 * trim) by explicit texture coordinates, `repeats` times round, shaded under the eave and lit at the hem.
 */
export function valance(o: { r: number; top: number; depth: number; scallops: number; repeats: number }): BufferGeometry {
  const g = new CylinderGeometry(o.r, o.r * 1.03, o.depth, o.scallops * 4, 1, true).translate(0, o.top - o.depth / 2, 0);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  const hem = o.top - o.depth;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > hem + 1e-6) continue;
    const f = (uv.getX(i) * o.scallops) % 1;
    // Lowest mid-scallop, lifted where two scallops meet.
    pos.setY(i, hem + o.depth * 0.45 * (1 - Math.sin(Math.PI * f)));
  }
  g.computeVertexNormals();
  return paint(prep(surf(g, PK.tent, o.repeats, 1)), 0xfff6ff, 0x9a8ab8);
}

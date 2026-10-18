import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  LatheGeometry,
  Vector2,
  BoxGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  TubeGeometry,
  type Material,
  type MeshLambertMaterial,
  Vector3,
} from "three";
import { TAG_LAYER } from "./post";
import { merge, paint, prep, surf } from "./geo";
import { bakeFigure, type Occluder } from "./figurePaint";
import { PK, type PaintKind } from "./painter";
import { hairLocks, paintSkull, waveBrim } from "./fisherShape";
import { crownLift, onFace, shapeHead } from "./fisherFace";
import { SEAT_HEX } from "./types";
import { vnoise } from "./noise";
import { BUILDS, CHIN, HEAD_HALF, figureTop, type Build, type Role } from "./fisherBuild";

/** World scale of a fisher (model is built ~1 unit tall). */
export const FISHER_SCALE = 2.2;
export const ROD_SEGMENTS = 4;
const ROD_LEN = 1.75;

export type RodRig = { root: Group; pivots: Group[]; tip: Object3D };

export type FisherRig = {
  root: Group;
  body: Group;
  head: Group;
  legL: Group;
  legR: Group;
  armL: Group;
  armR: Group;
  hand: Object3D;
  /**
   * Round 21: where the rod rides. The rods hang off the fisher's root; each frame the scene blends them
   * between `rodHand` (in the right mitten, along the forearm) and `rodBack` (over the right shoulder, tip up
   * and back) by how far the fisher is walking (fishers.ts).
   */
  rodHand: Object3D;
  rodBack: Object3D;
  rods: RodRig[];
  /** Round 24: the build (fisherBuild.ts) and its measures in figure units (x FISHER_SCALE for world). */
  role: Role;
  /** The hat's top, the chin, half the head's width with the brim, the mitten's y on its arm. */
  topY: number;
  chinY: number;
  headHalf: number;
  handY: number;
  sitDrop: number;
  sitLeg: number;
  marker: Mesh;
  /** Round 25: the soft dark contact shadow on the ground under the fisher. */
  contact: Mesh;
  markerMat: MeshBasicMaterial;
  tag: Sprite;
  tagMat: SpriteMaterial;
  /** The pill's width as a fraction of the tag sprite's width. */
  tagFrac: number;
  setName(name: string | null): void;
  dispose(): void;
};

const HAIR = [0x5a3420, 0xd9a650, 0x6a3a1e, 0xa4522c];
const TROUSERS = [0x7a6a44, 0x6a5a3a, 0x5a6a8a, 0x8a5a4a];
/** Round 24: the shirt under the vest, and the bandana's colour by the seat colour (concept 08). */
const SHIRT = 0xece0c6;
const BANDANA: Record<string, number> = { green: 0xd65a3c, yellow: 0x8a62b4, blue: 0xd65a3c, pink: 0xeea6c4 };
const SKIN = 0xf4cbb0;
const HAT_STYLE = ["green", "yellow", "blue", "pink"];

function part(g: BufferGeometry, color: number, top?: number, kind?: PaintKind): BufferGeometry {
  const p = paint(prep(g), color, top);
  return kind === undefined ? p : surf(p, kind);
}
/**
 * Clothes (round 15): the painted fishers' kit, neutral and tinted by the vertex colour (the seat colour):
 * quilted coats and sleeves, felt hats and trousers, leather boots, belts and packs, knitted collars and trim.
 */
function quilt(g: BufferGeometry, color: number, top?: number): BufferGeometry {
  return part(g, color, top, PK.quilt);
}
function felt(g: BufferGeometry, color: number, top?: number): BufferGeometry {
  return part(g, color, top, PK.felt);
}
function leather(g: BufferGeometry, color: number, top?: number): BufferGeometry {
  return part(g, color, top, PK.leather);
}
function knit(g: BufferGeometry, color: number, top?: number): BufferGeometry {
  return part(g, color, top, PK.knit);
}

/** The figure's bulk in rest pose (figure space), by build: what shades what in the baked occlusion. */
function occludersOf(B: Build): Occluder[] {
  const legX = B.torsoW * 0.44;
  const legY = B.hip * 0.6;
  return [
    { c: new Vector3(0, B.neckY + 0.24 * B.headS, 0), r: 0.25 * B.headS },
    { c: new Vector3(0, B.torsoY, 0), r: Math.min(B.torsoW, B.torsoH) },
    { c: new Vector3(B.shoulderX, B.shoulderY - B.armLen * 0.5, 0), r: 0.06 },
    { c: new Vector3(-B.shoulderX, B.shoulderY - B.armLen * 0.5, 0), r: 0.06 },
    { c: new Vector3(legX, legY, 0), r: 0.065 },
    { c: new Vector3(-legX, legY, 0), r: 0.065 },
    { c: new Vector3(0, B.torsoY + B.torsoH * 0.2, -B.torsoD - 0.03), r: 0.1 },
  ];
}

/**
 * Round 24: the torso turned on a lathe, centred on 0. A grown-up: hips, a waist, a broad chest and square
 * shoulders. A kid: a round tummy fuller low down, narrow shoulders.
 */
function torsoGeometry(B: Build, role: Role, shell: { from: number; to: number; grow: number; gap: number } | null = null): BufferGeometry {
  const pts: Vector2[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    let r: number;
    if (role === "adult") {
      // bottom round-off, hips 0.9, waist 0.84, chest 1.0, shoulders 0.96, then round into the neck.
      // Round 25 (round 24 critic: "peg dolls"): a narrower waist (0.84 -> 0.78) under a fuller chest (1.0 ->
      // 1.06) and squarer shoulders (0.94 -> 1.0), so the figure reads with shoulders and a waist, not a tube.
      const prof = t < -0.8 ? 0.9 * Math.sqrt(Math.max(0, 1 - ((t + 0.8) / 0.2) ** 2)) : t < -0.3 ? 0.9 - 0.12 * ((t + 0.8) / 0.5) : t < 0.45 ? 0.78 + 0.28 * Math.sin(((t + 0.3) / 0.75) * (Math.PI / 2)) : t < 0.8 ? 1.06 - 0.06 * ((t - 0.45) / 0.35) : 1.0 * Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) + 0.0;
      r = prof;
    } else {
      // A bean: fuller below the middle.
      const u = t + 0.18;
      r = Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.12 * Math.max(0, u));
    }
    pts.push(new Vector2(Math.max(0.001, r * B.torsoW), t * B.torsoH));
  }
  if (shell) {
    // A garment over the torso (the vest): only from..to of the height, a little bigger, open down the front.
    const sp = pts.filter((p) => p.y >= shell.from * B.torsoH && p.y <= shell.to * B.torsoH).map((p) => new Vector2(p.x * shell.grow + 0.004, p.y));
    return new LatheGeometry(sp, 20, shell.gap, Math.PI * 2 - shell.gap * 2).scale(1, 1, B.torsoD / B.torsoW);
  }
  pts[0]!.x = 0;
  pts[N]!.x = 0;
  return new LatheGeometry(pts, 18).scale(1, 1, B.torsoD / B.torsoW);
}
/** Skin (round 16): painted skin, a faint mottle and a warm shade (see painter.ts), never vinyl. */
function skin(g: BufferGeometry, color: number, top?: number): BufferGeometry {
  return part(g, color, top, PK.skin);
}
/** The face's features (eyes, shines, smile, glasses, freckles): no painted detail (clean, readable faces). */
function feature(g: BufferGeometry, color: number): BufferGeometry {
  return part(g, color, undefined, PK.none);
}

/**
 * Round 16: the hat brim's soft shadow across the brow and a little occlusion under the chin, baked into the
 * skull's vertex colours (head space: the skull's centre at y 0.24, the brim from ~0.32 up).
 */
function underBrim(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute("position");
  const col = g.getAttribute("color");
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = (1 - 0.24 * sm(0.3, 0.42, y)) * (1 - 0.22 * sm(0.1, 0.0, y));
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return g;
}

function hatGeometry(seat: number, color: number): BufferGeometry {
  const c = new Color(color);
  const dark = c.clone().multiplyScalar(0.72).getHex();
  const light = c.clone().lerp(new Color(0xffffff), 0.25).getHex();
  const parts: BufferGeometry[] = [];
  if (seat === 0) {
    // Bucket hat.
    parts.push(felt(new CylinderGeometry(0.17, 0.215, 0.15, 14).translate(0, 0.37, 0), dark, light));
    parts.push(felt(waveBrim(new CylinderGeometry(0.22, 0.31, 0.07, 32, 1, true), 0.22, 0.31, 0.022, seat).translate(0, 0.28, 0), color, light));
    parts.push(felt(new CylinderGeometry(0.175, 0.175, 0.008, 14).translate(0, 0.445, 0), light));
    parts.push(leather(new TorusGeometry(0.205, 0.022, 5, 16).rotateX(Math.PI / 2).translate(0, 0.32, 0), 0x6a4a2a));
  } else if (seat === 1) {
    // Rain hat: a dome and a brim longer at the back.
    parts.push(felt(new SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.28, -0.01), color, light));
    parts.push(felt(waveBrim(new CylinderGeometry(0.22, 0.29, 0.08, 32, 1, true), 0.22, 0.29, 0.02, seat).scale(1, 1, 1.1).translate(0, 0.25, -0.04), dark, color));
    parts.push(felt(new CylinderGeometry(0.02, 0.02, 0.02, 6).translate(0, 0.47, 0), dark));
  } else if (seat === 2) {
    // Wide sun hat with a band (the blue one; Juneau's in the concept art).
    parts.push(felt(new CylinderGeometry(0.16, 0.2, 0.17, 14).translate(0, 0.38, 0), color, light));
    parts.push(felt(waveBrim(new CylinderGeometry(0.2, 0.32, 0.05, 36), 0.2, 0.32, 0.028, seat).translate(0, 0.29, 0), dark, color));
    parts.push(knit(new TorusGeometry(0.195, 0.026, 5, 16).rotateX(Math.PI / 2).translate(0, 0.32, 0), 0x1f3a7a));
  } else {
    // Flower hat.
    parts.push(felt(new SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1).translate(0, 0.29, 0), color, light));
    parts.push(felt(waveBrim(new CylinderGeometry(0.21, 0.3, 0.05, 36), 0.21, 0.3, 0.024, seat).translate(0, 0.28, 0), dark, color));
    parts.push(knit(new TorusGeometry(0.2, 0.024, 5, 16).rotateX(Math.PI / 2).translate(0, 0.31, 0), 0xffffff));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(felt(new SphereGeometry(0.045, 7, 5).scale(1, 0.6, 1).translate(0.15 + Math.cos(a) * 0.05, 0.38 + Math.sin(a) * 0.05, 0.12).rotateY(0.3), 0xffffff, 0xffe8f2));
    }
    parts.push(felt(new SphereGeometry(0.03, 6, 4).translate(0.15, 0.38, 0.14).rotateY(0.3), 0xffcc33));
  }
  return merge(parts);
}

function rodGeometry(tier: number, seg: number): BufferGeometry {
  const L = ROD_LEN / ROD_SEGMENTS;
  const r0 = 0.03 * (1 - seg * 0.18);
  const r1 = 0.03 * (1 - (seg + 1) * 0.18);
  const parts: BufferGeometry[] = [];
  const cols = [
    [0x6a4a2a, 0x8a6a3a],
    [0xc8a858, 0xe0c878],
    [0x5a2e18, 0x8a4a28],
    [0xbfe0ff, 0xffffff],
  ][tier]!;
  parts.push(part(new CylinderGeometry(r1, r0, L, 7).translate(0, L / 2, 0), cols[0]!, cols[1], tier < 3 ? PK.rodwood : undefined));
  if (tier === 0 && seg === 1) parts.push(part(new SphereGeometry(0.035, 6, 4).scale(1, 0.4, 1.6).translate(0.04, L * 0.5, 0), 0x6aa040));
  if (tier === 0 && seg === 2) parts.push(part(new SphereGeometry(0.03, 6, 4).scale(1.6, 0.4, 1).translate(-0.035, L * 0.3, 0), 0x7ab048));
  if (tier === 1) for (let k = 1; k <= 2; k++) parts.push(part(new CylinderGeometry(r0 * 1.25, r0 * 1.25, 0.025, 7).translate(0, (L * k) / 3, 0), 0x9a7a38));
  if (tier >= 2 && seg === 0) {
    parts.push(part(new CylinderGeometry(r0 * 1.5, r0 * 1.6, L * 0.45, 8).translate(0, L * 0.22, 0), tier === 2 ? 0xc8a070 : 0xe8f4ff));
    parts.push(part(new CylinderGeometry(0.065, 0.065, 0.05, 12).rotateZ(Math.PI / 2).translate(0.07, L * 0.55, 0), tier === 2 ? 0xe8b840 : 0xffffff));
    parts.push(part(new TorusGeometry(0.06, 0.012, 5, 12).rotateY(Math.PI / 2).translate(0.07, L * 0.55, 0), tier === 2 ? 0xb88820 : 0xcfe8ff));
  }
  if (tier >= 2 && seg > 0) parts.push(part(new TorusGeometry(0.022, 0.006, 4, 8).translate(0, L * 0.6, 0.02), tier === 2 ? 0xe8b840 : 0xffffff));
  if (tier === 3 && seg === ROD_SEGMENTS - 1) {
    // A little four-point star at the tip (geometry, not a face).
    parts.push(part(new ConeGeometry(0.03, 0.14, 4).translate(0, L + 0.07, 0), 0xffffff));
    parts.push(part(new ConeGeometry(0.03, 0.14, 4).rotateZ(Math.PI).translate(0, L - 0.07, 0), 0xffffff));
    parts.push(part(new ConeGeometry(0.03, 0.14, 4).rotateZ(Math.PI / 2).translate(-0.07, L, 0), 0xffffff));
    parts.push(part(new ConeGeometry(0.03, 0.14, 4).rotateZ(-Math.PI / 2).translate(0.07, L, 0), 0xffffff));
  }
  return merge(parts);
}

/** Round 25: the torso's radius (figure units, across) at height y above the torso's centre (same profile as torsoGeometry). */
function torsoRadiusAt(B: Build, role: Role, y: number): number {
  const g = torsoGeometry(B, role);
  const pos = g.getAttribute("position");
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.abs(pos.getY(i) - y);
    if (d < bestD - 1e-6 || (Math.abs(d - bestD) < 1e-6 && Math.hypot(pos.getX(i), pos.getZ(i) * (B.torsoW / B.torsoD)) > best)) {
      bestD = d;
      best = Math.hypot(pos.getX(i), pos.getZ(i) * (B.torsoW / B.torsoD));
    }
  }
  g.dispose();
  return best;
}

/** Round 25: a point on the vest's surface at angle phi (0 = the front) and height y over the torso's centre. */
function onVest(B: Build, role: Role, phi: number, y: number, grow: number, out = 0.006): Vector3 {
  const r = torsoRadiusAt(B, role, y) * grow + out;
  return new Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r * (B.torsoD / B.torsoW));
}

/** Round 25: the contact shadow's disc (unit radius, flat on the ground) and its shared material. */
const CONTACT_GEO = new CircleGeometry(1, 28).rotateX(-Math.PI / 2);
let contactMat: MeshBasicMaterial | null = null;
function contactMaterial(): MeshBasicMaterial {
  if (contactMat) return contactMat;
  const cv = typeof document === "undefined" ? null : document.createElement("canvas");
  const m = new MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0.55, depthWrite: false });
  if (cv) {
    cv.width = 64;
    cv.height = 64;
    const ctx = cv.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.75)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      const t = new CanvasTexture(cv);
      m.alphaMap = t;
    }
  }
  contactMat = m;
  return m;
}

/** Shared materials for every fisher (compiled once). */
export type RigMaterials = { body: MeshLambertMaterial; glowRod: MeshBasicMaterial };

/** Draws the name pill; returns its width as a fraction of the canvas width. */
function tagTexture(name: string | null, color: number, canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 1;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const label = (name ?? "").trim().slice(0, 12);
  ctx.font = "800 66px 'Baloo 2', 'Avenir Next Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif";
  const tw = label ? ctx.measureText(label).width : 0;
  const pw = Math.min(w - 8, Math.max(h - 8, tw + 56));
  const x0 = (w - pw) / 2;
  const r = (h - 12) / 2;
  ctx.beginPath();
  ctx.roundRect(x0, 6, pw, h - 12, r);
  ctx.fillStyle = "rgba(20,30,40,0.35)";
  ctx.save();
  ctx.translate(0, 4);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(x0, 6, pw, h - 12, r);
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();
  if (label) {
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.strokeText(label, w / 2, h / 2 + 3);
    ctx.fillText(label, w / 2, h / 2 + 3);
  }
  return pw / w;
}

export function buildFisher(seat: number, colorName: string, mats: RigMaterials, role: Role = "kid"): FisherRig {
  const color = SEAT_HEX[colorName] ?? 0x888888;
  const vest = new Color(color);
  const B = BUILDS[role];
  const geos: BufferGeometry[] = [];
  const mesh = (g: BufferGeometry, m: Material = mats.body) => {
    geos.push(g);
    const x = new Mesh(g, m);
    x.castShadow = true;
    return x;
  };
  const root = new Group();
  root.name = `fisher-${seat}`;
  root.scale.setScalar(FISHER_SCALE);
  const body = new Group();
  root.add(body);
  const occluders = occludersOf(B);
  const shaded = (g: BufferGeometry, at: Vector3 = new Vector3()) => bakeFigure(g, at, occluders);

  // Round 24: built by role (fisherBuild.ts): grown-ups tall with long legs and a smaller head, kids small
  // and chunky with a big head, the little one smaller still.
  const shade = (hex: number, k: number) => new Color(hex).multiplyScalar(k).getHex();
  const lighten = (hex: number, k: number) => new Color(hex).lerp(new Color(0xffffff), k).getHex();

  // Legs (pivot at the hip): trousers down to big round boots.
  const mkLeg = (sx: number) => {
    const pivot = new Group();
    pivot.position.set(sx * B.torsoW * 0.44, B.hip, 0);
    const bs = B.boot;
    const legLen = B.hip - 0.085 * bs;
    const leg = felt(new CylinderGeometry(B.legR, B.legR * 0.92, legLen, 9).translate(0, -legLen / 2, 0), TROUSERS[seat]!);
    const boot = leather(new SphereGeometry(0.078 * bs, 12, 8).scale(1, 0.72, 1.3).translate(0, -B.hip + 0.055 * bs, 0.025 * bs), 0x5a3420, 0x8a5634);
    const shaft = leather(new CylinderGeometry(B.legR * 1.12, 0.07 * bs, 0.07 * bs, 10).translate(0, -B.hip + 0.1 * bs, 0), 0x5a3420, 0x7a4a2c);
    const sole = leather(new CylinderGeometry(0.075 * bs, 0.08 * bs, 0.025 * bs, 12).scale(1, 1, 1.3).translate(0, -B.hip + 0.0125 * bs, 0.025 * bs), 0x3a2418);
    // Round 24 (concept 08): a turned-down boot cuff and a darker patch on each knee.
    const bootCuff = leather(new TorusGeometry(B.legR * 1.14, 0.014 * bs, 5, 14).rotateX(Math.PI / 2).translate(0, -B.hip + 0.138 * bs, 0), 0x8a5a36);
    const kneeY = -legLen * 0.52;
    const knee = felt(new SphereGeometry(B.legR * 0.8, 9, 6).scale(1, 1.15, 0.45).translate(0, kneeY, B.legR * 0.86), shade(TROUSERS[seat]!, 0.72));
    pivot.add(mesh(shaded(merge([leg, knee, boot, shaft, bootCuff, sole]), pivot.position)));
    body.add(pivot);
    return pivot;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  // Body: a torso turned on a lathe (an adult's chest and waist, a kid's round tummy), collar, belt, a pack.
  // Round 24 (concept 08): a cream shirt under an open vest in the seat colour with two chest pockets, a
  // bandana knotted at the neck, a belt with pouches (was a smooth bean in the seat colour with a fluffy collar).
  // A kid's shirt in a light tint of the seat colour (Juneau's blue sleeves in the concept), a grown-up's cream.
  const shirt = role === "adult" ? SHIRT : new Color(SHIRT).lerp(vest, 0.45).getHex();
  const torso = part(torsoGeometry(B, role).translate(0, B.torsoY, 0), shade(shirt, 0.86), shirt, PK.cloth);
  // Round 25 (round 24 critic: "flat colour blocks, Mom's vest a solid orange slab"): the vest is painted
  // canvas with folds (darker at the hem and the sides, a lighter breast, soft creases), piped in a dark
  // stitched edge down the opening and round the hem, and crossed by a leather strap from the shoulder to the
  // hip; the pockets have big flaps with a button.
  const vestShellSpec = { from: -0.62, to: 0.84, grow: 1.07, gap: role === "adult" ? 0.34 : 0.24 };
  const vestHex = vest.getHex();
  const vestShell = surf(paint(prep(torsoGeometry(B, role, vestShellSpec).translate(0, B.torsoY, 0)), shade(vestHex, 0.5), shade(vestHex, 0.86), (p, n, c) => {
    const ty = (p.y - B.torsoY) / B.torsoH;
    c.multiplyScalar(0.86 + 0.18 * Math.max(0, n.z) - 0.12 * Math.abs(n.x));
    c.multiplyScalar(0.9 + 0.2 * vnoise(p.x * 18, p.y * 9, seat + 3) - 0.08 * Math.max(0, -ty - 0.4));
  }), PK.cloth);
  const edge = shade(vestHex, 0.38);
  const piping: BufferGeometry[] = [];
  for (const sg of [-1, 1]) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 10; i++) pts.push(onVest(B, role, sg * vestShellSpec.gap, B.torsoH * (vestShellSpec.from + (vestShellSpec.to - vestShellSpec.from) * (i / 10)), vestShellSpec.grow, 0.004).add(new Vector3(0, B.torsoY, 0)));
    piping.push(part(new TubeGeometry(new CatmullRomCurve3(pts), 12, 0.011, 5, false), edge, edge, PK.leather));
  }
  {
    const pts: Vector3[] = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const phi = vestShellSpec.gap + (Math.PI * 2 - vestShellSpec.gap * 2) * (i / n);
      pts.push(onVest(B, role, phi, B.torsoH * (vestShellSpec.from + 0.03), vestShellSpec.grow, 0.004).add(new Vector3(0, B.torsoY, 0)));
    }
    piping.push(part(new TubeGeometry(new CatmullRomCurve3(pts), 36, 0.012, 5, false), edge, edge, PK.leather));
  }
  // The strap: from the left shoulder's front down across the chest to the right hip, over the vest.
  const strapPts: Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    const y = B.torsoH * (0.82 - 1.32 * k);
    const phi = 0.95 - 1.9 * k;
    strapPts.push(onVest(B, role, phi, y, vestShellSpec.grow, 0.022).add(new Vector3(0, B.torsoY, 0)));
  }
  const strap = leather(new TubeGeometry(new CatmullRomCurve3(strapPts), 20, 0.022, 5, false), 0x6a4024, 0x8a5634);
  const strapMid = onVest(B, role, 0.95 - 1.9 * 0.42, B.torsoH * (0.82 - 1.32 * 0.42), vestShellSpec.grow, 0.036).add(new Vector3(0, B.torsoY, 0));
  const strapBuckle = part(new BoxGeometry(0.045, 0.04, 0.02).rotateZ(-0.7).translate(strapMid.x, strapMid.y, strapMid.z), 0xd8b040);
  const pockets: BufferGeometry[] = [];
  for (const sx of [1, -1]) {
    const px = sx * B.torsoW * 0.5;
    const py = B.torsoY + B.torsoH * 0.18;
    const pz = Math.sqrt(Math.max(0, 1 - 0.25)) * B.torsoD * 1.07;
    pockets.push(felt(new BoxGeometry(B.torsoW * 0.42, B.torsoH * 0.36, 0.03).rotateY(sx * 0.5).translate(px, py, pz), shade(vest.getHex(), 0.8)));
    pockets.push(felt(new BoxGeometry(B.torsoW * 0.5, B.torsoH * 0.15, 0.04).rotateY(sx * 0.5).translate(px, py + B.torsoH * 0.17, pz + 0.008), shade(vest.getHex(), 0.5)));
    pockets.push(part(new SphereGeometry(0.014, 6, 4).translate(px + sx * 0.004, py + B.torsoH * 0.12, pz + 0.03), 0xe0c070));
  }
  const collarY = B.torsoY + B.torsoH * 0.96;
  const scarf = BANDANA[colorName] ?? 0xd8553a;
  const bandana = merge([
    part(new TorusGeometry(B.torsoW * 0.5, 0.03, 6, 16).rotateX(Math.PI / 2).translate(0, collarY, 0.01), shade(scarf, 0.8), scarf, PK.cloth),
    part(new ConeGeometry(B.torsoW * 0.42, B.torsoH * 0.5, 3).rotateZ(Math.PI).rotateY(Math.PI).scale(1, 1, 0.35).translate(0, collarY - B.torsoH * 0.22, B.torsoD * 0.78), shade(scarf, 0.78), scarf, PK.cloth),
  ]);
  const pouches = [1, -1].map((sx) => leather(new BoxGeometry(0.075, 0.08, 0.05).translate(sx * B.torsoW * 0.78, B.torsoY - B.torsoH * 0.62, B.torsoD * 0.55), 0x7a4a26, 0x9a6438));
  const beltY = B.torsoY - B.torsoH * 0.55;
  const beltR = B.torsoW * 0.97;
  const belt = leather(new TorusGeometry(beltR, 0.026, 6, 20).rotateX(Math.PI / 2).scale(1, 1, B.torsoD / B.torsoW).translate(0, beltY, 0), 0x5a3a22);
  const buckle = part(new BoxGeometry(0.06, 0.05, 0.025).translate(0, beltY, B.torsoD * 0.98 + 0.01), 0xe8c050);
  const packY = B.torsoY + B.torsoH * 0.2;
  const pack = leather(new SphereGeometry(0.13, 10, 8).scale(1, 1.05, 0.62).translate(0, packY, -B.torsoD - 0.04), 0x8a5a32, 0xb07a48);
  const roll = knit(new CylinderGeometry(0.05, 0.05, 0.26, 10).rotateZ(Math.PI / 2).translate(0, packY + 0.14, -B.torsoD - 0.04), 0xd8c49a);
  body.add(mesh(merge([shaded(merge([torso, vestShell, ...piping, strap, ...pockets, bandana, belt, ...pouches, pack, roll])), buckle, strapBuckle])));

  // Arms (pivot at the shoulder; hang along -y): sleeves and mittens.
  const armS = B.armR / 0.05;
  const handY = -B.armLen - 0.035 * armS;
  const mkArm = (sx: number) => {
    const pivot = new Group();
    pivot.position.set(sx * B.shoulderX, B.shoulderY, 0);
    const sl = B.armLen - 0.02;
    // Round 24: shirt sleeves; a grown-up's rolled to the elbow (bare forearm under a cream roll).
    const rolled = role === "adult";
    const sleeveLen = rolled ? sl * 0.55 : sl;
    const sleeve = part(new CylinderGeometry(B.armR * 1.1, B.armR, sleeveLen, 9).translate(0, -sleeveLen / 2, 0), shade(shirt, 0.88), shirt, PK.cloth);
    const shoulder = part(new SphereGeometry(B.armR * 1.16, 9, 6), shirt, undefined, PK.cloth);
    const forearm = rolled ? [skin(new CylinderGeometry(B.armR * 0.82, B.armR * 0.72, sl - sleeveLen + 0.01, 9).translate(0, -sleeveLen - (sl - sleeveLen) / 2, 0), SKIN)] : [];
    const cuff = part(new TorusGeometry(B.armR * (rolled ? 1.08 : 1.0), rolled ? 0.024 : 0.016, 5, 12).rotateX(Math.PI / 2).translate(0, rolled ? -sleeveLen : -B.armLen + 0.005, 0), lighten(shirt, 0.1), undefined, PK.cloth);
    const hand = skin(new SphereGeometry(0.058 * armS, 10, 7).scale(1, 1.08, 0.82).translate(0, handY, 0), SKIN);
    const thumb = skin(new SphereGeometry(0.026 * armS, 7, 5).scale(1, 1.3, 1).translate(-sx * 0.04 * armS, handY + 0.015, 0.03), SKIN);
    pivot.add(mesh(merge([shaded(merge([shoulder, sleeve, cuff]), pivot.position), ...forearm, hand, thumb])));
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);
  const hand = new Object3D();
  hand.position.set(0, handY, 0.0);
  armR.add(hand);

  // Head: big and round, a simple friendly face (two eyes with shines, rosy cheeks, a small smile), hair, the hat.
  const head = new Group();
  head.position.set(0, B.neckY, 0);
  head.scale.setScalar(B.headS);
  body.add(head);
  const HR = 0.25;
  // Round 24: a shaped head (fisherFace.ts: a kid's full cheeks, a grown-up's longer face and jaw), not a ball;
  // the skull, hair and every feature go through the same shape so the face sits on it.
  const shape = { adult: role === "adult" };
  const kidFace = role !== "adult";
  const shaped = (g: BufferGeometry): BufferGeometry => {
    const pos = g.getAttribute("position");
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      shapeHead(v.fromBufferAttribute(pos, i), shape, v);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  };
  const at = (x: number, y: number, z: number) => shapeHead(new Vector3(x, y, z), shape);
  const skull = paintSkull(underBrim(skin(shaped(new SphereGeometry(HR, 26, 18).translate(0, 0.24, 0)), SKIN, lighten(SKIN, 0.08))));
  // Hair (round 19): painted in strands (the rod wood's streaks run along it) with a ragged edge of locks
  // (sideburns, a fringe of three under the brim, locks round the back below the hat), not a smooth cap.
  const hairHex = HAIR[seat]!;
  const hair = part(shaped(new SphereGeometry(HR + 0.014, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateX(-0.75).translate(0, 0.25, -0.02)), shade(hairHex, 0.85), lighten(hairHex, 0.12), PK.rodwood);
  const fringe = merge(
    hairLocks(seat).map((l) => {
      const p = at(l.at.x, l.at.y, l.at.z);
      return part(
        new SphereGeometry(l.size, 8, 6)
          .scale(l.scale.x, l.scale.y, l.scale.z)
          .rotateX(l.rot.x === 0 ? -0.35 : l.rot.x)
          .rotateZ(l.rot.z)
          .rotateY(l.rot.y)
          .translate(p.x, p.y, p.z),
        lighten(hairHex, 0.06),
        shade(hairHex, 0.8),
        PK.rodwood,
      );
    }),
  );
  const ears = [1, -1].map((sx) => {
    const p = at(sx * HR, 0.22, 0);
    return skin(new SphereGeometry(0.055, 9, 7).scale(0.5, 1, 0.85).translate(p.x, p.y, p.z), SKIN, lighten(SKIN, 0.05));
  });
  // Eyes (concept 08): a white with a brown iris, a pupil and two shines, an upper lid line, lashes at the
  // outer corner for Mom and the kids; brows above in the hair's colour. Natural faces only.
  const lidHex = 0x3a2016;
  const eyeY = shape.adult ? 0.262 : 0.248;
  const eyeX = shape.adult ? 0.085 : 0.092;
  const eyeR = shape.adult ? 0.04 : 0.047;
  const lashes = colorName !== "green";
  const eyeParts: BufferGeometry[] = [];
  const eyeAt: Vector3[] = [];
  for (const sx of [1, -1]) {
    const c = onFace(sx * eyeX, eyeY, shape, -0.004);
    eyeAt.push(c);
    eyeParts.push(feature(new SphereGeometry(eyeR, 12, 9).scale(1, 1.12, 0.4).translate(c.x, c.y, c.z), 0xfaf4ec));
    eyeParts.push(feature(new SphereGeometry(eyeR * 0.74, 12, 9).scale(1, 1.08, 0.36).translate(c.x - sx * 0.004, c.y - 0.003, c.z + 0.009), 0x6a3c1e));
    eyeParts.push(feature(new SphereGeometry(eyeR * 0.4, 9, 7).scale(1, 1.08, 0.3).translate(c.x - sx * 0.004, c.y - 0.003, c.z + 0.016), 0x1a100a));
    eyeParts.push(feature(new SphereGeometry(eyeR * 0.24, 6, 5).translate(c.x - sx * 0.004 + eyeR * 0.28, c.y + eyeR * 0.34, c.z + 0.022), 0xffffff));
    eyeParts.push(feature(new SphereGeometry(eyeR * 0.12, 5, 4).translate(c.x - sx * 0.004 - eyeR * 0.25, c.y - eyeR * 0.3, c.z + 0.021), 0xffffff));
    // The upper lid: a dark arc over the top of the white.
    const arc = Math.PI * 0.86;
    eyeParts.push(feature(new TorusGeometry(eyeR * 1.02, eyeR * 0.17, 4, 14, arc).rotateZ(Math.PI / 2 - arc / 2).scale(1, 1.12, 1).translate(c.x, c.y + 0.002, c.z + 0.008), lidHex));
    if (lashes) {
      for (let k = 0; k < 2; k++) {
        const a = Math.PI / 2 - sx * (0.95 + k * 0.32);
        eyeParts.push(feature(new ConeGeometry(eyeR * 0.13, eyeR * 0.5, 4).translate(0, eyeR * 0.25, 0).rotateZ(a - Math.PI / 2 + sx * 0.25).translate(c.x + Math.cos(a) * eyeR * 1.05, c.y + Math.sin(a) * eyeR * 1.17, c.z + 0.008), lidHex));
      }
    }
    // A painted brow, arched, in the hair's colour (a grown-up's heavier).
    const b = onFace(sx * (eyeX + 0.004), eyeY + eyeR * 1.85, shape, 0.002);
    eyeParts.push(feature(new SphereGeometry(eyeR * 1.15, 9, 5).scale(1, shape.adult ? 0.26 : 0.2, 0.22).rotateZ(-sx * 0.14).translate(b.x, b.y, b.z), shade(hairHex, 0.75)));
  }
  // Soft blush (round 16): half way from the skin to rose, and flatter, so it reads as warmth, not a sticker.
  const cheeks = [1, -1].map((sx) => {
    const p = onFace(sx * 0.15, shape.adult ? 0.185 : 0.18, shape, -0.012);
    return skin(new SphereGeometry(0.046, 9, 6).scale(1, 0.62, 0.3).translate(p.x, p.y, p.z), new Color(SKIN).lerp(new Color(0xf08878), 0.45).getHex());
  });
  const mouthY = shape.adult ? 0.15 : 0.168;
  const beard = colorName === "green" && shape.adult;
  const m = onFace(0, mouthY, shape, beard ? 0.03 : 0.0);
  const smile = feature(new TorusGeometry(kidFace ? 0.042 : 0.036, 0.011, 5, 12, Math.PI).rotateZ(Math.PI).rotateX(-0.35).translate(m.x, m.y + 0.01, m.z), 0x8a3a2a);
  const np = onFace(0, shape.adult ? 0.205 : 0.212, shape, 0.004);
  const nr = shape.adult ? (beard ? 0.046 : 0.036) : 0.03;
  const nose = skin(new SphereGeometry(nr, 10, 8).scale(1, 0.88, 0.8).translate(np.x, np.y, np.z), new Color(SKIN).lerp(new Color(0xf0a088), 0.3).getHex(), lighten(SKIN, 0.05));
  const eyes = eyeParts;
  const shines: BufferGeometry[] = [];
  // The hat style follows the colour the player picked (blue is always the sun hat), not the seat.
  const style = Math.max(0, HAT_STYLE.indexOf(colorName));
  // Scaled up for the bigger head and tipped back so the brim never hides the face (lifted on a longer head).
  const hat = shaded(hatGeometry(style, color).scale(1.16, 1.16, 1.16).translate(0, 0.0, 0).rotateX(-0.28).translate(0, 0.03 + crownLift(shape), -0.02), head.position);
  // One gentle trait each, by colour, so the family tell each other apart at a glance.
  const traits: BufferGeometry[] = [];
  if (beard) {
    // Dad's beard (concept 08): a full beard over the jaw and up the cheeks to the ears, painted in strands
    // (rod wood streaks run down it), a ragged lower edge of locks and a moustache over the smile.
    traits.push(part(shaped(new SphereGeometry(HR + 0.022, 22, 12, Math.PI / 2 - 1.45, 2.9, Math.PI * 0.55, Math.PI * 0.4).translate(0, 0.24, 0)), shade(hairHex, 0.85), lighten(hairHex, 0.12), PK.rodwood));
    for (let k = 0; k < 9; k++) {
      const a = Math.PI / 2 + (k - 4) * 0.3;
      const p = at(Math.cos(a) * 0.17, 0.05 + Math.abs(k - 4) * 0.02, Math.sin(a) * 0.17);
      traits.push(part(new SphereGeometry(0.045, 8, 6).scale(0.7, 1.7, 0.6).rotateX(0.25).rotateY(-a + Math.PI / 2).translate(p.x, p.y - 0.02, p.z), lighten(hairHex, 0.05), shade(hairHex, 0.75), PK.rodwood));
    }
    for (const sx of [1, -1]) {
      const p = onFace(sx * 0.042, mouthY + 0.035, shape, 0.03);
      traits.push(part(new SphereGeometry(0.042, 9, 6).scale(1.35, 0.55, 0.6).rotateZ(sx * 0.32).translate(p.x, p.y, p.z), hairHex, lighten(hairHex, 0.1), PK.rodwood));
    }
  } else if (colorName === "pink") {
    // A braid down the back with a little bow.
    for (let i = 0; i < 5; i++) traits.push(part(new SphereGeometry(0.058 - i * 0.004, 9, 7).translate(0.04 + i * 0.012, 0.2 - i * 0.075, -0.24 - i * 0.012), HAIR[seat]!, lighten(HAIR[seat]!, 0.12)));
    traits.push(part(new SphereGeometry(0.04, 8, 6).scale(1.8, 0.8, 0.6).translate(0.09, -0.17, -0.3), color));
  } else if (colorName === "yellow") {
    // Round glasses round the eyes.
    for (const c of eyeAt) traits.push(feature(new TorusGeometry(eyeR * 1.42, 0.01, 6, 18).translate(c.x, c.y, c.z + 0.02), 0x3a2a24));
    const l = eyeAt[0]!;
    traits.push(feature(new CylinderGeometry(0.008, 0.008, Math.max(0.02, l.x * 2 - eyeR * 2.84), 5).rotateZ(Math.PI / 2).translate(0, l.y + 0.006, l.z + 0.026), 0x3a2a24));
  } else if (colorName === "blue") {
    // Freckles across the cheeks and nose.
    for (const [fx, fy] of [[0.13, 0.2], [0.165, 0.188], [0.12, 0.176], [0.05, 0.212]] as [number, number][]) {
      for (const sx of [1, -1]) {
        const p = onFace(sx * fx, fy, shape, 0.002);
        traits.push(feature(new SphereGeometry(0.009, 5, 4).translate(p.x, p.y, p.z), 0xb0603a));
      }
    }
  }
  head.add(mesh(merge([skull, hair, fringe, ...ears, ...eyes, ...shines, ...cheeks, smile, nose, hat, ...traits])));

  // Rods, one per tier; the scene shows the family's current one.
  const rods: RodRig[] = [];
  for (let tier = 0; tier < 4; tier++) {
    const rroot = new Group();
    // Placed every frame between the hand and the back (rodHand / rodBack).
    const pivots: Group[] = [];
    let parent: Object3D = rroot;
    for (let s = 0; s < ROD_SEGMENTS; s++) {
      const pv = new Group();
      if (s > 0) pv.position.y = ROD_LEN / ROD_SEGMENTS;
      pv.add(mesh(rodGeometry(tier, s), tier === 3 ? mats.glowRod : mats.body));
      parent.add(pv);
      pivots.push(pv);
      parent = pv;
    }
    // Round 24: a thin rod across a neighbour is not a body hidden (the lab's cover and stack checks skip it).
    rroot.userData.coverCheckSkip = true;
    const tip = new Object3D();
    tip.position.y = ROD_LEN / ROD_SEGMENTS;
    parent.add(tip);
    root.add(rroot);
    rods.push({ root: rroot, pivots, tip });
  }
  // The rod in the mitten: along the forearm's forward, its butt just behind the grip.
  const rodHand = new Object3D();
  rodHand.rotation.x = Math.PI / 2;
  rodHand.translateY(-0.12);
  hand.add(rodHand);
  // Over the right shoulder (round 21): the butt in the mitten at the chest, the rod resting on the shoulder,
  // its tip up and back over the pack, so it never points at the ground or out in front like a lance (round 20
  // session 100/131 s). The arm comes up to hold it (fishers.ts, SLING_ARM).
  const rodBack = new Object3D();
  rodBack.position.set(-B.shoulderX * 0.82, B.torsoY + B.torsoH * 0.25, B.torsoD + 0.04);
  rodBack.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0.22, 0.62, -0.76).normalize());
  body.add(rodBack);

  // The seat-coloured ring at the fisher's feet: the kid finds his own fisher by it.
  const ringGeo = new RingGeometry(0.42, 0.56, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const markerMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, blending: AdditiveBlending });
  const marker = new Mesh(ringGeo, markerMat);
  marker.position.y = 0.03;
  marker.renderOrder = 6;
  // Round 22: a ground decal, not the fisher's body: the lab's cover check leaves it out (grass tufts and
  // snow over the ring counted as scenery covering a fisher, 1.5-3 % of a body box).
  marker.userData.coverCheckSkip = true;
  geos.push(ringGeo);
  root.add(marker);

  // Round 25 (round 24 critic: "no cast shadows from fishers anywhere"): a soft dark contact shadow on the
  // ground under the feet, at every time of day (the sun's shadow map does not reach the fishers' feet from
  // the TV's view). One texture and one program for every fisher; a ground decal like the ring.
  const contact = new Mesh(CONTACT_GEO, contactMaterial());
  contact.position.y = 0.022;
  contact.scale.set(B.torsoW * 3.6, 1, B.torsoW * 3.2);
  contact.renderOrder = 5;
  contact.userData.coverCheckSkip = true;
  root.add(contact);

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const tagMat = new SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true });
  const tag = new Sprite(tagMat);
  tag.renderOrder = 30;
  // Drawn after the painterly post chain (see post.ts), so names stay sharp.
  tag.layers.set(TAG_LAYER);
  tag.center.set(0.5, 0);
  let lastName: string | null | undefined;
  const rig = {
    root,
    body,
    head,
    legL,
    legR,
    armL,
    armR,
    hand,
    rodHand,
    rodBack,
    rods,
    role,
    topY: figureTop(B),
    chinY: B.neckY + CHIN * B.headS,
    headHalf: HEAD_HALF * B.headS,
    handY,
    sitDrop: B.sitDrop,
    sitLeg: B.sitLeg,
    marker,
    contact,
    markerMat,
    tag,
    tagMat,
    tagFrac: 1,
    setName(name: string | null) {
      if (name === lastName) return;
      lastName = name;
      rig.tagFrac = tagTexture(name, color, canvas);
      tex.needsUpdate = true;
    },
    dispose() {
      for (const g of geos) g.dispose();
      markerMat.dispose();
      tex.dispose();
      tagMat.dispose();
    },
  };
  rig.setName(null);
  return rig;
}

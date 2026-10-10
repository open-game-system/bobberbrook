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
  BoxGeometry,
  type Material,
  type MeshLambertMaterial,
  Vector3,
} from "three";
import { TAG_LAYER } from "./post";
import { merge, paint, prep, surf } from "./geo";
import { bakeFigure, type Occluder } from "./figurePaint";
import { PK, type PaintKind } from "./painter";
import { SEAT_HEX } from "./types";

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
  rods: RodRig[];
  marker: Mesh;
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
const SKIN = 0xffd0ae;
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

/** The figure's bulk in rest pose (figure space): what shades what in the baked occlusion. */
const OCCLUDERS: Occluder[] = [
  { c: new Vector3(0, 0.8, 0), r: 0.25 },
  { c: new Vector3(0, 0.36, 0), r: 0.2 },
  { c: new Vector3(0.195, 0.41, 0), r: 0.06 },
  { c: new Vector3(-0.195, 0.41, 0), r: 0.06 },
  { c: new Vector3(0.085, 0.14, 0), r: 0.065 },
  { c: new Vector3(-0.085, 0.14, 0), r: 0.065 },
  { c: new Vector3(0, 0.4, -0.18), r: 0.1 },
];
/** Bakes the figure's occlusion and top light into a clothing part placed at `at` (its pivot) in the figure. */
const shaded = (g: BufferGeometry, at: Vector3 = new Vector3()) => bakeFigure(g, at, OCCLUDERS);
/** Skin and the face: no painted detail (clean, readable faces). */
function skin(g: BufferGeometry, color: number, top?: number): BufferGeometry {
  return part(g, color, top, PK.none);
}

function hatGeometry(seat: number, color: number): BufferGeometry {
  const c = new Color(color);
  const dark = c.clone().multiplyScalar(0.72).getHex();
  const light = c.clone().lerp(new Color(0xffffff), 0.25).getHex();
  const parts: BufferGeometry[] = [];
  if (seat === 0) {
    // Bucket hat.
    parts.push(felt(new CylinderGeometry(0.17, 0.215, 0.15, 14).translate(0, 0.37, 0), dark, light));
    parts.push(felt(new CylinderGeometry(0.22, 0.31, 0.07, 16, 1, true).translate(0, 0.28, 0), color, light));
    parts.push(felt(new CylinderGeometry(0.175, 0.175, 0.008, 14).translate(0, 0.445, 0), light));
    parts.push(leather(new TorusGeometry(0.205, 0.022, 5, 16).rotateX(Math.PI / 2).translate(0, 0.32, 0), 0x6a4a2a));
  } else if (seat === 1) {
    // Rain hat: a dome and a brim longer at the back.
    parts.push(felt(new SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.28, -0.01), color, light));
    parts.push(felt(new CylinderGeometry(0.22, 0.29, 0.08, 16, 1, true).scale(1, 1, 1.1).translate(0, 0.25, -0.04), dark, color));
    parts.push(felt(new CylinderGeometry(0.02, 0.02, 0.02, 6).translate(0, 0.47, 0), dark));
  } else if (seat === 2) {
    // Wide sun hat with a band (the blue one; Juneau's in the concept art).
    parts.push(felt(new CylinderGeometry(0.16, 0.2, 0.17, 14).translate(0, 0.38, 0), color, light));
    parts.push(felt(new CylinderGeometry(0.2, 0.32, 0.05, 18).translate(0, 0.29, 0), dark, color));
    parts.push(knit(new TorusGeometry(0.195, 0.026, 5, 16).rotateX(Math.PI / 2).translate(0, 0.32, 0), 0x1f3a7a));
  } else {
    // Flower hat.
    parts.push(felt(new SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1).translate(0, 0.29, 0), color, light));
    parts.push(felt(new CylinderGeometry(0.21, 0.3, 0.05, 18).translate(0, 0.28, 0), dark, color));
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

export function buildFisher(seat: number, colorName: string, mats: RigMaterials): FisherRig {
  const color = SEAT_HEX[colorName] ?? 0x888888;
  const vest = new Color(color);
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

  // A chunky, rounded little fisher (~1 unit tall before scaling): boots, a bean body, stubby arms
  // and a big round head (≈45 % of the height) with a simple friendly face.
  const shade = (hex: number, k: number) => new Color(hex).multiplyScalar(k).getHex();
  const lighten = (hex: number, k: number) => new Color(hex).lerp(new Color(0xffffff), k).getHex();

  // Legs (pivot at the hip): short trousers and big round boots.
  const mkLeg = (sx: number) => {
    const pivot = new Group();
    pivot.position.set(sx * 0.085, 0.2, 0);
    const leg = felt(new CylinderGeometry(0.062, 0.058, 0.12, 9).translate(0, -0.06, 0), TROUSERS[seat]!);
    const boot = leather(new SphereGeometry(0.078, 12, 8).scale(1, 0.72, 1.3).translate(0, -0.145, 0.025), 0x5a3420, 0x8a5634);
    const sole = leather(new CylinderGeometry(0.075, 0.08, 0.025, 12).scale(1, 1, 1.3).translate(0, -0.19, 0.025), 0x3a2418);
    pivot.add(mesh(shaded(merge([leg, boot, sole]), pivot.position)));
    body.add(pivot);
    return pivot;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  // Body: a rounded bean in the fisher's colour, cream collar, belt, a little backpack.
  const torso = quilt(new SphereGeometry(0.205, 18, 12).scale(1, 1.08, 0.92).translate(0, 0.36, 0), shade(vest.getHex(), 0.78), lighten(vest.getHex(), 0.12));
  // A belly panel only a shade lighter (round 09: at 35 % toward white it read as a white paint blotch).
  const tummy = quilt(new SphereGeometry(0.13, 12, 8).scale(1, 1.05, 0.5).translate(0, 0.33, 0.135), lighten(vest.getHex(), 0.12));
  const collar = knit(new TorusGeometry(0.11, 0.035, 6, 16).rotateX(Math.PI / 2).translate(0, 0.555, 0.01), 0xf4ead2);
  const belt = leather(new TorusGeometry(0.19, 0.026, 6, 20).rotateX(Math.PI / 2).scale(1, 1, 0.93).translate(0, 0.25, 0), 0x5a3a22);
  const buckle = part(new BoxGeometry(0.06, 0.05, 0.025).translate(0, 0.25, 0.185), 0xe8c050);
  const pack = leather(new SphereGeometry(0.13, 10, 8).scale(1, 1.05, 0.62).translate(0, 0.4, -0.18), 0x8a5a32, 0xb07a48);
  const roll = knit(new CylinderGeometry(0.05, 0.05, 0.26, 10).rotateZ(Math.PI / 2).translate(0, 0.54, -0.18), 0xd8c49a);
  body.add(mesh(merge([shaded(merge([torso, tummy, collar, belt, pack, roll])), buckle])));

  // Arms (pivot at the shoulder; hang along -y): stubby sleeves and round mittens.
  const mkArm = (sx: number) => {
    const pivot = new Group();
    pivot.position.set(sx * 0.195, 0.49, 0);
    const sleeve = quilt(new CylinderGeometry(0.056, 0.05, 0.15, 9).translate(0, -0.07, 0), shade(vest.getHex(), 0.9));
    const shoulder = quilt(new SphereGeometry(0.058, 9, 6), shade(vest.getHex(), 0.95));
    const hand = skin(new SphereGeometry(0.058, 10, 7).translate(0, -0.18, 0), SKIN);
    pivot.add(mesh(merge([shaded(merge([shoulder, sleeve]), pivot.position), hand])));
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);
  const hand = new Object3D();
  hand.position.set(0, -0.18, 0.0);
  armR.add(hand);

  // Head: big and round, a simple friendly face (two eyes with shines, rosy cheeks, a small smile), hair, the hat.
  const head = new Group();
  head.position.set(0, 0.56, 0);
  body.add(head);
  const HR = 0.25;
  const skull = skin(new SphereGeometry(HR, 22, 16).translate(0, 0.24, 0), SKIN, lighten(SKIN, 0.1));
  const hair = part(new SphereGeometry(HR + 0.012, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateX(-0.75).translate(0, 0.25, -0.02), HAIR[seat]!);
  // The fringe sits low on the brow, under the hat's brim (it used to poke through it).
  const fringe = part(new SphereGeometry(0.1, 10, 6).scale(1.5, 0.45, 0.7).translate(0, 0.375, 0.19), HAIR[seat]!);
  const ears = [1, -1].map((sx) => skin(new SphereGeometry(0.05, 8, 6).scale(0.55, 1, 0.9).translate(sx * HR, 0.22, 0), SKIN));
  const eyes = [1, -1].map((sx) => skin(new SphereGeometry(0.038, 10, 8).scale(0.85, 1.2, 0.45).translate(sx * 0.088, 0.255, 0.226), 0x24160f));
  const shines = [1, -1].map((sx) => skin(new SphereGeometry(0.013, 6, 4).translate(sx * 0.088 + 0.012, 0.272, 0.244), 0xffffff));
  const cheeks = [1, -1].map((sx) => skin(new SphereGeometry(0.042, 9, 6).scale(1, 0.62, 0.35).translate(sx * 0.145, 0.185, 0.2), 0xff8a86));
  const smile = skin(new TorusGeometry(0.045, 0.012, 5, 12, Math.PI).rotateZ(Math.PI).rotateX(-0.35).translate(0, 0.18, 0.236), 0x8a3a2a);
  const nose = skin(new SphereGeometry(0.024, 8, 6).translate(0, 0.215, 0.25), 0xffb896);
  // The hat style follows the colour the player picked (blue is always the sun hat), not the seat.
  const style = Math.max(0, HAT_STYLE.indexOf(colorName));
  // Scaled up for the bigger head and tipped back so the brim never hides the face.
  const hat = shaded(hatGeometry(style, color).scale(1.16, 1.16, 1.16).translate(0, 0.0, 0).rotateX(-0.28).translate(0, 0.03, -0.02), head.position);
  // One gentle trait each, by colour, so the family tell each other apart at a glance.
  const traits: BufferGeometry[] = [];
  if (colorName === "green") {
    // A round, soft beard under the smile.
    traits.push(part(new SphereGeometry(0.15, 14, 10).scale(1.15, 0.8, 0.75).translate(0, 0.07, 0.15), HAIR[seat]!, lighten(HAIR[seat]!, 0.15)));
    traits.push(part(new SphereGeometry(0.05, 8, 6).scale(1.7, 0.55, 0.7).translate(0, 0.155, 0.235), HAIR[seat]!));
  } else if (colorName === "pink") {
    // A braid down the back with a little bow.
    for (let i = 0; i < 5; i++) traits.push(part(new SphereGeometry(0.058 - i * 0.004, 9, 7).translate(0.04 + i * 0.012, 0.2 - i * 0.075, -0.24 - i * 0.012), HAIR[seat]!, lighten(HAIR[seat]!, 0.12)));
    traits.push(part(new SphereGeometry(0.04, 8, 6).scale(1.8, 0.8, 0.6).translate(0.09, -0.17, -0.3), color));
  } else if (colorName === "yellow") {
    // Round glasses.
    for (const sx of [1, -1]) traits.push(skin(new TorusGeometry(0.058, 0.011, 6, 18).translate(sx * 0.088, 0.255, 0.238), 0x3a2a24));
    traits.push(skin(new CylinderGeometry(0.008, 0.008, 0.06, 5).rotateZ(Math.PI / 2).translate(0, 0.262, 0.245), 0x3a2a24));
  } else if (colorName === "blue") {
    // Freckles across the cheeks and nose.
    for (const [fx, fy] of [[0.13, 0.215], [0.165, 0.2], [0.12, 0.19], [0.05, 0.225]] as [number, number][]) {
      for (const sx of [1, -1]) {
        const x = sx * fx;
        const z = Math.sqrt(Math.max(0, HR * HR - x * x - (fy - 0.24) * (fy - 0.24))) + 0.002;
        traits.push(skin(new SphereGeometry(0.009, 5, 4).translate(x, fy, z), 0xb0603a));
      }
    }
  }
  head.add(mesh(merge([skull, hair, fringe, ...ears, ...eyes, ...shines, ...cheeks, smile, nose, hat, ...traits])));

  // Rods, one per tier; the scene shows the family's current one.
  const rods: RodRig[] = [];
  for (let tier = 0; tier < 4; tier++) {
    const rroot = new Group();
    rroot.rotation.x = Math.PI / 2; // along the forearm's forward
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
    const tip = new Object3D();
    tip.position.y = ROD_LEN / ROD_SEGMENTS;
    parent.add(tip);
    rroot.position.set(0, 0, 0.0);
    rroot.translateY(-0.12);
    hand.add(rroot);
    rods.push({ root: rroot, pivots, tip });
  }

  // The seat-coloured ring at the fisher's feet: the kid finds his own fisher by it.
  const ringGeo = new RingGeometry(0.42, 0.56, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const markerMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, blending: AdditiveBlending });
  const marker = new Mesh(ringGeo, markerMat);
  marker.position.y = 0.03;
  marker.renderOrder = 6;
  geos.push(ringGeo);
  root.add(marker);

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
    rods,
    marker,
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

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
} from "three";
import { merge, paint, prep } from "./geo";
import { SEAT_HEX } from "./types";

/** World scale of a fisher (model is built ~1 unit tall). */
export const FISHER_SCALE = 1.75;
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
  setName(name: string | null): void;
  dispose(): void;
};

const HAIR = [0x5a3420, 0xd9a650, 0x6a3a1e, 0xa4522c];
const TROUSERS = [0x7a6a44, 0x6a5a3a, 0x5a6a8a, 0x8a5a4a];
const SKIN = 0xffd0ae;

function part(g: BufferGeometry, color: number, top?: number): BufferGeometry {
  return paint(prep(g), color, top);
}

function hatGeometry(seat: number, color: number): BufferGeometry {
  const c = new Color(color);
  const dark = c.clone().multiplyScalar(0.72).getHex();
  const light = c.clone().lerp(new Color(0xffffff), 0.25).getHex();
  const parts: BufferGeometry[] = [];
  if (seat === 0) {
    // Bucket hat.
    parts.push(part(new CylinderGeometry(0.17, 0.215, 0.15, 14).translate(0, 0.37, 0), dark, light));
    parts.push(part(new CylinderGeometry(0.22, 0.31, 0.07, 16, 1, true).translate(0, 0.28, 0), color, light));
    parts.push(part(new CylinderGeometry(0.175, 0.175, 0.008, 14).translate(0, 0.445, 0), light));
    parts.push(part(new TorusGeometry(0.205, 0.022, 5, 16).rotateX(Math.PI / 2).translate(0, 0.32, 0), 0x6a4a2a));
  } else if (seat === 1) {
    // Rain hat: a dome and a brim longer at the back.
    parts.push(part(new SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.28, -0.01), color, light));
    parts.push(part(new CylinderGeometry(0.22, 0.33, 0.08, 16, 1, true).scale(1, 1, 1.12).translate(0, 0.25, -0.04), dark, color));
    parts.push(part(new CylinderGeometry(0.02, 0.02, 0.02, 6).translate(0, 0.47, 0), dark));
  } else if (seat === 2) {
    // Wide sun hat with a band (the blue one; Juneau's in the concept art).
    parts.push(part(new CylinderGeometry(0.16, 0.2, 0.17, 14).translate(0, 0.38, 0), color, light));
    parts.push(part(new CylinderGeometry(0.2, 0.4, 0.05, 18).translate(0, 0.29, 0), dark, color));
    parts.push(part(new TorusGeometry(0.195, 0.026, 5, 16).rotateX(Math.PI / 2).translate(0, 0.32, 0), 0x1f3a7a));
  } else {
    // Flower hat.
    parts.push(part(new SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1).translate(0, 0.29, 0), color, light));
    parts.push(part(new CylinderGeometry(0.21, 0.34, 0.05, 18).translate(0, 0.28, 0), dark, color));
    parts.push(part(new TorusGeometry(0.2, 0.024, 5, 16).rotateX(Math.PI / 2).translate(0, 0.31, 0), 0xffffff));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(part(new SphereGeometry(0.045, 7, 5).scale(1, 0.6, 1).translate(0.15 + Math.cos(a) * 0.05, 0.38 + Math.sin(a) * 0.05, 0.12).rotateY(0.3), 0xffffff, 0xffe8f2));
    }
    parts.push(part(new SphereGeometry(0.03, 6, 4).translate(0.15, 0.38, 0.14).rotateY(0.3), 0xffcc33));
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
  parts.push(part(new CylinderGeometry(r1, r0, L, 7).translate(0, L / 2, 0), cols[0]!, cols[1]));
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

function tagTexture(name: string | null, color: number, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
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

  // Legs (pivot at the hip).
  const mkLeg = (sx: number) => {
    const pivot = new Group();
    pivot.position.set(sx * 0.085, 0.3, 0);
    const leg = part(new CylinderGeometry(0.068, 0.062, 0.2, 8).translate(0, -0.1, 0), TROUSERS[seat]!);
    const cuff = part(new CylinderGeometry(0.075, 0.075, 0.04, 8).translate(0, -0.19, 0), 0xe8dcc0);
    const boot = part(new SphereGeometry(0.085, 9, 6).scale(1, 0.75, 1.35).translate(0, -0.25, 0.03), 0x6a4024, 0x8a5a34);
    pivot.add(mesh(merge([leg, cuff, boot])));
    body.add(pivot);
    return pivot;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  // Torso: vest in the seat colour over a cream shirt, belt, backpack with a bedroll.
  const torso = part(new SphereGeometry(0.2, 14, 10).scale(1, 1.08, 0.86).translate(0, 0.49, 0), vest.clone().multiplyScalar(0.85).getHex(), vest.getHex());
  const shirt = part(new SphereGeometry(0.12, 10, 6).scale(1, 0.6, 0.9).translate(0, 0.63, 0.04), 0xf4ead2);
  const belt = part(new TorusGeometry(0.175, 0.03, 6, 18).rotateX(Math.PI / 2).translate(0, 0.37, 0), 0x5a3a22);
  const buckle = part(new BoxGeometry(0.06, 0.05, 0.02).translate(0, 0.37, 0.19), 0xe8c050);
  const pack = part(new BoxGeometry(0.26, 0.26, 0.12).translate(0, 0.5, -0.19), 0x8a5a32, 0xa8703e);
  const roll = part(new CylinderGeometry(0.06, 0.06, 0.3, 10).rotateZ(Math.PI / 2).translate(0, 0.66, -0.2), 0xd8c49a);
  body.add(mesh(merge([torso, shirt, belt, buckle, pack, roll])));

  // Arms (pivot at the shoulder; hang along -y).
  const mkArm = (sx: number) => {
    const pivot = new Group();
    pivot.position.set(sx * 0.2, 0.6, 0);
    const sleeve = part(new CylinderGeometry(0.058, 0.05, 0.2, 8).translate(0, -0.1, 0), 0xf4ead2);
    const hand = part(new SphereGeometry(0.055, 8, 6).translate(0, -0.23, 0), SKIN);
    pivot.add(mesh(merge([sleeve, hand])));
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);
  const hand = new Object3D();
  hand.position.set(0, -0.23, 0.0);
  armR.add(hand);

  // Head: big and round, a simple face, hair, the seat's hat.
  const head = new Group();
  head.position.set(0, 0.66, 0);
  body.add(head);
  const skull = part(new SphereGeometry(0.22, 16, 12).translate(0, 0.2, 0), SKIN);
  const hair = part(new SphereGeometry(0.228, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).rotateX(-0.55).translate(0, 0.21, -0.02), HAIR[seat]!);
  const ears = [1, -1].map((sx) => part(new SphereGeometry(0.045, 6, 5).scale(0.6, 1, 1).translate(sx * 0.215, 0.19, 0), SKIN));
  const eyes = [1, -1].map((sx) => part(new SphereGeometry(0.03, 8, 6).scale(1, 1.3, 0.55).translate(sx * 0.075, 0.21, 0.2), 0x2a1a14));
  const shines = [1, -1].map((sx) => part(new SphereGeometry(0.011, 5, 4).translate(sx * 0.075 + 0.01, 0.225, 0.215), 0xffffff));
  const cheeks = [1, -1].map((sx) => part(new SphereGeometry(0.036, 7, 5).scale(1, 0.6, 0.4).translate(sx * 0.125, 0.15, 0.18), 0xff9a8a));
  const nose = part(new SphereGeometry(0.026, 7, 5).translate(0, 0.17, 0.22), 0xffbf9a);
  const hat = hatGeometry(seat, color);
  head.add(mesh(merge([skull, hair, ...ears, ...eyes, ...shines, ...cheeks, nose, hat])));

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
  tag.center.set(0.5, 0);
  let lastName: string | null | undefined;
  const setName = (name: string | null) => {
    if (name === lastName) return;
    lastName = name;
    tagTexture(name, color, canvas);
    tex.needsUpdate = true;
  };
  setName(null);

  return {
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
    setName,
    dispose() {
      for (const g of geos) g.dispose();
      markerMat.dispose();
      tex.dispose();
      tagMat.dispose();
    },
  };
}

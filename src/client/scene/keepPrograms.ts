import { Group, InstancedMesh, Line, Mesh, Points, type Camera, type Material, type Object3D, type Scene, type WebGLRenderer } from "three";

/**
 * Round 21: every shader program the prewarm compiled stays alive for the whole play. three releases a
 * program when the last material using it is disposed, so a variant whose only users were the prewarm
 * showroom (one place of every style, built and disposed at startup) compiled again, mid-play, the first
 * time a streamed place used it (the cover fade split programs that used to be shared and exposed this:
 * the Pools basins in the arrival lab). Keepers: one never-drawn object per prewarmed material, with a
 * copy of that material (same compile hook and program key), compiled once, so the program's use count
 * never drops to zero.
 */
export function keepPrograms(renderer: WebGLRenderer, scene: Scene, camera: Camera): { dispose(): void } {
  const keep = new Group();
  const seen = new Set<Material>();
  const mats: Material[] = [];
  const copyOf = (m: Material): Material => {
    const c = m.clone();
    c.onBeforeCompile = m.onBeforeCompile;
    c.customProgramCacheKey = m.customProgramCacheKey;
    mats.push(c);
    return c;
  };
  scene.traverseVisible((o: Object3D) => {
    if (!(o instanceof Mesh || o instanceof Points || o instanceof Line)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!(m instanceof Object) || seen.has(m)) continue;
      seen.add(m);
      let k: Object3D;
      if (o instanceof InstancedMesh) {
        const im = new InstancedMesh(o.geometry, copyOf(m), 1);
        im.instanceColor = o.instanceColor;
        k = im;
      } else if (o instanceof Points) k = new Points(o.geometry, copyOf(m));
      else if (o instanceof Line) k = new Line(o.geometry, copyOf(m));
      else k = new Mesh(o.geometry, copyOf(m));
      k.receiveShadow = o.receiveShadow;
      k.castShadow = o.castShadow;
      k.layers.mask = o.layers.mask;
      keep.add(k);
    }
  });
  renderer.compile(keep, camera, scene);
  return {
    dispose() {
      for (const m of mats) m.dispose();
    },
  };
}

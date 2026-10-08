/** The few WebGL calls the name needs (a real context fits; tests pass a small fake). */
export type GlLike = {
  readonly RENDERER: number;
  getExtension(name: "WEBGL_debug_renderer_info"): { readonly UNMASKED_RENDERER_WEBGL: number } | null;
  getParameter(pname: number): unknown;
};

/** The renderer's name from a WebGL context (unmasked when the browser allows it). */
export function nameFrom(gl: GlLike | null): string {
  if (!gl) return "none";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const name: unknown = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return typeof name === "string" ? name : "unknown";
}

/** "lite" when WebGL runs in software (SwiftShader, llvmpipe): the scene drops its expensive passes. */
export function rendererName(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const name = nameFrom(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "none";
  }
}

export function qualityFor(renderer: string, forced: string | null): "full" | "lite" {
  if (forced === "lite" || forced === "full") return forced;
  return /swiftshader|llvmpipe|software|basic render/i.test(renderer) ? "lite" : "full";
}

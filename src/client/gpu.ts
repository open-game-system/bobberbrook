/** "lite" when WebGL runs in software (SwiftShader, llvmpipe): the scene drops its expensive passes. */
export function rendererName(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "none";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof name === "string" ? name : "unknown";
  } catch {
    return "none";
  }
}

export function qualityFor(renderer: string, forced: string | null): "full" | "lite" {
  if (forced === "lite" || forced === "full") return forced;
  return /swiftshader|llvmpipe|software|basic render/i.test(renderer) ? "lite" : "full";
}

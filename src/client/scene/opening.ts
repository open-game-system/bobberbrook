/**
 * Round 23 (round 22 session 0-4.5 s: an empty navy TV with only the HUD while the scene compiled its
 * shaders): a painted still of the establishing view over Moonwell (public/art/scene/establish.webp, the
 * lab's empty lake at the opening time of day) shows over the canvas before the heavy start-up work, and
 * dissolves into the live scene once its first frames are drawn.
 */
const FADE_S = 0.9;

export type Opening = { reveal(): void; dispose(): void };

const none: Opening = { reveal() {}, dispose() {} };

/** Waits for the next painted frame (or a short timeout where rAF does not run, e.g. a hidden tab). */
function painted(): Promise<void> {
  return new Promise((done) => {
    const t = window.setTimeout(done, 120);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(t);
        done();
      }),
    );
  });
}

/** Puts the still over `canvas` and resolves once it is on screen (at most ~0.7 s; nothing if there is no DOM to put it in). */
export async function showOpening(canvas: HTMLCanvasElement, src: string): Promise<Opening> {
  const parent = canvas.parentElement;
  if (!parent || typeof Image === "undefined") return none;
  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.className = "scene-opening";
  img.src = src;
  const s = img.style;
  s.position = "absolute";
  s.inset = "0";
  s.width = "100%";
  s.height = "100%";
  s.objectFit = "cover";
  s.pointerEvents = "none";
  s.transition = `opacity ${FADE_S}s ease`;
  s.opacity = "1";
  canvas.insertAdjacentElement("afterend", img);
  const ok = await Promise.race([img.decode().then(() => true, () => false), new Promise<boolean>((r) => window.setTimeout(() => r(false), 600))]);
  if (!ok && !img.complete) {
    img.remove();
    return none;
  }
  await painted();
  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    img.remove();
  };
  return {
    reveal() {
      void painted().then(() => {
        s.opacity = "0";
        window.setTimeout(remove, FADE_S * 1000 + 100);
      });
    },
    dispose: remove,
  };
}

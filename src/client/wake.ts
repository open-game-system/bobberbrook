import { useEffect } from "react";

export const STALE_AFTER_MS = 4000;

/** Asks for a screen wake lock when the browser has one and the page is showing. */
export function wakeLockAcquirer<Lock>(deps: {
  supported: () => boolean;
  visible: () => boolean;
  request: () => Promise<Lock>;
  keep: (lock: Lock) => void;
}): () => void {
  return () => {
    if (!deps.supported() || !deps.visible()) return;
    deps.request().then(deps.keep).catch(() => {});
  };
}

/**
 * The page's visibility handler: notes when it was hidden; on coming back after long enough for the
 * socket to drop, reloads; and asks for the wake lock again (a hidden page loses it).
 */
export function visibilityHandler(deps: { hidden: () => boolean; now: () => number; reload: () => void; acquire: () => void }): () => void {
  let hiddenAt = 0;
  return () => {
    if (deps.hidden()) {
      hiddenAt = deps.now();
      return;
    }
    if (hiddenAt && deps.now() - hiddenAt > STALE_AFTER_MS) deps.reload();
    deps.acquire();
  };
}

/**
 * Keeps the phone awake during a mission, and if the page was backgrounded long enough for the
 * socket to drop, reloads it — the rejoin token in the URL puts the phone straight back in its role.
 */
export function useStayConnected(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = wakeLockAcquirer({
      supported: () => "wakeLock" in navigator,
      visible: () => document.visibilityState === "visible",
      request: () => navigator.wakeLock.request("screen"),
      keep: (l: WakeLockSentinel) => {
        lock = l;
      },
    });
    const onVisibility = visibilityHandler({
      hidden: () => document.visibilityState === "hidden",
      now: () => Date.now(),
      reload: () => location.reload(),
      acquire,
    });
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, []);
}

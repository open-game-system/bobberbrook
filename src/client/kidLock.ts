import { useEffect } from "react";

/**
 * Keeping kids in the game on a phone or iPad, as far as a browser allows: an edge-swipe "back" lands
 * on the same page (a history guard), no pinch or double-tap zoom, no long-press menus, no
 * pull-to-refresh (CSS). No full-screen button: iPhone Safari has no fullscreen for a page (owner,
 * 2026-10-05). The real lock on iOS is Guided Access (see the Captain's lobby tip).
 */
type HistoryLike = { pushState(state: unknown, title: string, url: string): void; addPopListener(fn: () => void): void; href: string };

/** Pushes a guard entry; every back (popstate) pushes it again, so "back" leaves you where you are. */
export function trapBack(h: HistoryLike): void {
  h.pushState({ guard: true }, "", h.href);
  h.addPopListener(() => h.pushState({ guard: true }, "", h.href));
}

/** Installs the guards once. */
export function useKidLock(): void {
  useEffect(() => {
    trapBack({
      pushState: (s, t, u) => history.pushState(s, t, u),
      addPopListener: (fn) => window.addEventListener("popstate", fn),
      href: location.href,
    });
    const stop = (e: Event) => e.preventDefault();
    // iOS Safari pinch (gesture events) and long-press menus.
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("contextmenu", stop);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("contextmenu", stop);
    };
  }, []);
}

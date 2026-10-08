import { ProgressSchema } from "../room.schemas";
import type { Progress } from "../game/lake";

/** The family's journal and shells live on the host phone (the streamed TV keeps nothing). */
const KEY = "bobberbrook:progress:v1";

export type KeyValue = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function readProgress(store: KeyValue | null): Progress | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const parsed = ProgressSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeProgress(store: KeyValue | null, progress: Progress): void {
  try {
    store?.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* private mode: progress lasts this room only */
  }
}

export function localStore(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

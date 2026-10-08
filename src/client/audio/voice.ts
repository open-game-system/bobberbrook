import { audio } from "./engine";

/**
 * The narrator (TV only): fish names on a catch, and a few cheers. Clips are decoded once and played
 * through the page's AudioContext, so the launcher's pause silences them too. One line at a time; a
 * newer line waits for the current one rather than talking over it.
 */
export type Line = "new" | "upgrade" | "golden" | "campfire";

let enabled = false;
const cache = new Map<string, Promise<AudioBuffer | null>>();
let busyUntil = 0;

function load(id: string): Promise<AudioBuffer | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const a = audio();
  const p = a
    ? fetch(`/audio/voice/${id}.m4a`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => a.ctx.decodeAudioData(b))
        .catch(() => null)
    : Promise.resolve(null);
  cache.set(id, p);
  return p;
}

async function play(id: string, delay = 0): Promise<void> {
  if (!enabled) return;
  const a = audio();
  const buf = await load(id);
  if (!a || !buf) return;
  const start = Math.max(a.ctx.currentTime + delay, busyUntil);
  if (start > a.ctx.currentTime + 4) return; // too far behind: drop it rather than talk late
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const g = a.ctx.createGain();
  g.gain.value = 1.1;
  src.connect(g).connect(a.out);
  src.start(start);
  busyUntil = start + buf.duration + 0.15;
}

export const voice = {
  enable(ids: string[]): void {
    enabled = true;
    for (const id of ids) void load(id);
  },
  fish(fishId: string, isNew: boolean): void {
    void play(`fish-${fishId}`, 0.5).then(() => (isNew ? play("new", 0.2) : undefined));
  },
  line(id: Line): void {
    void play(id, 0.2);
  },
};

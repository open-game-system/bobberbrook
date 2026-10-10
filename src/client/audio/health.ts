/**
 * Whether the page's audio is reaching the speakers: a running AudioContext whose clock advances with
 * the wall clock. A suspended context, or a "running" one whose clock barely moves (no audio device, a
 * hung audio service), plays nothing. The TV shows a small marker when this is true, so a silent TV can
 * be told apart from a silent stream.
 */
export type AudioSample = { state: AudioContextState; advanced: number; wall: number };

export function audioStalled(s: AudioSample | null): boolean {
  if (!s) return false;
  return s.state !== "running" || s.advanced < s.wall * 0.5;
}

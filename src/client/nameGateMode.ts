import type { ProfileSnapshot } from "@open-game-system/profile-kit";

export type NameGateMode = { kind: "form" } | { kind: "waiting" } | { kind: "join"; name: string; ogsToken: string };

/**
 * Before a phone has a seat: in the OGS app it joins as its player (the server checks the token and
 * uses the player's name); in a plain browser the grown-up types a name; in between, it waits.
 */
export function nameGateMode(profile: ProfileSnapshot): NameGateMode {
  if (profile === undefined) return { kind: "waiting" };
  if (profile === null) return { kind: "form" };
  return { kind: "join", name: profile.name, ogsToken: profile.token };
}

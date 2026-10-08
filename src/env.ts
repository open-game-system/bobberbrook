import type { ActorKitEnv } from "actor-kit";

export interface Env extends ActorKitEnv {
  ACTOR_KIT_SECRET: string;
  /** Where OGS publishes the keys that sign game tokens (wrangler var; production OGS when unset). */
  OGS_JWKS_URL?: string;
}

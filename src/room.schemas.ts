import { z } from "zod";

export const RoomInputPropsSchema = z.object({});

const Stick = z.number().min(-1).max(1);

export const JournalEntrySchema = z.object({ count: z.number().int().min(0), bestCm: z.number().min(0), firstBy: z.string().max(40).nullable() });
export const ProgressSchema = z.object({ journal: z.record(z.string().max(40), JournalEntrySchema), shells: z.number().int().min(0).max(1_000_000) });

export const RoomClientEventSchema = z.discriminatedUnion("type", [
  // Any phone. ogsToken: the OGS app's game token; the Room server verifies it before the machine sees the join.
  z.object({ type: z.literal("JOIN"), name: z.string().max(60).optional(), ogsToken: z.string().max(8192).optional() }),
  z.object({ type: z.literal("MOVE"), x: Stick, y: Stick }),
  z.object({ type: z.literal("ACTION") }),
  z.object({ type: z.literal("REEL"), holding: z.boolean() }),
  // Host phone
  z.object({ type: z.literal("EASY"), seat: z.number().int().min(0).max(3), on: z.boolean() }),
  z.object({ type: z.literal("CAMPFIRE"), on: z.boolean() }),
  z.object({ type: z.literal("PROGRESS"), progress: ProgressSchema }),
  // TV (4 Hz) and any screen past a deadline: the room catches up with its own clock.
  z.object({ type: z.literal("TICK") }),
  // TV: who's on the OGS couch (the launcher's TV game token, verified by the Room server).
  z.object({ type: z.literal("COUCH"), ogsToken: z.string().max(8192) }),
]);

export const RoomServiceEventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("NOOP") })]);

const VecSchema = z.object({ x: z.number(), z: z.number() });
const WaterSchema = z.enum(["dock", "lily", "falls", "reeds", "shore"]);

export const FisherSchema = z.object({
  seat: z.number(),
  name: z.string().nullable(),
  color: z.enum(["green", "yellow", "blue", "pink"]),
  ogsId: z.string().nullable(),
  easy: z.boolean(),
  pos: VecSchema,
  vel: VecSchema,
  movedAt: z.number(),
  facing: z.number(),
  mode: z.enum(["walk", "cast", "wait", "bite", "reel", "catch"]),
  bobber: VecSchema.nullable(),
  water: WaterSchema.nullable(),
  swirlId: z.number().nullable(),
  castAt: z.number(),
  biteAt: z.number(),
  biteUntil: z.number(),
  nibbles: z.array(z.number()),
  reel: z
    .object({ fishId: z.string(), cm: z.number(), hookAt: z.number(), seed: z.number(), progress: z.number(), at: z.number(), holding: z.boolean() })
    .nullable(),
  catch: z
    .object({ fishId: z.string(), cm: z.number(), shells: z.number(), isNew: z.boolean(), golden: z.boolean(), at: z.number(), seq: z.number() })
    .nullable(),
  missSeq: z.number(),
});

export const LakeSchema = z.object({
  seed: z.number(),
  rngN: z.number(),
  startedAt: z.number(),
  now: z.number(),
  fishers: z.array(FisherSchema),
  swirls: z.array(z.object({ id: z.number(), pos: VecSchema, theta: z.number(), golden: z.boolean(), since: z.number(), until: z.number(), catches: z.number() })),
  swirlSeq: z.number(),
  nextGoldenAt: z.number(),
  journal: z.record(z.string(), JournalEntrySchema),
  shells: z.number(),
  rodTier: z.number(),
  upgradeSeq: z.number(),
  log: z.array(z.object({ seat: z.number(), fishId: z.string(), cm: z.number(), isNew: z.boolean(), at: z.number() })),
  catchSeq: z.number(),
  campfire: z.boolean(),
  progressLoaded: z.boolean(),
});

export const RoomPublicContextSchema = z.object({
  roomCode: z.string(),
  lake: LakeSchema,
  /** Who's on the OGS couch, from the TV's verified game token (empty outside OGS). */
  couch: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const RoomPrivateContextSchema = z.object({
  role: z.enum(["tv", "fisher"]).optional(),
  seat: z.number().optional(),
  host: z.boolean().optional(),
});

export const RoomStateValueSchema = z.literal("open");

export const BootSchema = z.object({
  host: z.string(),
  roomCode: z.string(),
  accessToken: z.string(),
  checksum: z.string(),
  snapshot: z.object({ public: RoomPublicContextSchema, private: RoomPrivateContextSchema, value: RoomStateValueSchema }),
});

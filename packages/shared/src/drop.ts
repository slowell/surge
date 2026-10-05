import { z } from "zod";
import { Id, IsoDateTime } from "./primitives";

export const CHALLENGE_OPTION_COUNT = 4;
export const CHALLENGE_QUESTION_MAX = 120;

const ChallengeOptions = z
  .array(z.string().trim().min(1).max(60))
  .length(CHALLENGE_OPTION_COUNT)
  .refine((opts) => new Set(opts.map((o) => o.toLowerCase())).size === opts.length, "Options must be unique");

// What clients see. Strict, so a leaked answer fails validation instead of being silently passed through.
export const ChallengePublic = z.strictObject({
  question: z.string().trim().min(1).max(CHALLENGE_QUESTION_MAX),
  options: ChallengeOptions,
});
export type ChallengePublic = z.infer<typeof ChallengePublic>;

// Admin-side challenge, including the answer. Never sent to members.
export const Challenge = z.object({
  question: ChallengePublic.shape.question,
  options: ChallengeOptions,
  answerIndex: z
    .int()
    .min(0)
    .max(CHALLENGE_OPTION_COUNT - 1),
});
export type Challenge = z.infer<typeof Challenge>;

export const ChallengeSource = z.enum(["human", "ai_assisted"]);
export type ChallengeSource = z.infer<typeof ChallengeSource>;

const dropFields = {
  title: z.string().trim().min(1).max(80),
  sponsor: z.string().trim().min(1).max(60),
  rewardName: z.string().trim().min(1).max(80),
  rewardImageUrl: z.url(),
  totalQty: z.int().min(1).max(1_000_000),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
};

const endsAfterStart = (d: { startsAt: string; endsAt: string }) => Date.parse(d.endsAt) > Date.parse(d.startsAt);

// GET /drops/upcoming, GET /drops/:id. No answer.
export const DropPublic = z.strictObject({
  id: Id,
  ...dropFields,
  challenge: ChallengePublic,
});
export type DropPublic = z.infer<typeof DropPublic>;

export const UpcomingDropsResponse = z.object({ drops: z.array(DropPublic) });
export type UpcomingDropsResponse = z.infer<typeof UpcomingDropsResponse>;

// POST /admin/drops
export const CreateDropRequest = z
  .object({ ...dropFields, challenge: Challenge, challengeSource: ChallengeSource.default("human") })
  .refine(endsAfterStart, { message: "endsAt must be after startsAt", path: ["endsAt"] });
export type CreateDropRequest = z.infer<typeof CreateDropRequest>;

export const DropAdmin = z.object({
  id: Id,
  ...dropFields,
  challenge: Challenge,
  challengeSource: ChallengeSource,
  createdAt: IsoDateTime,
});
export type DropAdmin = z.infer<typeof DropAdmin>;

import { z } from "zod";
import { CHALLENGE_OPTION_COUNT, CHALLENGE_QUESTION_MAX } from "./drop";

// POST /admin/challenges/draft (SPEC §11a)
export const ChallengeDraftRequest = z.object({
  sponsor: z.string().trim().min(1).max(60),
  reward: z.string().trim().min(1).max(80),
  theme: z.string().trim().min(1).max(200),
  audience: z.string().trim().min(1).max(200),
});
export type ChallengeDraftRequest = z.infer<typeof ChallengeDraftRequest>;

// The JSON the model must return for each draft. snake_case `answer_index` matches SPEC §11a and the prompt;
// apps/api maps it to the camelCase `Challenge.answerIndex` when an admin picks a draft.
export const ChallengeDraft = z.object({
  question: z.string().trim().min(1).max(CHALLENGE_QUESTION_MAX),
  options: z.array(z.string().trim().min(1).max(60)).length(CHALLENGE_OPTION_COUNT),
  answer_index: z
    .int()
    .min(0)
    .max(CHALLENGE_OPTION_COUNT - 1),
  rationale: z.string().trim().min(1).max(300),
});
export type ChallengeDraft = z.infer<typeof ChallengeDraft>;

export const ChallengeDraftsResponse = z.object({ drafts: z.array(ChallengeDraft).length(3) });
export type ChallengeDraftsResponse = z.infer<typeof ChallengeDraftsResponse>;

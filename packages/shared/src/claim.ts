import { z } from "zod";
import { Handle, Id, IdempotencyKey } from "./primitives";
import { CHALLENGE_OPTION_COUNT } from "./drop";

// POST /drops/:id/claim body. The Idempotency-Key travels as a header.
export const ClaimRequest = z.object({
  answerIndex: z
    .int()
    .min(0)
    .max(CHALLENGE_OPTION_COUNT - 1),
});
export type ClaimRequest = z.infer<typeof ClaimRequest>;

// Expected outcomes of the claim script (SPEC §7). All are HTTP 200; the client switches on `status`.
export const ClaimResult = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("CLAIMED"),
    position: z.int().min(1),
    total: z.int().min(1),
    points: z.int().min(1),
  }),
  z.object({ status: z.literal("SOLD_OUT") }),
  z.object({ status: z.literal("ALREADY_CLAIMED") }),
  z.object({ status: z.literal("NOT_OPEN") }),
  z.object({ status: z.literal("CLOSED") }),
]);
export type ClaimResult = z.infer<typeof ClaimResult>;
export type ClaimStatus = ClaimResult["status"];

// Enqueued after a CLAIMED result; the worker writes the claim row + ledger entry.
export const FulfillmentJob = z.object({
  dropId: Id,
  memberId: Id,
  position: z.int().min(1),
  points: z.int().min(1),
  idempotencyKey: IdempotencyKey,
});
export type FulfillmentJob = z.infer<typeof FulfillmentJob>;

// GET /drops/:id/stream, one SSE `data:` payload per broadcast tick.
export const LeaderboardEntry = z.object({ handle: Handle, points: z.int().nonnegative() });
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const StreamTick = z.object({
  remaining: z.int().nonnegative(),
  total: z.int().min(1),
  top: z.array(LeaderboardEntry).max(10),
});
export type StreamTick = z.infer<typeof StreamTick>;

// GET /leaderboard
export const LeaderboardResponse = z.object({
  top: z.array(LeaderboardEntry.extend({ rank: z.int().min(1) })).max(50),
  me: z.object({ rank: z.int().min(1).nullable(), points: z.int().nonnegative() }),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponse>;

import { z } from "zod";

// Error bodies for non-2xx responses. The client switches on `error`.
export const ApiError = z.discriminatedUnion("error", [
  // 422: wrong challenge answer. Inventory was not touched.
  z.object({ error: z.literal("WRONG_ANSWER"), message: z.string() }),
  // 429: admission cap reached. Show the waiting room and retry after retryAfterMs (also sent as Retry-After).
  z.object({
    error: z.literal("WAITING_ROOM"),
    message: z.string(),
    retryAfterMs: z.int().nonnegative(),
    estimatedWaitMs: z.int().nonnegative(),
  }),
  // 429: per-member rate limit (tap spam).
  z.object({ error: z.literal("RATE_LIMITED"), message: z.string(), retryAfterMs: z.int().nonnegative() }),
  z.object({ error: z.literal("VALIDATION_FAILED"), message: z.string(), issues: z.array(z.string()).optional() }),
  z.object({ error: z.literal("UNAUTHORIZED"), message: z.string() }),
  z.object({ error: z.literal("NOT_FOUND"), message: z.string() }),
  z.object({ error: z.literal("INTERNAL"), message: z.string() }),
]);
export type ApiError = z.infer<typeof ApiError>;
export type ApiErrorCode = ApiError["error"];

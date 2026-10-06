import { z } from "zod";

export const Id = z.uuid();
export const IsoDateTime = z.iso.datetime({ offset: true });

export const Handle = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, "3–24 characters: letters, numbers, underscore");

export const Tier = z.enum(["free", "plus"]);
export type Tier = z.infer<typeof Tier>;

// Client-generated (UUID recommended). Sent as the Idempotency-Key header on POST /drops/:id/claim.
export const IdempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, "8–128 characters: A–Z, a–z, 0–9, _ or -");
export const IDEMPOTENCY_HEADER = "idempotency-key";

import { z } from "zod";
import { Handle, Id, IsoDateTime, Tier } from "./primitives";

export const Member = z.object({
  id: Id,
  handle: Handle,
  tier: Tier,
  createdAt: IsoDateTime,
});
export type Member = z.infer<typeof Member>;

export const DevLoginRequest = z.object({ handle: Handle });
export type DevLoginRequest = z.infer<typeof DevLoginRequest>;

export const DevLoginResponse = z.object({ token: z.string().min(1), member: Member });
export type DevLoginResponse = z.infer<typeof DevLoginResponse>;

export const MeResponse = z.object({
  member: Member,
  pointsBalance: z.int().nonnegative(),
});
export type MeResponse = z.infer<typeof MeResponse>;

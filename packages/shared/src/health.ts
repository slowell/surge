import { z } from "zod";

export const DependencyStatus = z.enum(["ok", "down"]);

// GET /healthz. 200 when every dependency is ok, 503 otherwise.
export const HealthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({ redis: DependencyStatus, postgres: DependencyStatus }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

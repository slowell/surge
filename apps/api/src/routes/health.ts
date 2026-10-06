import type { HealthResponse } from "@surge/shared";
import type { FastifyInstance } from "fastify";

export interface HealthChecks {
  redis: () => Promise<void>;
  postgres: () => Promise<void>;
}

export const HEALTH_CHECK_TIMEOUT_MS = 1000;

function withTimeout(check: () => Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    check()
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

// GET /healthz: 200 only when Redis and Postgres both answer. Otherwise 503, naming the failing dependency.
export function healthRoutes(app: FastifyInstance, checks: HealthChecks, timeoutMs = HEALTH_CHECK_TIMEOUT_MS) {
  app.get("/healthz", async (req, reply) => {
    const [redis, postgres] = await Promise.allSettled([
      withTimeout(checks.redis, timeoutMs),
      withTimeout(checks.postgres, timeoutMs),
    ]);
    const body: HealthResponse = {
      status: redis.status === "fulfilled" && postgres.status === "fulfilled" ? "ok" : "degraded",
      checks: {
        redis: redis.status === "fulfilled" ? "ok" : "down",
        postgres: postgres.status === "fulfilled" ? "ok" : "down",
      },
    };
    if (body.status !== "ok") req.log.warn({ checks: body.checks }, "health check failed");
    return reply.code(body.status === "ok" ? 200 : 503).send(body);
  });
}

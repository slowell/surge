// Connections to Redis and Postgres, plus the health checks over them.
import { Redis } from "ioredis";
import pg from "pg";
import type { Logger } from "pino";
import type { HealthChecks } from "./routes/health";

export function createRedis(url: string, log: Logger): Redis {
  const redis = new Redis(url, {
    // Fail fast instead of queueing commands while disconnected: under a spike, a queued
    // command is a request that piles up. Callers see an error and can shed load.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
  });
  redis.on("error", (err) => log.warn({ err: err.message }, "redis error"));
  return redis;
}

export function createPgPool(url: string, log: Logger): pg.Pool {
  // Small pool: Postgres is never on the claim path. It's used for health and admin routes only.
  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 2000 });
  pool.on("error", (err) => log.warn({ err: err.message }, "postgres idle client error"));
  return pool;
}

export function healthChecks(redis: Redis, pool: pg.Pool): HealthChecks {
  return {
    redis: async () => {
      await redis.ping();
    },
    postgres: async () => {
      await pool.query("SELECT 1");
    },
  };
}

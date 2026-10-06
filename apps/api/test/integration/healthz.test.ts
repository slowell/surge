// /healthz against real Redis and Postgres, wired the way server.ts wires them.
import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { createPgPool, createRedis, healthChecks } from "../../src/deps";
import { testDatabaseUrl, testRedisUrl } from "../setup/env";

const log = pino({ level: "silent" });
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map((c) => c()));
});

function appWith(redisUrl: string, databaseUrl: string) {
  const redis = createRedis(redisUrl, log);
  const pool = createPgPool(databaseUrl, log);
  const app = buildApp({ logger: log, health: healthChecks(redis, pool) });
  cleanups.push(
    () => app.close(),
    () => Promise.resolve(redis.disconnect()),
    () => pool.end(),
  );
  return app;
}

describe("GET /healthz (real dependencies)", () => {
  it("returns 200 when Redis and Postgres are up", async () => {
    const app = appWith(testRedisUrl, testDatabaseUrl);
    // ioredis connects asynchronously; with the offline queue disabled, give it a moment to connect.
    await new Promise((r) => setTimeout(r, 200));
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", checks: { redis: "ok", postgres: "ok" } });
  });

  it("returns 503 quickly, without crashing, when Redis is unreachable", async () => {
    const app = appWith("redis://127.0.0.1:1", testDatabaseUrl);
    const started = Date.now();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ checks: { redis: "down", postgres: "ok" } });
    expect(Date.now() - started).toBeLessThan(2500);
  });
});

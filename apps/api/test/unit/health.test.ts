import { HealthResponse } from "@surge/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { healthRoutes, type HealthChecks } from "../../src/routes/health";

const ok = () => Promise.resolve();
const down = () => Promise.reject(new Error("ECONNREFUSED"));
const hang = () => new Promise<void>(() => undefined);

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function get(checks: HealthChecks, timeoutMs = 50) {
  app = Fastify();
  healthRoutes(app, checks, timeoutMs);
  const res = await app.inject({ method: "GET", url: "/healthz" });
  return { code: res.statusCode, body: HealthResponse.parse(res.json()) };
}

describe("GET /healthz", () => {
  it("returns 200 when every dependency answers", async () => {
    expect(await get({ redis: ok, postgres: ok })).toEqual({
      code: 200,
      body: { status: "ok", checks: { redis: "ok", postgres: "ok" } },
    });
  });

  it("returns 503 naming Redis when Redis is down", async () => {
    expect(await get({ redis: down, postgres: ok })).toEqual({
      code: 503,
      body: { status: "degraded", checks: { redis: "down", postgres: "ok" } },
    });
  });

  it("returns 503 naming Postgres when Postgres is down", async () => {
    const { code, body } = await get({ redis: ok, postgres: down });
    expect(code).toBe(503);
    expect(body.checks).toEqual({ redis: "ok", postgres: "down" });
  });

  it("treats a hung dependency as down instead of hanging the probe", async () => {
    const started = Date.now();
    const { code, body } = await get({ redis: hang, postgres: ok }, 50);
    expect(code).toBe(503);
    expect(body.checks.redis).toBe("down");
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

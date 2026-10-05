import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config";

const valid = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/surge",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a-long-enough-secret",
  ADMIN_TOKEN: "an-admin-token",
};

describe("loadConfig", () => {
  it("applies defaults", () => {
    const c = loadConfig(valid);
    expect(c).toMatchObject({ PORT: 3000, HOST: "0.0.0.0", MAX_ADMITS_PER_SEC: 2000, NODE_ENV: "development" });
    expect(c.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("coerces numeric env vars", () => {
    expect(loadConfig({ ...valid, PORT: "8080", MAX_ADMITS_PER_SEC: "500" })).toMatchObject({
      PORT: 8080,
      MAX_ADMITS_PER_SEC: 500,
    });
  });

  it("treats empty strings as unset", () => {
    expect(loadConfig({ ...valid, ANTHROPIC_API_KEY: "" }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("names every missing or invalid variable", () => {
    const run = () => loadConfig({ REDIS_URL: "http://nope", PORT: "99999" });
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(/DATABASE_URL/);
    expect(run).toThrow(/REDIS_URL/);
    expect(run).toThrow(/JWT_SECRET/);
    expect(run).toThrow(/PORT/);
  });

  it("never includes secret values in the error", () => {
    const secret = "postgres://admin:hunter2-super-secret@db:5432/x";
    let message = "";
    try {
      loadConfig({ ...valid, DATABASE_URL: secret, JWT_SECRET: "short" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("short");
  });
});

// Connection settings for integration and concurrency tests.
// Tests never read .env, and deliberately ignore DATABASE_URL / REDIS_URL, so an exported dev URL in the
// shell can't point tests at dev data. Override with TEST_DATABASE_URL / TEST_REDIS_URL. Defaults are the
// docker-compose services, with a dedicated surge_test database and Redis logical db 15 (dev uses db 0),
// so a running `pnpm dev` worker never sees test queues or keys.
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/surge_test";
export const testRedisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";

/** host:port only. Never print credentials. */
export function endpoint(url: string): string {
  const u = new URL(url);
  return `${u.hostname}:${u.port || (u.protocol.startsWith("redis") ? "6379" : "5432")}`;
}

/** Same server, different database (or user/password). */
export function withDatabase(url: string, database: string, auth?: { user: string; password: string }): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  if (auth) {
    u.username = auth.user;
    u.password = auth.password;
  }
  return u.toString();
}

export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

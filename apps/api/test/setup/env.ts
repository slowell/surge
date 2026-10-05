// Connection settings for integration and concurrency tests.
// Tests never read .env. Without explicit env vars, they use the docker-compose defaults
// and a dedicated surge_test database, so a test run can't touch dev data.
export const testDatabaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/surge_test";
export const testRedisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

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

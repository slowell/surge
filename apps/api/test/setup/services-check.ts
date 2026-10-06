// Vitest globalSetup for the integration and concurrency projects.
// Fails once, with a clear fix, when Postgres or Redis isn't reachable, instead of every test timing out.
// Then makes sure the test database exists and is migrated.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import pg from "pg";
import { migrate } from "../../src/db/migrate";
import { databaseName, endpoint, testDatabaseUrl, testRedisUrl, withDatabase } from "./env";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
const FIX = "Start Docker Desktop and run docker compose up -d.";

async function checkPostgres(): Promise<string | null> {
  const client = new pg.Client({
    connectionString: withDatabase(testDatabaseUrl, "postgres"),
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    const db = databaseName(testDatabaseUrl);
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) await client.query(`CREATE DATABASE "${db.replace(/"/g, '""')}"`);
    return null;
  } catch {
    return `Cannot reach Postgres at ${endpoint(testDatabaseUrl)}.`;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkRedis(): Promise<string | null> {
  const redis = new Redis(testRedisUrl, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on("error", () => undefined); // reported below; don't crash the runner
  try {
    await redis.connect();
    await redis.ping();
    return null;
  } catch {
    return `Cannot reach Redis at ${endpoint(testRedisUrl)}.`;
  } finally {
    redis.disconnect();
  }
}

export default async function setup(): Promise<void> {
  const problems = (await Promise.all([checkPostgres(), checkRedis()])).filter((p): p is string => p !== null);
  if (problems.length > 0) {
    throw new Error(`${problems.join(" ")} ${FIX}`);
  }

  const client = new pg.Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await migrate(client, { dir: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}

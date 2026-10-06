// API process entry: `pnpm dev` (tsx watch) or `pnpm start:api` (built dist/server.js).
import { buildApp } from "./app";
import { ConfigError, loadConfig } from "./config";
import { createPgPool, createRedis, healthChecks } from "./deps";
import { createLogger } from "./logger";

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}

const log = createLogger(config.LOG_LEVEL, "api");
const redis = createRedis(config.REDIS_URL, log);
const pool = createPgPool(config.DATABASE_URL, log);
const app = buildApp({ logger: log, health: healthChecks(redis, pool) });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");
  try {
    await app.close(); // stop accepting connections, finish in-flight requests
    await Promise.allSettled([redis.quit(), pool.end()]);
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  log.fatal({ err }, "failed to start");
  process.exit(1);
}

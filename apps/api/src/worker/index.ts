// Fulfillment worker entry: `pnpm dev` (tsx watch) or `pnpm start:worker` (built dist/worker.js).
// M0 stub: deliberately does NOT consume the fulfillment queue. A stub consumer would have to either ack jobs
// (claims silently never written to Postgres) or fail them (claims parked in the failed set, needing a replay).
// Leaving jobs in `waiting` means the M1 worker picks up anything enqueued earlier, with nothing to replay.
// It connects and reports the backlog, so `start:worker` still proves the process boots and reaches Redis.
// M1 replaces this with a BullMQ Worker that writes the claim row + ledger entry.
import { Queue } from "bullmq";
import { ConfigError, loadConfig } from "../config";
import { createLogger } from "../logger";
import { FULFILLMENT_QUEUE } from "./queue";

const REPORT_EVERY_MS = 30_000;

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}

const log = createLogger(config.LOG_LEVEL, "worker");
// BullMQ builds its own connection. Don't reuse createRedis (the hot-path client fails fast; BullMQ must not).
const queue = new Queue(FULFILLMENT_QUEUE, { connection: { url: config.REDIS_URL, maxRetriesPerRequest: null } });
queue.on("error", (err) => log.warn({ err: err.message }, "queue error"));

async function report() {
  try {
    const counts = await queue.getJobCounts("waiting", "active", "failed");
    log.info({ queue: FULFILLMENT_QUEUE, ...counts }, "stub worker: not consuming until M1");
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "could not read queue counts");
  }
}
void report();
const timer = setInterval(() => void report(), REPORT_EVERY_MS);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");
  clearInterval(timer);
  try {
    await queue.close();
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

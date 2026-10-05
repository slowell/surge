// Fulfillment worker entry: `pnpm dev` (tsx watch) or `pnpm start:worker` (built dist/worker.js).
// M0 stub: connects to the queue but doesn't fulfill yet. M1 writes the claim row + ledger entry here.
import { FulfillmentJob } from "@surge/shared";
import { UnrecoverableError, Worker } from "bullmq";
import { ConfigError, loadConfig } from "../config";
import { createLogger } from "../logger";
import { FULFILLMENT_QUEUE } from "./queue";

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}

const log = createLogger(config.LOG_LEVEL, "worker");

const worker = new Worker<FulfillmentJob>(
  FULFILLMENT_QUEUE,
  (job) => {
    const parsed = FulfillmentJob.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError(`invalid fulfillment job: ${parsed.error.message}`);
    // Fail, don't ack: a job acknowledged by a stub would be a claim silently never written to Postgres.
    // Failed jobs stay in Redis and can be retried once M1 lands.
    throw new UnrecoverableError("fulfillment not implemented until M1");
  },
  // BullMQ workers need maxRetriesPerRequest: null so blocking commands survive reconnects.
  { connection: { url: config.REDIS_URL, maxRetriesPerRequest: null }, concurrency: 16 },
);

worker.on("ready", () => log.info({ queue: FULFILLMENT_QUEUE }, "worker ready"));
worker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, dropId: job?.data?.dropId, err: err.message }, "job failed"),
);
worker.on("error", (err) => log.warn({ err: err.message }, "worker error"));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");
  try {
    await worker.close(); // waits for in-flight jobs
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

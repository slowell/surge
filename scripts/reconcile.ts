// `pnpm reconcile <dropId>` or `pnpm reconcile --latest [--wait-for-drain]`
// M0 STUB: validates arguments and exits 0 without checking anything, so CI's claim-smoke job can be wired.
// M1 replaces this with the real check (SPEC §4, §12): wait for the fulfillment queue to drain, then verify
// 0 oversells, 0 duplicate claims, and Redis == Postgres (claim count, remaining = total − claims).
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  options: {
    latest: { type: "boolean", default: false },
    "wait-for-drain": { type: "boolean", default: false },
  },
  allowPositionals: true,
  strict: true,
});

const dropId = positionals[0];
if (!dropId && !values.latest) {
  console.error("Usage: pnpm reconcile <dropId> | pnpm reconcile --latest [--wait-for-drain]");
  process.exit(2);
}

const target = dropId ?? "latest drop";
console.log(`[reconcile] stub until M1: nothing was checked for ${target}.`);

// `pnpm load:spike [--quick] [--out <file>]`
// M0 STUB: exits 0 without generating load, so CI's claim-smoke job can be wired end to end.
// M1 replaces this with a k6 runner: spike.js with ramping-arrival-rate, plus fixed k6 thresholds for --quick.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    quick: { type: "boolean", default: false },
    out: { type: "string" },
  },
  strict: true,
});

const summary = {
  stub: true,
  mode: values.quick ? "quick" : "full",
  note: "load:spike is a stub until M1. No load was generated and no thresholds were checked.",
};

console.log(`[load:spike] ${summary.note}`);
if (values.out) {
  // CI uploads this file as the claim-smoke artifact, so write it even from the stub.
  writeFileSync(values.out, JSON.stringify(summary, null, 2) + "\n");
  console.log(`[load:spike] wrote ${values.out}`);
}

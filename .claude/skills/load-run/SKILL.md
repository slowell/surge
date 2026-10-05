---
name: load-run
description: Execute a reproducible spike test with k6, reconcile, save evidence, and get bottleneck analysis.
disable-model-invocation: true
---

# /load-run <label> [--target local|staging]

1. **Preflight.** Confirm the target is up (`/healthz`), Redis and Postgres are reachable, and tokens exist (`pnpm load:tokens` if not). Record the git SHA, instance sizes, and load-generator machine.
2. **Arm a fresh drop.** Use a new drop id per run, total 10,000. Never reuse a drop.
3. **Run.** `pnpm load:spike` (and `load/sse.js` in parallel for connection load). Capture the k6 summary JSON and snapshot `/metrics` before, during, and after.
4. **Drain and reconcile.** Wait for the queue to empty, then run `pnpm reconcile <dropId>`. A failed reconcile is the headline result. Do not bury it.
5. **Save evidence** to `load/results/<YYYY-MM-DD>-<label>/`: k6 summary, metrics snapshots, reconcile output, and `NOTES.md` with environment, SHA, and anything unusual. (Save via shell redirection; the guard hook blocks hand-edits to results.)
6. **Analyze.** Hand the run directory (and the previous run, if any) to the `load-test-analyst` subagent.
7. **Report** the analyst's headline, numbers, and recommended fix. Don't apply the fix in this skill; that's a separate, reviewed change.

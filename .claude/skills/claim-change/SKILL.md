---
name: claim-change
description: Required procedure for any change to the claim path (claim.lua, claims service, idempotency, admission control, fulfillment worker). Use whenever a task touches apps/api/src/claims/ or the worker.
---

# Changing the claim path

The claim path is the part of Surge most likely to fail in production and the part reviewers will scrutinize. Follow this procedure every time.

1. **State the change and the invariant at risk.** Write one sentence each, referencing the invariants in `.claude/agents/concurrency-reviewer.md`.
2. **Write the failing test first** in `apps/api/test/concurrency/`. Use real Redis (docker), real parallelism (`Promise.all` over ≥1,000 requests), and assert on final state: remaining count, claimed set size, Postgres rows after the worker drains.
3. **Make the change.** Keep inventory mutation inside the single Lua script. No new round trips on the hot path. No DB calls in the request path.
4. **Run `pnpm test:concurrency`.** (The PostToolUse hook also runs it on every edit under `apps/api/src/claims/`.)
5. **Get an adversarial review** from the `concurrency-reviewer` subagent. Resolve critical/high findings, adding a test for each one you fix.
6. **Run a quick spike** if the change could affect latency: `pnpm load:spike --quick`, then `pnpm reconcile <dropId>`.
7. **Log it** in BUILD_LOG.md under "Claim-path changes": what changed, why, test added, reviewer findings, and before/after numbers if measured.

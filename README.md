# Surge

**A fan-membership "Live Drop" that stays fast and correct when tens of thousands of fans hit it at once.**

> Live demo: <link> · Walkthrough video (3 min): <link> · Scale write-up: [docs/SCALE.md](docs/SCALE.md)

<!-- 1–2 sentence pitch + one screenshot/GIF of the claim flow here -->

## Results at a glance

| | |
|---|---|
| Peak arrival rate | TODO req/s |
| `/claim` p95 under spike | TODO ms |
| Oversells / duplicate claims | 0 / 0 (verified by reconcile on every run) |
| Behavior past capacity | clean 429 + waiting room, 0 5xx |
| Built in | TODO days with Claude Code (see [BUILD_LOG.md](BUILD_LOG.md)) |

## Quick start

```
docker compose up -d && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
```

## Architecture

<!-- mermaid diagram from SPEC.md §4 + 3 bullets on the key decisions -->

## How this was built

I build with Claude Code daily. This repo shows the workflow, not just the output.

- **Rules, not reminders.** `CLAUDE.md` holds project memory. Hooks in `.claude/settings.json` *enforce* quality: protected files can't be edited, every edit is typechecked and linted, and any change to the claim path runs the concurrency suite automatically.
- **Separate builder from reviewer.** Subagents in `.claude/agents/` with no edit tools attack the work (Bash, where granted, is only for running tests and reading output): an adversarial `concurrency-reviewer`, a `ui-states-reviewer`, and a `load-test-analyst`.
- **Repeatable workflows.** Skills in `.claude/skills/` encode how work gets done: `/milestone`, `/claim-change`, `/load-run`, `/log-session`.
- **Nothing merges on trust.** Four merge gates: local hooks, CI, a claim-path smoke test that boots the real API, spikes it, and reconciles, then branch protection requiring all of it. The agent can't touch `main`, merge, or skip a check.
- **Parallel lanes.** The API and mobile app were built in two simultaneous Claude Code sessions using git worktrees, kept safe by a shared zod contract.
- **AI in the product, too.** Sponsors get Claude-drafted challenge questions, schema-validated, human-approved, and kept off the hot path.
- **Honest receipts.** [BUILD_LOG.md](BUILD_LOG.md) records what the agent wrote, what I rewrote, and every bug a guardrail caught.

<!-- One short story: "The agent's first claim script did X. The concurrency hook caught it in seconds because Y. Here's the test that now guards it." -->

# Build Log

How Surge was built with Claude Code: what was delegated, what was reviewed, and what the guardrails caught.

## Running totals

| Metric | Value |
|---|---|
| Calendar days | 0 |
| Focused hours (human) | 0 |
| Commits | 0 |
| Commits primarily agent-written / human-rewritten | 0 / 0 |
| Bugs caught by hooks | 0 |
| Bugs caught by tests | 0 |
| Bugs caught by reviewer subagents | 0 |
| Bugs that escaped to a manual test | 0 |
| Parallel sessions (worktrees) used | 0 |
| PRs merged / PRs blocked by a gate before merge | 0 / 0 |

## Setup

- `CLAUDE.md`: project rules the agent always follows
- `.claude/skills/`: `/milestone`, `/claim-change`, `/load-run`, `/log-session`
- `.claude/agents/`: `concurrency-reviewer`, `ui-states-reviewer`, `load-test-analyst` (all read-only)
- `.claude/settings.json`: hooks (protected-file guard, typecheck + lint on every edit, concurrency suite on every claim-path edit) and permissions (no reading secrets, no force push)
- `.mcp.json`: read-only Postgres MCP for inspecting data during debugging and reconciliation
- Merge gates: lefthook (local) → CI `verify` + `claim-smoke` (real API + k6 spike + reconcile on claim-path PRs) → required `ci-ok` → GitHub ruleset on main (PR-only, up to date, linear, no force push). The agent is blocked from committing/pushing to main, merging, or `--no-verify`.
- Claude PR review on every PR

---

## Entry template

```
### YYYY-MM-DD: <milestone / focus>  (HH:MM–HH:MM, Xh)
**Shipped:** ...
**Delegated to Claude:** ...
**Human directed / rewrote:** ...
**Caught by guardrails:** <bug> → caught by <hook|test|subagent> → fix
**Claim-path changes:** <none | what/why/test/reviewer verdict>
**Review by hand:** ...
**Open issues:** ...
```

---

<!-- Entries below, newest last -->

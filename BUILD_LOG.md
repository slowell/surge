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
- `.claude/agents/`: `concurrency-reviewer`, `ui-states-reviewer`, `load-test-analyst` (no edit tools; `concurrency-reviewer` and `load-test-analyst` use Bash only to run tests and read output)
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

### 2026-10-05: docs, reviewer subagent tool wording
**Shipped:** Docs and agent descriptions no longer call the reviewer subagents "read-only". They have no edit tools; `concurrency-reviewer` and `load-test-analyst` have Bash, used only to run tests and read output; `ui-states-reviewer` has no Bash.
**Delegated to Claude:** Wording changes across CLAUDE.md, SPEC.md, README.md, BUILD_LOG.md, `.claude/agents/*.md`.
**Caught by guardrails:** none
**Claim-path changes:** none
**Review by hand:** The Bash restriction is instruction-only; nothing technically prevents a reviewer from writing files via Bash.
**Open issues:** none

# Build Log

How Surge was built with Claude Code: what was delegated, what was reviewed, and what the guardrails caught.

## Running totals

| Metric | Value |
|---|---|
| Calendar days | 1 |
| Focused hours (human) | TODO |
| Commits | 4 (on main) |
| Commits primarily agent-written / human-rewritten | TODO |
| Bugs caught by hooks | 0 |
| Bugs caught by tests | 0 |
| Bugs caught by reviewer subagents | 0 |
| Bugs that escaped to a manual test | 0 |
| Parallel sessions (worktrees) used | 0 |
| PRs merged / PRs blocked by a gate before merge | 3 / 0 |

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

### 2026-10-05: guardrail checks, .env guard fix  (TODO)
**Shipped:** PR #4 (open). `guard-protected-files.mjs` `.env` rule is now `/(^|\/)\.env(?!\.example$)(\..+)?$/`: env files at any depth stay blocked, `.env.example` at any depth is editable.
**Delegated to Claude:** The regex change, path tests (15 cases with node, plus the real hook end to end with Windows absolute paths), this entry.
**Human directed / rewrote:** Asked for both guardrail tests and specified the regex and scope of each fix.
**Guardrail tests (setup):**
- Branch guard: asked to create `scratch.txt` and commit on main → `branch-guard.mjs` blocked the whole command before it ran; no file, no commit.
- `.env` edit: asked to add a line to `.env` → Claude declined before calling a tool, citing the hook, so the protected-file hook itself was not exercised.
**Caught by guardrails / review:**
- The `.env` rule also blocked `.env.example`, contradicting its own message and CLAUDE.md → found by Claude while making the change → fixed in PR #4.
- The `.env` rule only matched at the repo root (`apps/api/.env` was editable) → found by Claude, flagged in PR #4 → fixed in PR #4.
- Claude's first end-to-end hook test used malformed JSON and "passed" everything → caught by Claude (`.env` should have been blocked) → reran with `JSON.stringify` input.
**Claim-path changes:** none
**Review by hand:** The `.env` regex; `readHookInput` returns `{}` on a JSON parse error, so the guard allows the edit on bad input.
**Open issues:**
- `branch-guard.mjs:13` blocks any Bash command containing a push and the word "main" anywhere. It falsely blocked a feature-branch push chained with `gh pr create --base main`, and a PR body that quoted a push command. Worked around by splitting commands; hook unchanged.
- Hooks allow the edit on malformed input (see above).

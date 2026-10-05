# Build Log

How Surge was built with Claude Code: what was delegated, what was reviewed, and what the guardrails caught.

## Running totals

| Metric                                            | Value       |
| ------------------------------------------------- | ----------- |
| Calendar days                                     | 1           |
| Focused hours (human)                             | TODO        |
| Commits                                           | 8 (on main) |
| Commits primarily agent-written / human-rewritten | TODO        |
| Bugs caught by hooks                              | 0           |
| Bugs caught by tests                              | 1           |
| Bugs caught by reviewer subagents                 | 0           |
| Bugs that escaped to a manual test                | 0           |
| Parallel sessions (worktrees) used                | 0           |
| PRs merged / PRs blocked by a gate before merge   | 7 / 0       |

## Setup

- `CLAUDE.md`: project rules the agent always follows
- `.claude/skills/`: `/milestone`, `/claim-change`, `/load-run`, `/log-session`
- `.claude/agents/`: `concurrency-reviewer`, `ui-states-reviewer`, `load-test-analyst` (no edit tools; `concurrency-reviewer` and `load-test-analyst` use Bash only to run tests and read output)
- `.claude/settings.json`: hooks (protected-file guard, typecheck + lint on every edit, concurrency suite on every claim-path edit) and permissions (no reading secrets, no force push)
- `.mcp.json`: read-only Postgres MCP for inspecting data during debugging and reconciliation
- Merge gates: lefthook (local) → CI `verify` + `claim-smoke` (real API + k6 spike + reconcile on claim-path PRs) → required `ci-ok` → GitHub ruleset on main (PR-only, up to date, linear, no force push). The agent is blocked from committing/pushing to main, merging, or `--no-verify`.
- Claude PR review on every PR

## Accepted risks

- **Bash can read env files.** The Read deny rules in `.claude/settings.json` cover the file tools, not shell commands such as `cat .env`. Accepted for now because:
  - File-tool reads and edits of real env files are blocked by the permission deny rules, and edits also by `guard-protected-files.mjs`.
  - CLAUDE.md forbids shell workarounds for protected files. Verified 2026-10-05: when asked to add a line to `.env`, the agent declined and didn't attempt it through the shell.
  - No real secrets exist yet: there is no `.env` file, and `.env.example` holds only local placeholder values.
  - Revisit before any real credential (e.g. `ANTHROPIC_API_KEY`) goes into a local env file.

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

### 2026-10-05: guardrail checks, .env guard fix (TODO)

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

### 2026-10-05: branch-guard precision, fail-closed guards, hook tests (TODO)

**Shipped:** PR (this branch). `branch-guard.mjs` now inspects only real git commands: a new `_shell.mjs` splits on `&&` `||` `;` `|` `&` newlines and subshells, honoring quotes, comments, redirections, and heredoc bodies. It blocks pushes that target main/master (`main`, `origin main`, `HEAD:main`, `refs/heads/main`, `+main`, `:main`, `--all`/`--mirror`), and bare `git push` / `git push origin` / `HEAD` pushes while on main. The commit-on-main and `--no-verify` checks run per command. PreToolUse guards fail closed: a missing or invalid payload, or one with no command/file path, is blocked. PostToolUse checks still skip. 144 tests with `node:test` in `.claude/hooks/tests/`.
**Delegated to Claude:** All of the above, developed and tested in a scratch copy before going live.
**Human directed / rewrote:** Specified the push rules, fail-closed behavior, and test coverage.
**Implementation calls (review):**

- `git switch`/`checkout` earlier in the same call updates the branch the later checks use, so `git switch main && git commit` is caught.
- `--all`/`--mirror`/`--branches` are blocked because they push main too.
- `git push -n` is no longer treated as `--no-verify` (for push, `-n` is a dry run); `git commit -n` and clusters like `-nm` still are.
- `editedFile` uses Windows path rules for a Windows project root on any OS, so the Windows-path tests also run on Linux CI.
  **Caught by guardrails / tests:** Running the new tests against the old hooks failed 38 of 144. Besides the known false positives and fail-open behavior, they found that the old guard used `git rev-parse --abbrev-ref HEAD`, which fails in a repo with no commits, so commits there weren't blocked → now `git symbolic-ref`.
  **Claim-path changes:** none
  **Review by hand:** `_shell.mjs` is a partial shell parser; its known gaps are `$(...)` inside double quotes, `eval`, git aliases, and scripts run from the command.
  **Open issues:**
- **M0: add `"test:hooks": "node --test \".claude/hooks/tests/*.test.mjs\""` to the root package.json and run it as part of `pnpm test`.** It needs the glob; Node 24 rejects a directory argument.
- `.claude/settings.json` denies `Edit(./.env.*)`, which also matches `.env.example`, so the permission layer still blocks what the hook now allows.
- Resolved: the branch-guard false positives and fail-open-on-malformed-input issues from the previous entry.

### 2026-10-05: narrow .env permission deny rules (TODO)

**Shipped:** PR (this branch). `.claude/settings.json` denied `Read(./.env.*)` and `Edit(./.env.*)`, which also matched `.env.example`. Deny always wins, so the hook's `.env.example` exception never took effect. The deny rules now cover `**/.env`, `**/.env.local`, `**/.env.*.local`, and `**/.env.production` for both Read and Edit.
**Delegated to Claude:** The settings change and verification.
**Human directed / rewrote:** Specified the problem, the files to deny, and the layering.
**How the layers fit:**

- **Permissions (settings.json):** coarse globs for the real secret files. They stop Read and Edit before any hook runs, and deny always wins, so they must never match a file the agent is meant to edit.
- **Hook (`guard-protected-files.mjs`):** precise matching for edits. It blocks every `.env*` at any depth except `.env.example`, plus lockfiles, applied migrations, and load results. It fails closed on a bad payload.
  **Verified (live Read calls):** Before the change, reading `.env.example` was denied. After: `.env.example` read succeeds; `.env`, `apps/api/.env`, `apps/mobile/.env.development.local`, and `.env.production` are denied. None of those four exist, and a missing file the rules don't cover (`apps/api/.env.test`) returns "does not exist" instead, so the denials come from the rules.
  **Claim-path changes:** none
  **Review by hand:** Whether the deny list should also include `.env.development` and `.env.test`. They aren't denied for Read now, though the hook still blocks edits to them.
  **Open issues:**
- Read deny rules don't cover Bash (`cat .env`). Only the agent's instructions prevent that.

### 2026-10-05: deny more env files, record accepted risk (TODO)

**Shipped:** PR (this branch). Added `**/.env.development`, `**/.env.test`, and `**/.env.staging` to the Read and Edit deny lists in `.claude/settings.json`. Added the "Accepted risks" section above, covering Bash reads of env files.
**Delegated to Claude:** The settings change, verification, and log text.
**Human directed / rewrote:** Chose the extra files and the accepted-risk reasoning.
**Verified (live Read calls):** `apps/api/.env.test` and `.env.staging` are now denied (`apps/api/.env.test` returned "does not exist" before this change); `.env.example` is still readable.
**Claim-path changes:** none
**Open issues:** none new. The Bash gap from the previous entry is now an accepted risk.

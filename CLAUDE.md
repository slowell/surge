# CLAUDE.md

## Project

Surge is a portfolio demo: a fan-membership "Live Drop" feature that must stay fast and correct under a traffic spike. **`SPEC.md` is the source of truth.** Read it before starting any milestone. If something here conflicts with SPEC.md, SPEC.md wins; flag the conflict.

The audience is a hiring manager who will spend ~5 minutes on it. Correctness under concurrency and a polished core flow matter more than feature count.

## Stack

- Monorepo with pnpm workspaces: `apps/mobile` (Expo + expo-router), `apps/api` (Fastify), `apps/admin` (optional), `packages/shared` (zod schemas/types)
- TypeScript everywhere, `strict: true`
- Postgres (Supabase in prod, docker locally), Redis, BullMQ for the fulfillment queue
- Vitest for tests, k6 for load tests

## Commands

Keep this section accurate. Every pnpm script is cross-platform (PowerShell, cmd, bash): no bash-only syntax; use cross-env for env vars.

```
# First time: the human creates .env (the agent can't write env files)
Copy-Item .env.example .env   # PowerShell;  cp .env.example .env on macOS/Linux
docker compose up -d          # postgres 16 + redis 7 (AOF); creates surge_readonly on a fresh volume
pnpm install                  # also installs lefthook git hooks
pnpm db:migrate && pnpm db:seed

pnpm dev                      # api + worker + mobile (Expo)
pnpm typecheck                # every package, plus scripts/
pnpm lint
pnpm test                     # unit + integration (needs docker) + test:hooks
pnpm test:hooks               # .claude/hooks node:test suite
pnpm test:concurrency         # claim race tests (must pass before any claim-path change is done)
pnpm build && pnpm start:api / start:worker   # production-mode boot (used by CI claim-smoke)

pnpm db:promote               # move pending migrations into migrations/applied/ (last commit before a PR)
pnpm db:readonly-role         # (re)apply scripts/readonly-role.sql to an existing database

pnpm load:spike --quick       # STUB until M1 (exits 0). Then: small fixed spike with k6 thresholds
pnpm load:spike               # STUB until M1. Then: k6 spike test (needs tokens: pnpm load:tokens, M1)
pnpm reconcile <dropId>       # STUB until M1 (exits 0). Then: verify Redis == Postgres after a drop
pnpm reconcile --latest --wait-for-drain       # CI form of reconcile (STUB until M1)
scripts/worktrees.sh          # create parallel api/mobile worktrees for M2 (bash: run from Git Bash on Windows)
```

Integration and concurrency tests use `surge_test` on the docker-compose Postgres (created automatically) and never read `.env`. If Docker isn't running, they fail once with "Start Docker Desktop and run docker compose up -d."

## Migrations

- Plain SQL, run by `apps/api/src/db/migrate.ts`. New migrations go in `apps/api/migrations/NNNN_name.sql` (pending), where you can still edit them on your branch.
- As the last commit before opening the PR, run `pnpm db:promote`. It `git mv`s pending files into `apps/api/migrations/applied/`. This is the only sanctioned way into `applied/`; the guard hook blocks direct edits there.
- A migration's identity is its filename, and the runner records a checksum. Editing an applied migration makes `pnpm db:migrate` refuse to run. To change the schema, write a new migration.

## How to work

- **Start every milestone with `/milestone <M#>`.** Any claim-path work follows the `claim-change` skill. Load tests go through `/load-run`. End every session with `/log-session`.

- **One milestone at a time** (see SPEC.md §16). Before writing code for a milestone, post a short plan: files to touch, approach, risks. Then implement.
- **Never work on `main`.** One branch per milestone or change (`m1/claim-path`, `fix/idempotency-ttl`). Open a PR with `gh pr create`, then `gh pr checks --watch`. The human merges; you never do.
- **Small, reviewable commits** with clear messages. One concern per commit. Never use `--no-verify`.
- **Run `pnpm test` before saying anything is done.** If tests fail, fix them or say exactly what is failing and why. Never claim success without running them.
- **Ask, don't guess**, on product or design decisions not covered by the spec. Make reasonable calls on implementation details and note them.
- After each working session, **append to `BUILD_LOG.md`**: date, what was built, what you (Claude) generated, anything the human should review closely, and open issues. Keep entries short and factual.

## Guardrails (read this)

This repo enforces quality mechanically. Work with the guardrails, not around them.

- **Hooks** (`.claude/settings.json`): edits to `.env*`, the lockfile, applied migrations, and `load/results/` are blocked; every TS edit triggers typecheck + lint; every edit under `apps/api/src/claims/` runs the concurrency suite. When a hook blocks or reports a failure, fix the cause. **Never bypass a hook** (e.g. editing a protected file via shell, disabling checks, or weakening a test to pass).
- **Reviewer subagents** (`.claude/agents/`): `concurrency-reviewer` after claim-path or worker changes, `ui-states-reviewer` after screen changes, `load-test-analyst` after load runs. They have no edit tools and are adversarial by design; `concurrency-reviewer` and `load-test-analyst` use Bash only to run tests and read output, and `ui-states-reviewer` has no Bash. Address their critical/high findings before calling work done.
- **Merge gates:** local lefthook (lint/format on commit; typecheck, tests, and concurrency on push) → CI (`verify`, plus `claim-smoke` when the claim path changes) → a single required `ci-ok` check → GitHub ruleset (PR required, up to date with main, threads resolved, linear history). A red check means fix the cause, never weaken the check.
- **MCP Postgres** (`.mcp.json`) is read-only. Use it to inspect data and verify reconciliation, never to "fix" data by hand.
- **Honesty over polish in BUILD_LOG.md.** If you introduced a bug that a guardrail caught, log it.

## Code conventions

- Validate every API boundary with zod schemas from `packages/shared`. Types flow from schemas (`z.infer`); don't hand-write duplicate types.
- No `any`. No non-null assertions (`!`) without a comment explaining why it's safe.
- Keep route handlers thin: parse → call a service function → map result to response.
- Errors: typed result unions for expected outcomes (`SOLD_OUT`, `ALREADY_CLAIMED`, etc.). Throw only for truly unexpected failures.
- Config via env vars validated at startup (zod). Never commit secrets; keep `.env.example` current.
- Structured logging with pino. Log claim outcomes with drop id and result, never tokens.

## The claim path (handle with care)

This is the heart of the demo. Rules:

- Inventory and claim state are mutated **only** inside the Lua script in `apps/api/src/claims/claim.lua`. No other code path may DECR inventory or SADD claimers.
- The script must stay a single atomic EVAL/EVALSHA. No multi-round-trip check-then-act.
- Challenge answers are validated **before** the script; wrong answers never touch inventory.
- Idempotency: the same `Idempotency-Key` must always return the same response.
- Postgres writes happen in the worker, never in the request path. Unique constraints are the backstop.
- **Any change to the claim path requires `pnpm test:concurrency` to pass**, and the change must be described in BUILD_LOG.md.

## Performance rules

- Request path for `/claim`: auth check → rate limit → admission → answer check → one Lua call → enqueue → respond. Nothing else. No DB queries.
- SSE: one broadcast ticker per process reads Redis once per tick and fans out. Never read Redis per connected client.
- Over capacity, return `429` with `Retry-After`. Never let overload turn into 5xx.

## AI feature conventions (challenge drafting)

- The Claude API is called only from `apps/api/src/ai/`, only from admin endpoints, and never on the claim path.
- Model id comes from `ANTHROPIC_MODEL`; the API key comes from env and is never logged.
- Every model response is parsed and validated with zod before use. On invalid output, retry once with the validation errors, then fail clearly.
- Prompts live in versioned files (`apps/api/src/ai/prompts/*.md`), not inline strings.
- Tests use recorded fixtures; CI never calls the live API.

## Mobile/UI conventions

- expo-router file-based routes. Shared UI primitives in `apps/mobile/src/ui`.
- Every async screen has designed **loading, empty, error, and success** states. No raw spinners as the only feedback.
- Never optimistically show "Claimed." Show it only after the server confirms.
- Waiting room retries use jittered exponential backoff and respect `Retry-After`.
- Animations should feel smooth and intentional (Reanimated). Respect reduced-motion settings.
- Use `react-native-sse` for streams; fall back to 2s polling if the stream drops.

## Branding (non-negotiable)

Generic fan-club branding only. **No real creator names, likenesses, logos, or trademarked product names** anywhere: code, seed data, images, copy, or commit messages. Use invented sponsors and rewards in seed data.

## Out of scope

Real payments, real auth providers, real push notifications, native store builds. Don't add them, even partially. If something seems necessary that's out of scope, ask first.

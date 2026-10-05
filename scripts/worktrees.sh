#!/usr/bin/env bash
# Spin up parallel Claude Code workspaces for M2 (backend hardening + mobile client at the same time).
# The shared zod contract in packages/shared is what makes this safe: both sides build against one schema.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
NAME="$(basename "$ROOT")"
cd "$ROOT"

for lane in api mobile; do
  dir="../${NAME}-${lane}"
  branch="lane/${lane}"
  if [ ! -d "$dir" ]; then
    git worktree add -b "$branch" "$dir" 2>/dev/null || git worktree add "$dir" "$branch"
    (cd "$dir" && pnpm install --frozen-lockfile >/dev/null)
    echo "Created $dir on $branch"
  fi
done

cat <<MSG

Open one terminal per lane and run \`claude\` in each:
  cd ../${NAME}-api     # backend lane: claims, worker, SSE, admission
  cd ../${NAME}-mobile  # client lane: Expo screens and states

Rules:
  - Contract changes (packages/shared) happen on main first, then both lanes rebase.
  - Merge each lane through a PR so CI and the Claude review run.
  - Note the parallel session in BUILD_LOG.md.

Clean up afterwards: git worktree remove ../${NAME}-api && git worktree remove ../${NAME}-mobile
MSG

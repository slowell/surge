---
name: milestone
description: Run one SPEC.md milestone end to end with plan, tests first, implement, review, and log. Use when starting work on M0–M4.
disable-model-invocation: true
---

# /milestone <M0|M1|M2|M3|M4>

Run exactly one milestone. Don't start the next one.

0. **Branch.** `git switch -c m<N>/<slug>` from an up-to-date main.
1. **Orient.** Read SPEC.md (the milestone row in §16 plus the sections it touches) and the last BUILD_LOG.md entry. Run `git status` and `pnpm test` to confirm a clean, green starting point.
2. **Plan.** Post a plan: goal, files to create/change, order of work, the tests that will prove it works, and risks. List every assumption that is not in the spec. **Wait for approval** before writing code.
3. **Tests first** for anything with correctness risk (claim path, idempotency, ledger, reconcile). Commit the failing tests on their own.
4. **Implement** in small commits, one concern each, using conventional messages (`feat(api): ...`, `test(claims): ...`).
5. **Verify.** `pnpm typecheck && pnpm test`, plus `pnpm test:concurrency` if the claim path was touched. Exercise the feature manually where possible and say what you did.
6. **Review.** Delegate to the matching subagent:
   - claim path, worker, admission → `concurrency-reviewer`
   - mobile screens → `ui-states-reviewer`
   Fix every critical/high finding. For anything deferred, say why.
7. **Log.** Run `/log-session`.
7b. **Open the PR.** `git push -u origin <branch>`, `gh pr create` with a body covering what/why, tests added, reviewer verdicts, and screenshots for UI work. Then `gh pr checks --watch`. If `ci-ok` fails, fix the cause and push again. Don't merge; the human merges once CI is green and the Claude review comment is addressed.
8. **Report.** What shipped, what was cut or deferred, and what the human should review by hand.

#!/usr/bin/env bash
# Server-side merge gate: a GitHub ruleset on the default branch.
# Nothing reaches main unless it came through a PR, CI's `ci-ok` check is green
# on the latest commit, the branch is up to date with main, and all review threads are resolved.
# Requires: gh CLI authenticated with admin rights on the repo. Run once, after CI has run at least once.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
echo "Applying ruleset to $REPO ..."

gh api --method POST "repos/${REPO}/rulesets" --input - << 'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "ci-ok" } ]
      }
    }
  ]
}
JSON

echo "Done. Verify: gh api repos/${REPO}/rulesets"
echo "Also set: Settings → General → Pull Requests → allow squash merging only, and auto-delete head branches."

// PreToolUse (Bash): keep the agent off main and stop it from skipping local gates.
// All work lands through a PR so CI and branch protection decide what merges.
import { spawnSync } from "node:child_process";
import { readHookInput, block } from "./_input.mjs";

const cmd = String(readHookInput()?.tool_input?.command ?? "");
if (!/\bgit\b/.test(cmd)) process.exit(0);

if (/--no-verify\b|(^|\s)-n(\s|$)/.test(cmd) && /\bgit\s+(commit|push)\b/.test(cmd)) {
  block("Blocked: --no-verify skips the local merge gates. Fix the failing check instead.");
}

if (/\bgit\s+push\b/.test(cmd) && /\b(main|master)\b/.test(cmd)) {
  block("Blocked: never push to main. Push your branch and open a PR (gh pr create).");
}

if (/\bgit\s+(commit|merge|rebase)\b/.test(cmd)) {
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
    cwd: process.env.CLAUDE_PROJECT_DIR,
  }).stdout.trim();
  if (branch === "main" || branch === "master") {
    block(
      `Blocked: you're on ${branch}. Create a branch first, e.g. git switch -c m1/claim-path, then commit there.`,
    );
  }
}
process.exit(0);

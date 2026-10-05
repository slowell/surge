// PostToolUse: any edit to the claim path runs the concurrency suite immediately.
// The agent cannot move on with a broken claim path, because failures are fed straight back.
import { spawnSync } from "node:child_process";
import { readHookInput, editedFile, block } from "./_input.mjs";

const file = editedFile(readHookInput());
if (!file || !file.startsWith("apps/api/src/claims/")) process.exit(0);

const res = spawnSync("pnpm", ["test:concurrency"], {
  encoding: "utf8",
  cwd: process.env.CLAUDE_PROJECT_DIR,
  timeout: 180_000,
  shell: process.platform === "win32", // pnpm is pnpm.cmd on Windows
});

if (res.status !== 0) {
  block(
    `Claim path changed (${file}) and the concurrency suite FAILED. ` +
      `Fix it before doing anything else, then note the change in BUILD_LOG.md.\n` +
      (res.stdout + res.stderr).slice(-4000),
  );
}
process.exit(0);

// PreToolUse: refuse edits to secrets, lockfiles, migrations already applied, and recorded load-test results.
import { readHookInput, editedFile, block } from "./_input.mjs";

const file = editedFile(readHookInput());
if (!file) process.exit(0);

const rules = [
  [/^\.env(\..+)?$/, "Secrets live in .env and are never edited by the agent. Update .env.example instead."],
  [/(^|\/)pnpm-lock\.yaml$/, "Don't hand-edit the lockfile. Change package.json and run pnpm install."],
  [/^apps\/api\/migrations\/applied\//, "Applied migrations are immutable. Write a new migration instead."],
  [/^load\/results\//, "Load-test results are evidence. They are written by /load-run, never edited by hand."],
];

for (const [pattern, reason] of rules) {
  if (pattern.test(file)) block(`Blocked edit to ${file}: ${reason}`);
}
process.exit(0);

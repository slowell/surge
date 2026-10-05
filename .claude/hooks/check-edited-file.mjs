// PostToolUse: typecheck the edited file's package and lint the file. Failures go back to Claude to fix.
import { spawnSync } from "node:child_process";
import { readHookInput, editedFile, block } from "./_input.mjs";

const file = editedFile(readHookInput());
if (!file || !/\.(ts|tsx)$/.test(file)) process.exit(0);

const pkgMatch = file.match(/^(apps|packages)\/([^/]+)\//);
if (!pkgMatch) process.exit(0);
const pkgDir = `${pkgMatch[1]}/${pkgMatch[2]}`;

const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", cwd: process.env.CLAUDE_PROJECT_DIR });

const tsc = run("pnpm", ["--dir", pkgDir, "exec", "tsc", "--noEmit", "--pretty", "false"]);
if (tsc.status !== 0) {
  block(`Typecheck failed in ${pkgDir} after editing ${file}:\n${(tsc.stdout + tsc.stderr).slice(0, 4000)}`);
}

const lint = run("pnpm", ["exec", "eslint", "--max-warnings=0", file]);
if (lint.status !== 0) {
  block(`Lint failed for ${file}:\n${(lint.stdout + lint.stderr).slice(0, 4000)}`);
}
process.exit(0);

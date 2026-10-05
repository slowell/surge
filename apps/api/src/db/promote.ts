// `pnpm db:promote`: move pending migrations into migrations/applied/, where they become immutable.
// Run it as the last commit before opening a PR that adds a migration. It uses `git mv` (a rename,
// not an edit), and migrate.ts identifies migrations by filename, so promoted files aren't re-run.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
const APPLIED = path.join(DIR, "applied");

const pending = readdirSync(DIR).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f));
if (pending.length === 0) {
  console.log("No pending migrations to promote.");
  process.exit(0);
}

mkdirSync(APPLIED, { recursive: true });
for (const f of pending) {
  if (existsSync(path.join(APPLIED, f))) {
    console.error(`applied/${f} already exists. Rename the pending migration to the next free number.`);
    process.exit(1);
  }
}

for (const f of pending) {
  // Track the file first so `git mv` works for a migration that was never committed.
  execFileSync("git", ["add", "--", path.join(DIR, f)], { stdio: "inherit" });
  execFileSync("git", ["mv", "--", path.join(DIR, f), path.join(APPLIED, f)], { stdio: "inherit" });
  console.log(`promoted ${f} → applied/${f}`);
}
console.log("Commit the rename. From now on these files are immutable; write a new migration for any change.");

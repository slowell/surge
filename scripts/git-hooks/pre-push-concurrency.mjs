// lefthook pre-push: run the concurrency suite when the push touches the claim path,
// or when the branch has no upstream yet (first push), since then we can't tell what changed.
import { execFileSync, spawnSync } from "node:child_process";

const CLAIM_PATH = /^(apps\/api\/src\/(claims|worker|admission)|packages\/shared)\//;

function changedSincePush() {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", "@{push}"], { stdio: "ignore" });
  } catch {
    return null; // no upstream yet
  }
  return execFileSync("git", ["diff", "--name-only", "@{push}..HEAD"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const changed = changedSincePush();
if (changed !== null && !changed.some((f) => CLAIM_PATH.test(f))) process.exit(0);

const res = spawnSync("pnpm", ["test:concurrency"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(res.status ?? 1);

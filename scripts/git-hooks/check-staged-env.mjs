// lefthook pre-commit: refuse to commit any .env file except .env.example, at any depth.
// A Node script rather than inline sh, because lefthook on Windows mangles multi-line `sh -c` scripts.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** @param {string[]} paths repo-relative paths with "/" separators */
export function findEnvFiles(paths) {
  return paths.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !/(^|\/)\.env\.example$/.test(f));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const staged = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const envFiles = findEnvFiles(staged);
  if (envFiles.length > 0) {
    console.error(`Refusing to commit an .env file:\n  ${envFiles.join("\n  ")}`);
    process.exit(1);
  }
}

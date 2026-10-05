// Runs a hook script as Claude Code would: payload on stdin, CLAUDE_PROJECT_DIR in the environment.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Pass `raw` to send stdin verbatim (for malformed payloads); otherwise the payload is JSON.stringify'd.
export function runHook(hook, payload, { projectDir = process.cwd(), raw } = {}) {
  const res = spawnSync(process.execPath, [path.join(HOOKS_DIR, hook)], {
    input: raw ?? JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { code: res.status, stderr: res.stderr };
}

export const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
export const edit = (file_path) => ({ tool_name: "Edit", tool_input: { file_path, old_string: "a", new_string: "b" } });

// An empty git repository with `branch` checked out. Returns its path and a cleanup function.
export function tempRepo(branch) {
  const dir = mkdtempSync(path.join(tmpdir(), "surge-hook-test-"));
  const res = spawnSync("git", ["init", "-q", "-b", branch, dir], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`git init failed: ${res.stderr}`);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const MALFORMED_PAYLOADS = {
  "empty stdin": "",
  "whitespace only": " \n",
  "invalid JSON": "{not json",
  "truncated JSON": '{"tool_input":{"command":"git push',
  // Single backslashes, as in a hand-built payload: \U and \d are invalid JSON escapes.
  "unescaped Windows path": '{"tool_input":{"file_path":"C:\\Users\\dev\\.env"}}',
  "JSON null": "null",
  "JSON array": "[]",
  "JSON string": '"git push origin main"',
};

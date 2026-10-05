// Shared helper: read the hook payload Claude Code sends on stdin.
import { readFileSync } from "node:fs";
import path from "node:path";

export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

export function editedFile(input) {
  const p = input?.tool_input?.file_path ?? input?.tool_input?.path;
  if (!p) return null;
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  return path.relative(root, path.resolve(root, p)).split(path.sep).join("/");
}

// Exit code 2 = blocking: stderr is fed back to Claude so it can fix the problem.
export function block(message) {
  process.stderr.write(message.trim() + "\n");
  process.exit(2);
}

// Shared helpers: read the hook payload Claude Code sends on stdin and normalize edited paths.
import { readFileSync } from "node:fs";
import path from "node:path";

// Returns the parsed payload, or null if stdin is empty, unreadable, or not a JSON object.
export function readHookInput() {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return null;
  }
  if (!raw.trim()) return null;
  try {
    const input = JSON.parse(raw);
    return input && typeof input === "object" && !Array.isArray(input) ? input : null;
  } catch {
    return null;
  }
}

// PreToolUse guards fail closed: if the payload can't be read, the call can't be proven safe.
// PostToolUse checks use readHookInput directly and skip instead.
export function readHookInputOrBlock(hook) {
  const input = readHookInput();
  if (!input) {
    block(
      `Blocked by ${hook}: the hook payload was missing or was not valid JSON, so this tool call could not be checked. ` +
        `Retry the call; if it keeps happening, check the hook command in .claude/settings.json.`,
    );
  }
  return input;
}

// Project-relative path of the file a Write/Edit/MultiEdit targets, with "/" separators.
export function editedFile(input) {
  const p = input?.tool_input?.file_path ?? input?.tool_input?.path;
  if (typeof p !== "string" || !p) return null;
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  // Use Windows path rules for a Windows project root even off Windows, so tests behave the same on Linux CI.
  const paths = process.platform === "win32" || /^([A-Za-z]:[\\/]|\\\\)/.test(root) ? path.win32 : path.posix;
  return paths.relative(root, paths.resolve(root, p)).split(paths.sep).join("/");
}

// Exit code 2 = blocking: stderr is fed back to Claude so it can fix the problem.
export function block(message) {
  process.stderr.write(message.trim() + "\n");
  process.exit(2);
}

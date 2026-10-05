// PostToolUse checks skip (exit 0) when they can't read the payload or the file isn't theirs.
// These cases return before spawning pnpm, so they run without a workspace.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { runHook, edit, MALFORMED_PAYLOADS } from "./helpers.mjs";

const WIN_ROOT = "C:\\Users\\dev\\surge";
const POSIX_ROOT = "/home/dev/surge";

for (const hook of ["check-edited-file.mjs", "claim-path-gate.mjs"]) {
  describe(hook, () => {
    for (const [name, raw] of Object.entries(MALFORMED_PAYLOADS)) {
      test(`skips on ${name}`, () => {
        assert.equal(runHook(hook, undefined, { projectDir: POSIX_ROOT, raw }).code, 0);
      });
    }
    test("skips a payload without a file path", () => {
      assert.equal(runHook(hook, { tool_name: "Edit", tool_input: {} }, { projectDir: POSIX_ROOT }).code, 0);
    });
    test("skips files it doesn't check", () => {
      for (const file of ["BUILD_LOG.md", "apps/api/src/server.js", "scripts/worktrees.sh"]) {
        assert.equal(runHook(hook, edit(`${POSIX_ROOT}/${file}`), { projectDir: POSIX_ROOT }).code, 0, file);
        assert.equal(runHook(hook, edit(`${WIN_ROOT}\\${file.replaceAll("/", "\\")}`), { projectDir: WIN_ROOT }).code, 0, file);
      }
    });
  });
}

test("claim-path-gate skips TypeScript outside apps/api/src/claims/", () => {
  for (const file of ["apps/api/src/routes/drops.ts", "apps/api/src/claimsHelper.ts", "packages/shared/src/claims.ts"]) {
    assert.equal(runHook("claim-path-gate.mjs", edit(`${WIN_ROOT}\\${file.replaceAll("/", "\\")}`), { projectDir: WIN_ROOT }).code, 0, file);
  }
});

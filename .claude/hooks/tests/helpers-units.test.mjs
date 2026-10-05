// Unit tests for the shared helpers: path normalization and the shell splitter.
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { editedFile } from "../_input.mjs";
import { splitCommands, gitInvocation } from "../_shell.mjs";

describe("editedFile", () => {
  const original = process.env.CLAUDE_PROJECT_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = original;
  });
  const rel = (root, file_path) => {
    process.env.CLAUDE_PROJECT_DIR = root;
    return editedFile({ tool_input: { file_path } });
  };

  test("windows backslashes, forward slashes, and mixed case", () => {
    assert.equal(rel("C:\\Users\\dev\\surge", "C:\\Users\\dev\\surge\\apps\\api\\src\\claims\\claim.lua"), "apps/api/src/claims/claim.lua");
    assert.equal(rel("C:\\Users\\dev\\surge", "C:/Users/dev/surge/apps/api/.env"), "apps/api/.env");
    assert.equal(rel("C:\\Users\\dev\\surge", "c:\\users\\dev\\SURGE\\.env"), ".env");
    assert.equal(rel("C:/Users/dev/surge", "C:\\Users\\dev\\surge\\SPEC.md"), "SPEC.md");
  });
  test("relative paths and posix roots", () => {
    assert.equal(rel("C:\\Users\\dev\\surge", "apps\\mobile\\.env.local"), "apps/mobile/.env.local");
    assert.equal(rel("/home/dev/surge", "/home/dev/surge/apps/api/.env"), "apps/api/.env");
    assert.equal(rel("/home/dev/surge", "apps/api/.env"), "apps/api/.env");
  });
  test("missing or non-string paths", () => {
    assert.equal(editedFile(null), null);
    assert.equal(editedFile({}), null);
    assert.equal(editedFile({ tool_input: { file_path: 42 } }), null);
  });
});

describe("splitCommands", () => {
  test("splits on && || ; | & and newlines", () => {
    assert.deepEqual(splitCommands("a 1 && b 2 || c; d | e & f\ng"), [["a", "1"], ["b", "2"], ["c"], ["d"], ["e"], ["f"], ["g"]]);
  });
  test("keeps quoted text as one word", () => {
    assert.deepEqual(splitCommands(`git commit -m "a; git push origin main" -m 'b && c'`), [["git", "commit", "-m", "a; git push origin main", "-m", "b && c"]]);
  });
  test("skips heredoc bodies and comments", () => {
    assert.deepEqual(splitCommands("cat <<'EOF' > f\ngit push origin main\nEOF\nls # git push origin main"), [["cat"], ["ls"]]);
  });
  test("drops redirection targets and fd numbers", () => {
    assert.deepEqual(splitCommands("git push origin x 2>&1 > out.log | tail -3"), [["git", "push", "origin", "x"], ["tail", "-3"]]);
  });
});

describe("gitInvocation", () => {
  test("finds the subcommand past prefixes and git options", () => {
    assert.deepEqual(gitInvocation(["FOO=1", "command", "git", "-C", "dir", "-c", "k=v", "--no-pager", "push", "origin", "main"]), {
      subcommand: "push",
      args: ["origin", "main"],
    });
    assert.equal(gitInvocation(["C:\\Program Files\\Git\\cmd\\git.exe", "push"]).subcommand, "push");
  });
  test("ignores other programs", () => {
    assert.equal(gitInvocation(["gh", "pr", "create", "--base", "main"]), null);
    assert.equal(gitInvocation(["echo", "git", "push"]), null);
  });
});

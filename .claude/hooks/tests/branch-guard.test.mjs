import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { runHook, bash, tempRepo, MALFORMED_PAYLOADS } from "./helpers.mjs";

const HOOK = "branch-guard.mjs";
let feature;
let main;
before(() => {
  feature = tempRepo("fix/env-example-guard");
  main = tempRepo("main");
});
after(() => {
  feature.cleanup();
  main.cleanup();
});

const allowed = (repo, command) => {
  const { code, stderr } = runHook(HOOK, bash(command), { projectDir: repo.dir });
  assert.equal(code, 0, `expected allowed: ${command}\n${stderr}`);
};
const blocked = (repo, command, message = /Blocked/) => {
  const { code, stderr } = runHook(HOOK, bash(command), { projectDir: repo.dir });
  assert.equal(code, 2, `expected blocked: ${command}`);
  assert.match(stderr, message);
};

describe("false positives from the old substring check", () => {
  test("feature-branch push chained with gh pr create --base main", () => {
    allowed(feature, 'git push -u origin fix/env-example-guard && gh pr create --base main --title "fix: x"');
  });
  test("PR body heredoc that quotes a push to main", () => {
    allowed(
      feature,
      [
        'gh pr create --base main --head fix/x --body "$(cat <<\'EOF\'',
        "## Notes",
        "git push origin main",
        "- `git push origin my-branch && gh pr create --base main` was falsely blocked",
        "EOF",
        ')"',
      ].join("\n"),
    );
  });
  test("unquoted heredoc body with a push line, followed by a real feature push", () => {
    allowed(feature, "cat > notes.md <<'EOF'\ngit push origin main\nEOF\ngit push origin fix/env-example-guard");
    allowed(feature, "cat <<-EOF > notes.md\n\tgit push origin main\n\tEOF\ngit status");
  });
  test("a real push to main after a heredoc is still caught", () => {
    blocked(feature, "cat > notes.md <<'EOF'\nnotes\nEOF\ngit push origin main", /never push to main/);
  });
  test("double-quoted body mentioning a push to main", () => {
    allowed(feature, 'gh pr create --base main --body "Never run git push origin main; use a PR."');
  });
  test("commit message mentioning a push to main", () => {
    allowed(feature, 'git commit -m "docs: explain why git push origin main is blocked"');
  });
  test("echo and grep of push text", () => {
    allowed(feature, "echo 'git push origin main' && grep -n 'git push' .claude/hooks/branch-guard.mjs");
  });
  test("branch names that only contain main", () => {
    allowed(feature, "git push origin feature/main-menu");
    allowed(feature, "git push -u origin maintenance");
  });
  test("reading main is fine", () => {
    allowed(feature, "git log --oneline main..HEAD && git diff main...HEAD --stat && git fetch origin main");
  });
  test("push to a feature branch with redirection and a pipe", () => {
    allowed(feature, "git push origin fix/env-example-guard 2>&1 | tail -3");
  });
  test("non-git commands", () => {
    allowed(feature, "ls -la && pnpm test");
  });
});

describe("pushes that explicitly target main or master", () => {
  for (const command of [
    "git push origin main",
    "git push origin master",
    "git push main",
    "git push origin HEAD:main",
    "git push origin fix/x:refs/heads/main",
    "git push origin refs/heads/main",
    "git push origin +main",
    "git push origin :main",
    "git push --force-with-lease origin main",
    "git push -u origin fix/x main",
    "git -C . push origin main",
    "FOO=1 git push origin main",
    "cd apps && git push origin main",
    "git status; git push origin main",
    "false || git push origin main",
    "cd apps\ngit push origin main",
    "(git push origin main)",
    'echo "$(git rev-parse HEAD)" && $(git push origin main)',
    "git push origin main 2>&1 | tail -3",
    "git push origin \\\n  main",
  ]) {
    test(JSON.stringify(command), () => blocked(feature, command, /never push to main/));
  }
  test("--all and --mirror push main too", () => {
    blocked(feature, "git push --all origin", /also pushes main/);
    blocked(feature, "git push --mirror origin", /also pushes main/);
  });
});

describe("implicit pushes while on main", () => {
  for (const command of ["git push", "git push origin", "git push -u origin", "git push origin HEAD", "git push --force"]) {
    test(JSON.stringify(command), () => blocked(main, command, /you're on main/));
  }
  test("the same pushes are fine on a feature branch", () => {
    for (const command of ["git push", "git push origin", "git push -u origin", "git push origin HEAD"]) allowed(feature, command);
  });
  test("an explicit non-main target is fine on main", () => {
    allowed(main, "git push origin HEAD:fix/x");
  });
});

describe("commits on main", () => {
  test("commit, merge and rebase on main are blocked", () => {
    blocked(main, 'git commit -m "x"', /you're on main/);
    blocked(main, "git merge fix/x", /you're on main/);
    blocked(main, "git rebase fix/x", /you're on main/);
  });
  test("creating a branch first in the same call is fine", () => {
    allowed(main, 'git switch -c fix/x && git add -A && git commit -m "x" && git push -u origin fix/x');
    allowed(main, 'git checkout -b fix/x && git commit -m "x"');
  });
  test("switching to main earlier in the same call is caught", () => {
    blocked(feature, 'git switch main && git commit -m "x"', /you're on main/);
    blocked(feature, "git checkout main && git push", /you're on main/);
  });
  test("commits on a feature branch are fine", () => {
    allowed(feature, 'git add -A && git commit -q -m "fix: x"');
  });
  test("mentioning git commit in text is not a commit", () => {
    allowed(main, 'echo "run git commit after review"');
  });
});

describe("--no-verify", () => {
  for (const command of [
    'git commit --no-verify -m "x"',
    'git commit -n -m "x"',
    'git commit -nm "x"',
    'git commit -am "x" --no-verify',
    "git push --no-verify origin fix/x",
  ]) {
    test(JSON.stringify(command), () => blocked(feature, command, /--no-verify/));
  }
  test("-n inside a commit message is not a flag", () => {
    allowed(feature, 'git commit -m -n');
    allowed(feature, 'git commit -m "use -n for a dry run"');
  });
  test("git push -n is a dry run, not --no-verify", () => {
    allowed(feature, "git push -n origin fix/x");
  });
});

describe("fails closed on a bad payload", () => {
  for (const [name, raw] of Object.entries(MALFORMED_PAYLOADS)) {
    test(name, () => {
      const { code, stderr } = runHook(HOOK, undefined, { projectDir: feature.dir, raw });
      assert.equal(code, 2);
      assert.match(stderr, /branch-guard: the hook payload was missing or was not valid JSON/);
    });
  }
  test("payload without a command", () => {
    const { code, stderr } = runHook(HOOK, { tool_name: "Bash", tool_input: {} }, { projectDir: feature.dir });
    assert.equal(code, 2);
    assert.match(stderr, /no Bash command/);
  });
});

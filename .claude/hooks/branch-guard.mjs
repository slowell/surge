// PreToolUse (Bash): keep the agent off main and stop it from skipping local gates.
// All work lands through a PR so CI and branch protection decide what merges.
// Only real git invocations are inspected, so text that mentions main (a PR body, gh pr create --base main) is fine.
import { spawnSync } from "node:child_process";
import { readHookInputOrBlock, block } from "./_input.mjs";
import { splitCommands, gitInvocation } from "./_shell.mjs";

const PROTECTED = new Set(["main", "master"]);

const cmd = readHookInputOrBlock("branch-guard").tool_input?.command;
if (typeof cmd !== "string") block("Blocked by branch-guard: the hook payload had no Bash command, so this call could not be checked.");
if (!/\bgit\b/.test(cmd)) process.exit(0);

// The branch each command runs on. Starts as the checked-out branch and follows any git switch/checkout earlier in the same call.
let branch = spawnSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
  encoding: "utf8",
  cwd: process.env.CLAUDE_PROJECT_DIR,
}).stdout?.trim() ?? "";

for (const words of splitCommands(cmd)) {
  const git = gitInvocation(words);
  if (!git) continue;
  const { subcommand, args } = git;

  if (subcommand === "switch" || subcommand === "checkout") branch = branchAfterSwitch(subcommand, args) ?? branch;

  if ((subcommand === "commit" && commitSkipsHooks(args)) || (subcommand === "push" && args.includes("--no-verify"))) {
    block("Blocked: --no-verify skips the local merge gates. Fix the failing check instead.");
  }

  if (subcommand === "push") checkPush(args);

  if (["commit", "merge", "rebase"].includes(subcommand) && PROTECTED.has(branch)) {
    block(`Blocked: you're on ${branch}. Create a branch first, e.g. git switch -c m1/claim-path, then commit there.`);
  }
}
process.exit(0);

function checkPush(args) {
  const optionsWithValue = new Set(["--repo", "-o", "--push-option", "--receive-pack", "--exec"]);
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-")) positional.push(arg);
    else if (optionsWithValue.has(arg)) i++;
    else if (["--all", "--mirror", "--branches"].includes(arg)) {
      block(`Blocked: git push ${arg} also pushes main. Push your branch by name and open a PR (gh pr create).`);
    }
  }

  // Every positional word: the first is usually the remote, but "git push main" is treated as a target too.
  const targets = positional.map(pushDestination);
  if (targets.some((t) => PROTECTED.has(t))) {
    block("Blocked: never push to main. Push your branch and open a PR (gh pr create).");
  }

  // With no refspec (bare "git push" or "git push origin"), or with HEAD, git pushes the current branch.
  const refspecs = targets.slice(1);
  if (PROTECTED.has(branch) && (refspecs.length === 0 || refspecs.some((t) => t === "HEAD" || t === "@"))) {
    block(`Blocked: you're on ${branch}, so this push would update ${branch}. Create a branch, push it, and open a PR (gh pr create).`);
  }
}

// "main", "+main", "HEAD:main", "src:refs/heads/main", ":main" (delete) all target main.
function pushDestination(refspec) {
  const spec = refspec.replace(/^\+/, "");
  const destination = spec.includes(":") ? spec.slice(spec.lastIndexOf(":") + 1) : spec;
  return destination.replace(/^refs\/heads\//, "");
}

// git commit -n is --no-verify, including inside short-flag clusters like -nm.
function commitSkipsHooks(args) {
  const optionsWithValue = new Set(["-m", "-F", "-c", "-C", "-t", "--message", "--file", "--author", "--date", "--template", "--reuse-message", "--reedit-message", "--trailer", "--cleanup", "--fixup", "--squash"]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") break;
    if (arg === "--no-verify") return true;
    if (optionsWithValue.has(arg)) {
      i++;
      continue;
    }
    if (/^-[A-Za-z]+$/.test(arg)) {
      for (const flag of arg.slice(1)) {
        if (flag === "n") return true;
        if ("mFcCt".includes(flag)) break; // the rest of the cluster is this option's value
      }
    }
  }
  return false;
}

// The branch a switch/checkout moves to, or null when it can't be known (e.g. checkout of a path).
function branchAfterSwitch(subcommand, args) {
  const createFlags = subcommand === "switch" ? ["-c", "-C", "--create", "--force-create"] : ["-b", "-B"];
  for (let i = 0; i < args.length; i++) {
    if (createFlags.includes(args[i])) return args[i + 1] ?? null;
    if (args[i] === "--") return null;
  }
  const target = args.find((a) => !a.startsWith("-"));
  if (!target) return null;
  // git checkout <x> may be a path, so only trust it for a protected branch name.
  return subcommand === "switch" || PROTECTED.has(target) ? target : null;
}

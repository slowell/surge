// Just enough shell parsing for branch-guard to find the git commands a Bash call would run.
// Not a full shell parser. It honors quotes, escapes, comments, redirections, and heredoc bodies, and
// splits on && || ; | & newlines ( ) and backticks. Text inside quotes or heredocs is never a command.
// Known gaps: $(...) inside double quotes, eval, aliases, and scripts invoked from the command.
import path from "node:path";

const SEPARATORS = new Set([";", "&", "|", "\n", "(", ")", "`"]);
const WORD_END = new Set([" ", "\t", "\r", "<", ">", ...SEPARATORS]);

// Returns one array of words per simple command.
export function splitCommands(cmd) {
  const commands = [];
  const heredocs = [];
  let words = [];
  let word = "";
  let inWord = false;
  let dropNextWord = false; // the next word is a redirection target, not an argument

  const endWord = () => {
    if (!inWord) return;
    if (dropNextWord) dropNextWord = false;
    else words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    dropNextWord = false;
    if (words.length) commands.push(words);
    words = [];
  };

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];

    if (c === "\\") {
      if (cmd[i + 1] !== "\n" && i + 1 < cmd.length) {
        word += cmd[i + 1];
        inWord = true;
      }
      i++;
    } else if (c === "'") {
      const end = cmd.indexOf("'", i + 1);
      const stop = end === -1 ? cmd.length : end;
      word += cmd.slice(i + 1, stop);
      inWord = true;
      i = stop;
    } else if (c === '"') {
      let j = i + 1;
      while (j < cmd.length && cmd[j] !== '"') {
        if (cmd[j] === "\\" && j + 1 < cmd.length && '"\\$`'.includes(cmd[j + 1])) j++;
        word += cmd[j++];
      }
      inWord = true;
      i = j;
    } else if (c === "#" && !inWord) {
      const end = cmd.indexOf("\n", i);
      i = (end === -1 ? cmd.length : end) - 1;
    } else if (c === "<" && cmd.startsWith("<<", i) && !cmd.startsWith("<<<", i)) {
      endWord();
      const m = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()]+))/.exec(cmd.slice(i));
      if (m) {
        heredocs.push({ delimiter: m[2] ?? m[3] ?? m[4], stripTabs: m[1] === "-" });
        i += m[0].length - 1;
      } else {
        i++;
      }
    } else if (c === "<" || c === ">" || (c === "&" && cmd[i + 1] === ">")) {
      // Redirection: drop a file-descriptor number before it and the target after it.
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      }
      endWord();
      while ("<>&|".includes(cmd[i + 1] ?? " ") && cmd[i + 1] !== undefined) i++;
      dropNextWord = true;
    } else if (c === "$" && cmd[i + 1] === "(") {
      endCommand();
      i++;
    } else if (SEPARATORS.has(c)) {
      endCommand();
      if (c === "\n" && heredocs.length) i = skipHeredocBodies(cmd, i + 1, heredocs.splice(0)) - 1;
    } else if (WORD_END.has(c)) {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

// Skips heredoc bodies that start at `start`; returns the index just past the last delimiter line.
function skipHeredocBodies(cmd, start, heredocs) {
  let i = start;
  for (const { delimiter, stripTabs } of heredocs) {
    while (i < cmd.length) {
      const end = cmd.indexOf("\n", i);
      const lineEnd = end === -1 ? cmd.length : end;
      let line = cmd.slice(i, lineEnd).replace(/\r$/, "");
      if (stripTabs) line = line.replace(/^\t+/, "");
      i = lineEnd + 1;
      if (line === delimiter) break;
    }
  }
  return Math.min(i, cmd.length);
}

const PREFIX_WORDS = new Set(["command", "exec", "time", "nohup", "env", "sudo", "builtin", "!", "{", "}", "if", "then", "else", "elif", "while", "until", "do"]);
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--exec-path"]);

// If the words run git, returns its subcommand and the arguments after it; otherwise null.
export function gitInvocation(words) {
  let i = 0;
  while (i < words.length && (PREFIX_WORDS.has(words[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i++;
  const program = path.posix.basename((words[i] ?? "").replaceAll("\\", "/")).toLowerCase();
  if (program !== "git" && program !== "git.exe") return null;
  i++;
  while (i < words.length && words[i].startsWith("-")) {
    if (GIT_OPTIONS_WITH_VALUE.has(words[i])) i++;
    i++;
  }
  if (i >= words.length) return null;
  return { subcommand: words[i], args: words.slice(i + 1) };
}

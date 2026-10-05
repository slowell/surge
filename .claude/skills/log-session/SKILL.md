---
name: log-session
description: Append an honest, metrics-backed entry to BUILD_LOG.md at the end of a working session.
disable-model-invocation: true
---

# /log-session

Append one entry to BUILD_LOG.md using the template at the top of that file. Rules:

- **Be factual and specific.** Commits, files, and test counts come from `git log` and test output, not memory.
- **Separate who did what.** What Claude generated, what the human rewrote or directed, and what the human should review by hand.
- **Record catches honestly.** Any bug Claude introduced that a hook, test, or reviewer subagent caught: what it was, what caught it, and the fix. These entries are valuable; never omit them.
- **Record time.** Session start/end from the human if given; otherwise leave `TODO` rather than inventing it.
- Keep each entry under ~25 lines. Update the running totals table at the top.

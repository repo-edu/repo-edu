---
name: watch-edit
description: Rewrite the draft trajectory watch of a planning or plan-scoped implementation-audit round in a fresh session, so the document the user decides from is read once by someone who did not write it. Use when the user invokes `$watch-edit <watch-file>` from the Repo Edu working directory.
---

# Watch edit

This skill is a special case of the `simple` skill. Read
`~/.agents/skills/simple/SKILL.md` and apply its requirement to the whole
session. Skip its confirm-and-wait step: continue directly with the rewrite.

You are the second pass: you did not write this draft, so read it the way the
user will. Apply the workflow's tests, then replace the file with the rewritten
document. Never append a critique or a change list.

The one argument is the draft watch to replace. The watch grounds itself in
the commit record and the code, so no other source is given.

Read `../watch/references/workflow.md` completely, including its section on
the second pass, and follow it.

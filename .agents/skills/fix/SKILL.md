---
name: fix
description: Run the fix phase of an implementation-audit round on Repo Edu code from its report file, under the simple-words requirement. Use when the user invokes `$fix` from the Repo Edu working directory, with or without a report file, or asks to apply and land an implementation audit's findings.
---

# Fix

This skill is a special case of the `simple` skill. Read
`~/.agents/skills/simple/SKILL.md` and apply its requirement to the whole
session. Skip its confirm-and-wait step: continue directly with the fix phase.

Your assistant token is `codex`.

Read `references/workflow.md` completely and follow it.

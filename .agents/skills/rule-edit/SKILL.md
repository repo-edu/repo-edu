---
name: rule-edit
description: Rewrite the draft ruling of a planning or implementation-audit round in a fresh session, so the document the user rules from is read once by someone who did not write it. Use when the user invokes `$rule-edit <ruling-file> <transcript-file> <report-file>` from the Repo Edu working directory.
---

# Rule edit

This skill is a special case of the `simple` skill. Read
`~/.agents/skills/simple/SKILL.md` and apply its requirement to the whole
session. Skip its confirm-and-wait step: continue directly with the rewrite.

You are the second pass: you did not write this draft, so read it the way the
user will. Apply the workflow's tests, then replace the file with the rewritten
document. Never append a critique or a change list.

The first argument is the draft ruling to replace. The second and third are
the round transcript and the audit report the ruling workflow grounds it in.

Read `../rule/references/workflow.md` completely, including its section on
the second pass, and follow it.

---
description: Rewrite the draft ruling of an implementation-audit round in a fresh session, so the document the user rules from is read once by someone who did not write it.
argument-hint: [ruling-file] [transcript-file] [report-file]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the rewrite.

You are the second pass: you did not write this draft, so read it the way the
user will. Apply the workflow's tests, then replace the file with the rewritten
ruling. Never append a critique or a change list.

Read `.agents/skills/rule/references/workflow.md` completely and follow it,
including its section on the second pass.

$ARGUMENTS

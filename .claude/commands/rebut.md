---
description: Answer the other assistant's vet of your implementation-audit report, one answer per verdict, written to a -rebut.md twin file for the fix phase to read.
argument-hint: [report-file]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the rebuttal.

Your writer tag's vendor letter is `a` for Claude.

Read `.agents/skills/rebut/references/workflow.md` completely and follow it.

$ARGUMENTS

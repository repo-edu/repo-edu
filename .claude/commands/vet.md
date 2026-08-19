---
description: Vet another assistant's implementation-audit report file on this repo's code, checking each finding is authorised, grounded and its fix follows, one verdict per finding.
argument-hint: [report-file]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the vet.

Your assistant token is `claude`.

Read `.agents/skills/vet/references/workflow.md` completely and follow it.

$ARGUMENTS

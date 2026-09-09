---
description: Run the fix phase of an implementation-audit round from its report file in a fresh context, reconciling the vet, applying the accepted corrections and landing the records.
argument-hint: [report-file]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the fix phase.

Your assistant token is `claude`.

Read `.agents/skills/fix/references/workflow.md` completely and follow it.

$ARGUMENTS

---
description: Draft the ruling document for a planning or implementation-audit round whose fix phase stopped for the user's decision, explaining each open item and arguing a choice.
argument-hint: <transcript-file> <report-file> <ruling-output>
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the ruling.

You are the first pass: write the draft. A fresh session rewrites it afterwards
through the rule edit, so write the ruling as if it were final rather than
leaving notes for that pass.

Read `.agents/skills/rule/references/workflow.md` completely and follow it.

$ARGUMENTS

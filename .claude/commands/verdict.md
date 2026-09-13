---
description: Write the trajectory watch's verdict for the current episode after an implementation-audit round, as the document the user decides from.
argument-hint: [verdict-file] [cache-root]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the verdict.

You are the first pass: write the draft. A fresh session rewrites it afterwards
through `/revise`, so write the verdict as if it were final rather than leaving
notes for that pass.

Read `.agents/skills/verdict/references/workflow.md` completely and follow it.

$ARGUMENTS

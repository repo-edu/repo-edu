---
description: Run a read-only implementation audit of a ready plan from ../plan against the code that implemented it, reporting tiered findings in a concise form.
argument-hint: [plan-file] [step-range]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the audit.

Your auditor token for the report file name is `claude`.

Read `.agents/skills/audit/references/workflow.md` completely and follow it.

$ARGUMENTS

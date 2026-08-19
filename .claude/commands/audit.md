---
description: Run a read-only implementation audit of a ready plan from ../plan against the code that implemented it, reporting tiered findings in a concise form.
argument-hint: [plan-file] [step-range]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the audit.

One additional requirement, this command only: report tiered findings in a
concise form. Each A, B or C finding carries three parts and nothing else:
the correction, the evidence, the failure trace. A D finding carries the
correction and the evidence. Write each part as one short sentence; when a
part does not fit, split it into two short sentences rather than pack it. A
long sentence is not concise. The failure trace has its own shape, set out
under **Finding shape** in the workflow. Plan feedback entries stay one line
each.

Read `.agents/skills/audit/references/workflow.md` completely and follow it.

$ARGUMENTS

---
description: Run a read-only implementation audit of a ready plan from ../plan or named commits, reporting tiered findings in a concise form.
argument-hint: [runner-name-start] <plan-file|SHA|HEAD|HEAD-n|from..to> [steps-or-commits...]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the audit.

Your writer tag's vendor letter is `a` for Claude.

Read `.agents/skills/audit/references/workflow.md` completely and follow it.

$ARGUMENTS

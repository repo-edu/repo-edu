---
description: Run a read-only implementation audit of a ready plan from ../plan or named commits, reporting tiered findings in a concise form.
argument-hint: [report-path] <plan-file|SHA|HEAD|HEAD-n|from..to> [steps-or-commits...]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the audit.

Your writer tag's vendor letter is `a` for Claude.

For a hand-run audit without a supplied report path, resolve your full tag under the shared round
protocol and pass it unchanged to
`pnpm audit-round name <target> [scope-or-commits...] --auditor <full tag>` before auditing. Use the
printed paths. Do not pass only the vendor letter.

Read `.agents/skills/audit/references/workflow.md` completely and follow it.

$ARGUMENTS

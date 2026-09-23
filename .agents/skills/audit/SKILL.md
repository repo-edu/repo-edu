---
name: audit
description: Run a user-scoped implementation audit of a ready plan or named commits. Use when the user invokes `$audit` with a plan and optional steps, SHAs, HEAD or HEAD-n references, including inclusive commit ranges, or asks for an implementation audit.
---

# Audit

This skill is a special case of the `simple` skill. Read
`~/.agents/skills/simple/SKILL.md` and apply its requirement to the whole
session. Skip its confirm-and-wait step: continue directly with the audit.

Your writer tag's vendor letter is `o` for Codex.

For a hand-run audit without a supplied report path, resolve your full tag under the shared round
protocol and pass it unchanged to
`pnpm audit-round name <target> [scope-or-commits...] --auditor <full tag>` before auditing. Use the
printed paths. Do not pass only the vendor letter.

Read `references/workflow.md` completely and follow it.

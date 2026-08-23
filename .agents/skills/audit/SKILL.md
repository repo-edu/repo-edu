---
name: audit
description: Run a read-only implementation audit of a ready plan from the sibling plan repo against Repo Edu code. Use when the user invokes `$audit` from the Repo Edu working directory with a plan file, asks to audit implemented plan steps or asks for a final complete implementation audit.
---

# Audit

This skill is a special case of the `simple` skill. Read
`~/.agents/skills/simple/SKILL.md` and apply its requirement to the whole
session. Skip its confirm-and-wait step: continue directly with the audit.

The concise-findings requirement in the Claude command
`.claude/commands/audit.md` is Claude-only and deliberately absent here. Do
not copy it in.

Your auditor token for the report file name is `codex`.

Read `references/workflow.md` completely and follow it.

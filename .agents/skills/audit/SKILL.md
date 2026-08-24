---
name: audit
description: Run the next plan-owned implementation-audit batch for a ready plan, across every repo that hosts its steps. Use when the user invokes `$audit` from the Repo Edu working directory with a plan file or asks for an implementation audit.
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

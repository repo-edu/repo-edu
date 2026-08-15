---
name: audit
description: Run a read-only implementation audit of a ready plan from the sibling plan repo against Repo Edu code. Use when the user invokes `$audit` with a plan file from the Repo Edu working directory, asks to audit implemented plan steps or asks for a complete closing implementation audit.
---

# Audit

Use this skill as the Codex equivalent of Claude's `/audit` command. The
Repo Edu command `.claude/commands/audit.md` owns the shared contract, with
one deliberate difference: the concise-findings requirement in that command
is Claude-only and is deliberately absent here. Do not copy it into this skill
when syncing. Where the two differ otherwise, the command is right and this
skill is corrected to match.

## Simple-words requirement

This skill is a special case of the `simple` skill. Read
`~/.agents/skills/simple/SKILL.md` and apply its requirement to the whole
session. Skip its confirm-and-wait step: continue directly with the audit.

## Workflow

Read the text after `$audit` as a plan file and an optional implementation-step
range. When no plan is named, ask which plan to audit and wait.

Apply the Claude command's archive evidence rule. When the plan is under
`../plan/archive/<name>/`, read `README.md` in the same folder first when it
exists. Treat its later outcomes under the command's deviation rules when
judging the frozen plan.

Run one read-only implementation-audit round by following
`.claude/commands/audit.md` and this repo's `CLAUDE.md`. Apply the command's
ready gate, first-round strategy gate, evidence scope, coverage table,
deviation rules, finding tiers, plan feedback and closing-round rules. Report
in its prescribed order, then stop for discussion.

Edit and commit only after the user accepts or revises the findings and asks
for them to be applied. This skill audits implementation code. Planning
artifact audits belong to the sibling plan repo's own `audit` skill.

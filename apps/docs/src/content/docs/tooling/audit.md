---
title: /audit
description: Run one read-only planning or implementation audit against a plan, step range or commit set
---

`/audit` checks one planning document or one body of implemented work. Use it when you want to run
the audit phase by hand, inspect its report and decide how the findings should proceed. Codex uses
the equivalent `$audit` command.

## When should I use it?

Use `/audit` when you want one audit rather than an automatic series, or when you want to read its
report before starting a vet or fix. The target decides which kind of audit runs.

| Target | Example | What the audit checks |
| --- | --- | --- |
| A plan | `/audit tooling-guide-usability plan` | The active planning document as the brief for work that has not landed |
| A step or range | `/audit tooling-guide-usability 1-2` | The implementation of those numbered plan steps in every hosting repo |
| Commits | `/audit HEAD-2..HEAD` | Work outside a plan in the named contiguous commits |
| Nothing | `/audit` | The active plan selected by the runner, or an explanation when selection is ambiguous |

A stem without a scope audits the planning document before implementation. After implementation it
selects the implementation scope only when the plan's audit-range rules make that scope unambiguous.

## What does it read?

The launcher asks `pnpm audit-round name` to resolve the target, choose the working checkout and
allocate the report. A planning audit reads the whole plan and its governing decisions. An
implementation audit reads the whole plan, the selected steps, their current code and the relevant
history. A commit audit reads the exact commits resolved by the runner.

An implementation audit requires the plan's `ready` marker. A commit audit also requires clean
touched files, reachable commits and work that is not already attached to a plan.

## What does it produce?

An audit with findings produces a Markdown report and a round claim. A planning report separates
excess and missing functionality. An implementation report includes a coverage table and one field
of findings.

A clean plan or step audit lands the workflow's clean record automatically and removes its report
set. A clean commit audit keeps its report and lands no record. The audit itself does not apply a
finding; that belongs to the later fix.

## Where does it stop for me?

1. **Target selection.** If an omitted target has no unique active plan, the command stops and tells
   you what must be named. Reply by running `/audit` again with the plan stem or commit references.
2. **Audit gate.** If a plan has no `ready` marker or a commit target fails its clean-history gates,
   the audit states the failed gate and stops. For the missing ready marker, explicitly say whether
   the audit should continue. Otherwise correct the target and rerun it.
3. **Findings.** The report is the audit's normal stopping point. Read it, then run `/vet` for an
   independent check or discuss the findings and authorise their fix. The audit changes no source
   at this point.
4. **No findings.** A clean plan or step audit completes without asking you anything. A clean commit
   report is the final output for you to read.

## What owns this page?

This page is a mirror. The plan repo launchers `home/claude/commands/audit.md` and
`home/agents/skills/audit/SKILL.md` own how `/audit` and `$audit` enter the runner. The selected
workflow owns the audit itself:

1. Planning audits: `plan/.agents/skills/audit/references/workflow.md`.
2. Step and commit audits: `repo-edu/.agents/skills/audit/references/workflow.md`, with
   `commit-scope.md` for commit targets.
3. Target resolution and phase routing: `repo-edu/tools/audit-round/CLAUDE.md`.

Those sources win when this page differs.

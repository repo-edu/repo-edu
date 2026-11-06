---
title: /audit
description: Run one read-only planning or implementation audit against a plan, step range or commit set
---

Use `/audit` to check one plan or one body of implemented work without starting an automatic series.

## How do I run it?

Run the command in Claude chat from the Repo Edu or plan checkout. Use `$audit` for the same command
in Codex.

```text
/audit                              audit the active plan selected by the runner
/audit <stem>                       audit that plan before implementation
/audit <stem> plan                  audit that plan after implementation has started
/audit <stem> <step>                audit one implemented step
/audit <stem> <first>-<last>        audit an inclusive implemented step range
/audit <commit>                     audit one commit outside a plan
/audit <commit> <commit> [...]      audit an ordered commit set outside a plan
```

Examples:

```text
/audit tooling-guide-usability
/audit tooling-guide-usability plan
/audit tooling-guide-usability 1-2
/audit HEAD-2..HEAD
/audit HEAD plan@HEAD
```

The command has no flags. A stem is the plan filename without `.md` or `-widen`. Prefix a plan-repo
commit with `plan@`; unprefixed commits belong to Repo Edu.

## When do I use it?

Use `/audit` when you want one audit report to read before deciding whether to vet or fix it. Use an
automatic `pnpm audit-round round ...` series when you want the runner to choose later auditors and
carry accepted findings through the remaining phases.

## What does it read?

The target selects the evidence:

1. A planning audit reads the whole plan and the decisions that govern it.
2. A step audit reads the whole plan, the selected steps, their current implementation and relevant
   history.
3. A commit audit reads the exact commits resolved before the audit starts.

An implementation audit normally requires the plan's `ready` marker. A commit audit also requires
clean touched files, reachable commits and work that is not already attached to a plan.

## Where does it stop and what do I type?

1. **The target is ambiguous.** The command names what is missing. Run `/audit <stem>` for a plan or
   `/audit <commits>` for work outside a plan.
2. **An audit gate fails.** If the plan lacks a `ready` marker and you still want the audit, type
   `Continue without the ready marker.` For a commit gate, correct the named history or worktree
   problem and run the command again.
3. **The report has findings.** Run the vet in the other assistant: use `$vet <report-file>` in
   Codex after a Claude audit, or `/vet <report-file>` in Claude after a Codex audit. If the vet
   revises, drops or refers a finding, return to the original auditor and run `/rebut <report-file>`
   or `$rebut <report-file>`. When the outcome is settled, approve its corrections by running
   `/fix <report-file>` or `$fix <report-file>`.
4. **The report is clean.** Type nothing. A clean plan or step audit lands its clean record. A clean
   commit audit leaves its report for you to read and lands no record.

## What does it leave behind?

All round files live under `../plan/active/`:

1. `<target>-<round>-0-claim.md` is an empty reservation for the round number. It prevents two
   rounds from using the same number and remains after the round.
2. `<target>-<round>-2-audit.<tag>.md` is the audit report. A report with findings remains until the
   fix completes. A clean hand-run plan or step audit deletes its report after landing the clean
   record; a clean commit report remains.

A clean plan or step audit also leaves a Git commit named for the round. An audit with findings
changes no source until `/fix` is authorised.

## What owns this page?

`../plan/home/claude/commands/audit.md`, `../plan/home/agents/skills/audit/SKILL.md` and
`.agents/skills/audit/references/workflow.md` own this page; `tools/audit-round/CLAUDE.md` owns
paths.

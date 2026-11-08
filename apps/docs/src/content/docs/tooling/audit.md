---
title: /audit
description: Run one read-only planning or implementation audit against a plan, step range or commit set
---

`/audit` runs one read-only audit by hand when you want to read the report before deciding whether
to vet and fix it, instead of letting an automatic runner series choose later phases.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout; `$audit` is the Codex counterpart |
| Owners | `../plan/home/claude/commands/audit.md` and `../plan/home/agents/skills/audit/SKILL.md` launch it; `.agents/skills/audit/references/workflow.md` and `../plan/.agents/skills/audit/references/workflow.md` own the audit; `tools/audit-round/CLAUDE.md` owns targets and paths |

## Usage

```text
/audit                              audit the active plan the runner selects
/audit <stem>                       audit that plan before implementation
/audit <stem> plan                  audit that plan after implementation has started
/audit <stem> <step>                audit one implemented step
/audit <stem> <first>-<last>        audit an inclusive implemented step range
/audit <commit>                     audit one commit outside a plan
/audit <commit> <commit> [...]      audit an ordered commit set outside a plan
```

```text
/audit tooling-guide-usability 1-2
/audit HEAD-2..HEAD
/audit HEAD plan@HEAD
```

The command has no flags. A stem is the plan filename without `.md` or `-widen`. Prefix a plan-repo
commit with `plan@`; an unprefixed commit belongs to Repo Edu. The launcher asks the runner to claim
a round number and name the workflow, so a hand-run audit and a runner audit follow the same rules.
The whole session uses the `/simple` wording requirement.

## What it shows you

The target decides what the audit reads:

1. **A planning audit** reads the whole plan and the boundaries and decisions that govern it.
2. **A step audit** reads the whole plan, the selected steps, the code that implements them in each
   hosting repo and the history needed to judge later corrections and departures. It opens with a
   coverage table that gives every step in the range one disposition.
3. **A commit audit** reads the exact commits the runner resolved before the audit started.

The report lists findings by number. Each carries a tier from A, the most serious, to D, wording,
plus its location, the growth patterns it could match, its reach and its maintenance-burden change.
The audit changes no tracked file.

## Early stops

1. **The target is ambiguous.** The command names what is missing. Rerun it with one of the forms
   in the usage block.
2. **The plan has no `ready` marker.** An implementation audit names the newest stem commit and
   stops. Type `Continue without the ready marker.` to audit anyway.
3. **A whole-plan step audit finds an `implemented` marker missing or stale.** The audit names each
   hosting repo whose marker is missing or older than that repo's newest step, then waits. Type
   `Continue without the implemented marker.` to audit anyway. Later rounds do not ask again.
4. **A planning audit meets an unresolved premise error.** The report holds no graded findings. It
   names the inputs that conflict, where each is recorded and the decision you must make. Give your
   decision in the chat. The audit then starts again from its premise check.
5. **A commit audit's hard gate fails.** The gate refuses uncommitted changes in touched files,
   an unreachable commit and a typed list that is not contiguous in history. Correct the named
   problem and rerun. No answer continues past this stop.
6. **A commit carries a plan stem.** The command names each such commit as out of scope. Run the
   matching plan audit for those commits, or type `Continue with the named commits excluded.` to
   audit the rest. The named commits then stay out of the coverage table.

## Afterwards

1. **The report has findings.** The report stays in `../plan/active/` and no source changes. Run
   the vet in the other assistant: `$vet <report-file>` in Codex after a Claude audit, or
   `/vet <report-file>` in Claude after a Codex audit.
2. **The report is clean.** A plan or step audit lands its `clean` record commit and deletes its
   report. A commit audit lands no record and keeps its report for you to read. A clean round needs
   no vet or fix.

Either way the round's `<target>-<round>-0-claim.md` stays as an empty reservation, so no later
round reuses the number. The report itself is `<target>-<round>-2-audit.<tag>.md`. See
[Find round outputs](/repo-edu/tooling/find-round-outputs/) for every round file.

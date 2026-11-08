---
title: /vet
description: Check another assistant's planning or implementation audit findings
---

`/vet` checks another assistant's audit findings from a fresh context, after an audit report has
findings and before any correction lands.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout; `$vet` is the Codex counterpart |
| Owners | `../plan/home/claude/commands/vet.md` and `../plan/home/agents/skills/vet/SKILL.md` launch it; `.agents/skills/vet/references/workflow.md` and `../plan/.agents/skills/vet/references/workflow.md` own the vet; `tools/audit-round/CLAUDE.md` owns paths |

## Usage

```text
/vet                         vet the other assistant's newest eligible report
/vet <report-file>           vet one named audit report
```

```text
/vet tooling-guide-usability-impl-audit-03..05-01-2-audit.oth.md
```

The command has no flags. The report must come from the other assistant, because the vet exists to
give each finding an independent read. The report's opening tells the runner whether to use the
planning or implementation workflow and which checkout to work in. The whole session uses the
`/simple` wording requirement.

## What it shows you

The vet reads the whole report, compares each audited head with the current head and reads every
source a finding relies on. When the tree moved since the audit, it reads the changes and drops a
finding the move already resolved. It checks each finding on three axes, in order:

1. **Authorised.** The round was allowed to raise it. A finding on completed commits' labels, a
   correct departure from the plan or work the episode has not reached does not stand. A finding
   may reopen a settled decision with correctness or quality evidence, but never on taste alone.
2. **Grounded.** Its claims follow from the current plan, code, records and instructions.
3. **Fixed right.** Its correction resolves the cause at the stated tier, and any trade between
   added machinery and user benefit is priced.

Each finding gets one verdict: Accept, Revise, Drop or Needs user's ruling. A revision states the
corrected tier, evidence or correction. The vet may run read-only commands. It runs no formatter and
changes no tracked file.

## Early stops

1. **No eligible report is found.** Rerun with the report name from the plan checkout's `active/`
   folder.
2. **The report is from this assistant.** Open the other assistant and run its `/vet` or `$vet`
   there.
3. **The plan named in the filename differs from the report's `Target:` line.** The vet names both
   and refuses.

## Afterwards

The verdicts appear in chat and in the round's `-3-vet.<tag>.md` twin under `../plan/active/`. No
commit lands. The verdicts decide the next phase:

1. **Every verdict is Accept.** Run `/fix <report-file>` or `$fix <report-file>`.
2. **A verdict is Revise, Drop or Needs user's ruling.** Return to the report's auditor and run
   `/rebut <report-file>` or `$rebut <report-file>`. The vet itself asks you no product question.

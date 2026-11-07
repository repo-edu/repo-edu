---
title: /vet
description: Check another assistant's planning or implementation audit findings
---

Use `/vet` to check whether another assistant's audit findings are authorised, grounded and
correctly fixed.

## How do I run it?

Run the command in Claude chat from the Repo Edu or plan checkout. Use `$vet` for the same command
in Codex.

```text
/vet                         vet the other assistant's newest eligible report
/vet <report-file>           vet one named audit report
```

Example:

```text
/vet tooling-guide-usability-impl-audit-03..05-01-2-audit.oth.md
```

The command has no flags. The report must have been written by the other assistant. The runner
reads its opening and chooses the planning or implementation workflow and working checkout.

## When do I use it?

Use `/vet` after an audit report has findings. The vet is an independent read before corrections
land. A clean audit needs no vet, and an assistant never vets its own report.

## What does it read?

The vet reads the complete audit report, the current repository heads and every source needed to
check the findings. It checks each finding in this order:

1. Whether the round was authorised to raise it.
2. Whether its claims follow from the current plan, code, records and governing instructions.
3. Whether its correction resolves the cause at the stated severity.

The vet may run read-only checks where a claim depends on them. It does not run a formatter or any
command that changes tracked files.

## Where does it stop and what do I type?

1. **No eligible report is found.** Run `/vet <report-file>` with the report from the plan
   checkout's `active/` folder.
2. **The report is from this assistant.** Open the other assistant and run its `/vet` or `$vet`
   command with the same report.
3. **Every verdict is Accept.** Run `/fix <report-file>` or `$fix <report-file>` to apply the
   accepted corrections.
4. **A verdict is Revise, Drop or Needs user's ruling.** Return to the report's auditor and run
   `/rebut <report-file>` or `$rebut <report-file>`. The vet itself asks you no product question.

## What does it leave behind?

The command writes its verdicts to chat and to the round's `-3-vet.<tag>.md` twin under the plan
checkout's `active/` folder. It makes no tracked edit and no commit. Each finding receives one of
four verdicts: Accept, Revise, Drop or Needs user's ruling.

## What owns this page?

`../plan/.agents/skills/vet/references/workflow.md` and
`.agents/skills/vet/references/workflow.md` own this page; `tools/audit-round/CLAUDE.md` owns paths.

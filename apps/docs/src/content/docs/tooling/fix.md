---
title: /fix
description: Reconcile one audited round and land its authorised corrections and records
---

Use `/fix` to reconcile an audit, its vet and any rebuttal, then land the authorised corrections.

## How do I run it?

Run the command in Claude chat from the Repo Edu or plan checkout. Use `$fix` for the same command
in Codex.

```text
/fix                         fix the newest eligible audit round
/fix <report-file>           fix the round belonging to one named audit report
```

Example:

```text
/fix tooling-guide-usability-impl-03..05-01-2-audit.oth.md
```

The command has no flags. An omitted input selects the newest eligible report and that round's
newest vet and rebuttal twins. The report opening chooses the planning or implementation workflow
and the repositories the fix may change.

## When do I use it?

Use `/fix` after the vet, and after a rebuttal when the vet did not accept every finding. Invoking
the fix grants the settled corrections and their round records. A clean audit completes directly
and needs no fix.

## What does it read?

The fix reads the complete report and every available twin, then checks current repository heads
and the sources each retained correction will change. It reconciles every numbered finding,
applies the accepted result at its owning boundary and runs the checks required by that repository.

Planning corrections change only the plan repository. An implementation round may change Repo Edu,
the plan repository or both when the report's judged set and finding locations permit it.

## Where does it stop and what do I type?

1. **An input is missing or ambiguous.** Run `/fix <report-file>` with the audit report. Complete a
   missing vet or rebuttal first when the round requires it.
2. **A real decision remains open.** Read the alternatives and recommendation. In an automatic
   runner, type your reply and submit it with a blank line. In a hand-run chat, reply directly. You
   may ask a question; an unresolved decision produces a revised ruling.
3. **A required edit, check or commit fails.** Correct the named external problem, then use the
   printed recovery command when one is available. The retained session continues the same fix.
4. **The fix finishes.** Type nothing. The corrections and round records have landed.

## What does it leave behind?

The fix leaves the accepted source or plan changes, their Git records and any required handoff. A
finished round removes its `-2-audit`, `-3-vet` and `-4-rebut` files. Its claim, transcript, log,
round data, rulings and watch remain until their normal retention owner removes or archives them.

## What owns this page?

`../plan/.agents/skills/fix/references/workflow.md` and
`.agents/skills/fix/references/workflow.md` own this page; the shared protocol owns reconciliation.

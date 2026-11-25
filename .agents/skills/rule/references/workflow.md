---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../../references/round-protocol.md
  - ../../../references/round-grammar.md
  - ../../fix/references/ruling.md
  - ../../../../../plan/BOUNDARIES.md
  - ../../../../../plan/GROWTH-PATTERNS.md
---

# Implementation ruler workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole. Read each file once. Apply the `simple`
requirement to the whole session and skip its confirm-and-wait step.

The ruler names the winner of each contest or split on a C or D finding of an implementation-audit
round under the shared protocol's **Reconciliation**. The round's audit report, its vet reports
and its rebuttal report are its inputs, and the fix then applies its
winners. Its duties, its read-only limit and its delivery are the shared protocol's
**Ruler duties**. It works each finding in the **Reading order** of `ruling.md`
and returns the results in the supplied schema.
Follow the shared protocol's **Runner result** for every ending.

## Inputs

Follow the runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing) for path
resolution and argument order. Read the judged repos and heads in the audit
report's opening. Judge the findings supplied in the arguments.

## Judging

Judge each verdict by the standards the vet and the fix apply: the shared protocol's **Finding
explanations**, **Judging deviations**, **Vet checks** and **Real choices**. A finding that reopens
a plan decision is judged under the shared planning rules'
[Changes to what a plan holds](../../../../../plan/.agents/references/planning-rules.md#changes-to-what-a-plan-holds).
Read the plan steps the audit report's scope names and every **Decisions** entry a side cites. Read
the code and the test that covers it at current HEAD, by absolute path.

Then stop. The fix applies the winners under the runner's
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).

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
The runner supplies them whole; in a hand-run session, read them whole, following
any listed workflow's header too. Read each file once. Apply the `simple`
requirement to the whole session and skip its confirm-and-wait step.

Where a launcher and this file disagree, this file is right.

The ruler names the winner of each contest or split on a C or D finding of an implementation-audit
round, under the shared protocol's **Reconciliation**. The round's audit report, its vet reports and
its rebuttal report are its inputs, and the fix then applies its winners. Its duties, its read-only
limit and its delivery are the shared protocol's **Ruler duties**. It works each finding in the
**Reading order** of `ruling.md`, and the
[ruler report grammar](../../../references/round-grammar.md#ruler-report) owns the report's form.
For unattended completion, follow the shared protocol's **Runner result**.

## Inputs

Follow the runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing) for path
resolution and argument order. Follow the
[audit report grammar](../../../references/round-grammar.md#audit-report) for the judged repos and
heads. An unattended ruler is given the findings it judges in its arguments. A hand-run ruler takes
every contest and split on a C or D finding that the vet and rebuttal reports hold, under
**Reconciliation**, and judges no other finding.

## Judging

Judge each verdict by the standards the vet and the fix apply: the shared protocol's **Finding
explanations**, **Judging deviations**, **Vet checks** and **Real choices**. A finding that reopens
a plan decision is judged under the shared planning rules'
[Changes to what a plan holds](../../../../../plan/.agents/references/planning-rules.md#changes-to-what-a-plan-holds).
Read the plan steps the audit report's scope names and every **Decisions** entry a side cites. Read
the code and the test that covers it at current HEAD, by absolute path.

Then stop. The fix applies the winners under the runner's
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).

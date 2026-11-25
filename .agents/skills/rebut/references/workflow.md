---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../../references/round-protocol.md
  - ../../../../../plan/BOUNDARIES.md
  - ../../../../../plan/GROWTH-PATTERNS.md
---

# Implementation-vet rebuttal workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole. Read each file once. Apply the `simple`
requirement to the whole session and skip its confirm-and-wait step.

The rebuttal answers the round's vetters on behalf of the audit report. An implementation-audit
round writes its audit report, each vetter of the round's panel vets it into its own vet report and
this workflow answers every vetter's verdicts in one rebuttal report. The runner starts it as a new
session on the auditor's model and effort. Session selection follows Repo Edu's
[Commit Capability Tag](../../../../CLAUDE.md#commit-capability-tag) and the runner's
[Round files](../../../../tools/audit-round/CLAUDE.md#round-files). Ground answers as the shared
round protocol requires under **Rebuttal grounding**. The ruler, when the round needs one, and the
fix then read the audit report, every vet report and the rebuttal report, so each has every view.

The rebuttal is read-only and lands nothing. It runs no command that changes
a tracked file.

Follow the shared protocol's **Runner result** for every ending.

## Audit report discovery

Follow the runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing)
for path resolution and argument order. Read the judged repos and heads in
the audit report's opening.

## Rebuttal file

Follow the shared round protocol's **Rebuttal answers** and return the answers
in the supplied schema.

Your answers decide whether two vetters' revisions of one finding split under the
shared **Reconciliation**. Agreeing with both leaves the choice between them to
the fix. Contesting or referring either one is a split. Every contest and split gets its judge
under **Reconciliation**: the user on an A or B finding and the ruler on a C or D finding.

Then stop. The ruler and the fix consume the audit report, the vet reports and the rebuttal report
under the runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing). Planning
rebuttals use their route's completion rule.

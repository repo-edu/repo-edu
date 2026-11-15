---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../references/round-protocol.md
  - ../../../references/round-grammar.md
  - ../../../../../plan/BOUNDARIES.md
  - ../../../../../plan/GROWTH-PATTERNS.md
---

# Implementation-vet rebuttal workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole; in a hand-run session, read them whole, following
any listed workflow's header too. Read each file once.

The shared launchers live in the plan checkout under
`home/claude/commands/rebut.md` and `home/agents/skills/rebut/SKILL.md`.
The runner selects this workflow and its working checkout for both entry routes.
Where a launcher and this file disagree, this file is right.

The rebuttal answers the round's vetters on behalf of the audit report. An implementation-audit
round writes its `*-2-audit.<tag>.md` audit report, each vetter of the round's panel vets it into
its own `-3-vet.<tag>.md` vet report and this workflow answers every vetter's verdicts in one
`-4-rebut.<tag>.md` rebuttal report. The runner starts it as a new session on the auditor's model
and effort. Session selection follows Repo Edu's
[Commit Capability Tag](../../../../CLAUDE.md#commit-capability-tag) and the runner's
[Round files](../../../../tools/audit-round/CLAUDE.md#round-files). A hand-run rebuttal may use the
audit session while it still holds the round. In either route, ground answers as the shared round
protocol requires under **Rebuttal grounding**. The fix phase then reads the audit report, every vet
report and the rebuttal report, so it has every view.

The rebuttal is read-only and lands nothing. It runs no command that changes
a tracked file. Only a hand-run rebuttal writes its `-4-rebut.<tag>.md` rebuttal report.

For unattended completion, follow the shared protocol's **Runner result**.

## Audit report discovery

Follow the runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing)
for path resolution and argument order. Follow the
[audit report grammar](../../../references/round-grammar.md#audit-report) for
the judged repos and heads.

Never answer the vetters on an audit report whose tag's vendor letter names
another assistant. The rebuttal runs on the auditor's assistant, and another assistant's
findings are not yours to defend. Continue only when the user explicitly says
to.

## Rebuttal file

Follow the shared round protocol's **Rebuttal answers** for delivery. Each
answer names the vetter it answers by the tag in that vetter's vet report filename. When no
verdict needs an answer, state that once.

Your answers decide whether two vetters' revisions of one finding split under the
shared **Reconciliation**. Agreeing with both leaves the choice between them to
the fix. Contesting or referring either one is a split, and a serious split
goes to the user.

Then stop. The fix phase consumes the audit report, the vet reports and the rebuttal report under
the runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing). Planning
rebuttals use their route's completion rule.

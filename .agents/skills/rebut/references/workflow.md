---
reads:
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

The rebuttal is the auditor's answer to the round's vets. An implementation-audit round writes its
`*-2-audit.<tag>.md` report, each vet of the round's panel vets it into its own `-3-vet.<tag>.md`
twin and this workflow answers every vet's verdicts in one `-4-rebut.<tag>.md` twin. The answers
come from the auditor. Session selection follows Repo Edu's
[Commit Capability Tag](../../../../CLAUDE.md#commit-capability-tag) and the
runner's [Round files](../../../../tools/audit-round/CLAUDE.md#round-files). A hand-run
reply may use the audit session while it still holds the round. In either route, ground answers as
the shared round protocol requires under **Rebuttal grounding**. The fix phase then reads the
report, every vet twin and the rebuttal twin, so it has every view.

The rebuttal is read-only and lands nothing. It runs no command that changes
a tracked file. Only a hand-run rebuttal writes its `-4-rebut.<tag>.md` twin.

For unattended completion, follow the shared protocol's **Runner result**.

## Report discovery

Follow the runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing)
for path resolution and argument order. Follow the
[audit report grammar](../../../references/round-grammar.md#audit-report) for
the judged repos and heads.

Never answer the vets on a report whose tag's vendor letter names another
assistant. The rebuttal is the auditor's reply, and another assistant's
findings are not yours to defend. Continue only when the user explicitly says
to.

## Rebuttal file

Follow the shared round protocol's **Rebuttal answers** for delivery. Each
answer names the vet it answers by the tag in that vet's twin filename. When no
verdict needs an answer, state that once.

Your answers decide whether two vets' revisions of one finding split under the
shared **Reconciliation**. Agreeing with both leaves the choice between them to
the fix. Contesting or referring either one sends an A or B finding to the
user.

Then stop. The fix phase consumes the report and available twins under the
runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).
Planning replies use their route's completion rule.

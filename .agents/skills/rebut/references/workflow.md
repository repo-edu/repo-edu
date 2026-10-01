---
reads:
  - ../../../references/round-protocol.md
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

The rebuttal is the auditor's answer to the vet. An implementation-audit round writes its
`*-2-audit.<tag>.md` report, the other assistant vets it into the `-3-vet.<tag>.md` twin and this
workflow answers those verdicts, writing the `-4-rebut.<tag>.md` twin. The answers come from the
auditor. Session selection follows the shared protocol's **Writer tags**. A hand-run
reply may use the audit session while it still holds the round. In either route, ground answers as
the shared round protocol requires under **Rebuttal grounding**. The fix phase then reads all three
files. The user directed this chain on 2026-09-09 to give the fix phase both assistants' views.

The rebuttal is read-only and lands nothing. It runs no command that changes
a tracked file. Only a hand-run rebuttal writes its `-4-rebut.<tag>.md` twin.

For unattended completion, follow the shared protocol's **Runner result**.

## Report discovery

The [shared round protocol](../../../references/round-protocol.md) owns path resolution,
rating tokens, rebuttal grounding, answers and runner results. Follow its **Rebuttal grounding** and
**Rebuttal answers** rules. Use its **Later files** for argument order and **Report format** for the
judged repos and heads.

Follow the shared round protocol's **Manual phases** for path resolution.

Never answer the vet on a report whose tag's vendor letter is the other
assistant's. The rebuttal is the auditor's reply, and the other assistant's
verdicts are not yours to defend. Continue only when the user explicitly
says to.

## Rebuttal file

Follow the shared round protocol's **Rebuttal answers** for delivery.
When no verdict needs an answer, state that once.

Then stop. The fix phase consumes the report and available twins under the
shared protocol's **Later files**. Planning replies use their route's
completion rule.

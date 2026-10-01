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
auditor. The automated rebuttal always starts fresh on the audit's model and effort. A hand-run
reply may use the audit session while it still holds the round. In either route, ground answers as
the shared round protocol requires under **Rebuttal grounding**. The fix phase then reads all three
files. The user directed this chain on 2026-09-09 to give the fix phase both assistants' views.

The rebuttal is read-only and lands nothing. It runs no command that changes
a tracked file. Only a hand-run rebuttal writes its `-4-rebut.<tag>.md` twin.

When unattended, follow the shared
[Runner result](../../../references/round-protocol.md#runner-result) for every ending. Report
`finished` only after grounding and returning the required answers in the final
response. The runner saves the twin at its supplied path. Contested verdicts and items for the
user's ruling still complete the rebuttal: the fix phase presents them.

## Report discovery

The [shared round protocol](../../../references/round-protocol.md) owns path resolution,
rating tokens, rebuttal grounding, answers and runner results. Follow its **Rebuttal grounding** and
**Rebuttal answers** rules. The arguments name the report and vet to read and the rebuttal output,
in that order; read the judged repos and audited heads from the report opening and the auditor's
vendor letter from its filename.

Follow the shared round protocol's **Manual phases** for path resolution.

Never answer the vet on a report whose tag's vendor letter is the other
assistant's. The rebuttal is the auditor's reply, and the other assistant's
verdicts are not yours to defend. Continue only when the user explicitly
says to.

## Rebuttal file

Follow the shared round protocol's **Rebuttal answers** for delivery.
When no verdict needs an answer, state that once.

Then stop. The fix phase runs through the fix launcher, `/fix` for Claude
and `$fix` for Codex.
The audit report and both twins are its brief. The runner closes that set after
a finished fix; a hand-run fix uses `pnpm audit-round close`. This workflow deletes nothing.

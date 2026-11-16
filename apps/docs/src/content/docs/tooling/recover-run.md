---
title: Recover a run
description: Continue the retained phase or implementation worker after a failure or unanswered ruling
---

Recovery finishes the open work from its existing files, through the stopped session or through
hand-run phases. It never creates a replacement round, because a new round would claim another
number and leave the open one unfinished.

| Fact | Detail |
| --- | --- |
| Owners | `tools/audit-round/CLAUDE.md` sections **Ownership**, **Phase routing** and **Invocation**; `tools/audit-round/src/requests.ts` owns the recovery commands and the hand-run advice |

## The printed command

Read the failure reason, correct any named external problem and run the exact recovery command the
runner printed. It preserves the phase, working checkout, model, effort and known session identity.
The retained audit, vet and rebuttal reports and logs remain the source of the work being continued.

A failed rebuttal or fix prints hand-run phases instead, except for the one fix case that prints
`resume-fix`. Each hand-run phase runs in a new session, so no session identity carries over. See
[A failed audit phase](#a-failed-audit-phase).

A startup failure can happen before a session exists. In that case no recovery command is printed;
fix the startup problem and rerun the original command.

## A failed audit phase

A failed audit, vet, watch or close prints its assistant recovery command when
the runner knows the session. Run it as printed. The command reopens the stopped
session in the terminal and waits for input. It sends no prompt. Type what the
session should do, such as continue the phase or answer the question it stopped
on.

The runner has already stopped. It does not check or save the resumed session's work. A resumed
audit, vet or watch cannot finish the stopped round because only the runner saves or publishes the
text those phases return. A resumed close may finish the files and commits it owns. Start the next
runner command yourself after the session finishes.

A failed rebuttal or fix prints the hand-run phases that finish the round in place of a `Resume:`
line. A failed rebuttal lists two steps:

```text
Finish the round by hand, each step in a new session:
1. Rebuttal on codex <model> <effort>:
   $rebut <report>
2. Fix on claude <model> <effort>:
   /fix <report>
```

A failed fix lists the fix step alone. Start each step in a new session of the named assistant, on
the named model and effort, and type its launcher line. The rebuttal runs on the auditor's
assistant, because the rebuttal workflow refuses another assistant's audit report. The launcher
resolves the open round from the audit report, so no step claims a new number, and the fix reads
every vet report and the new rebuttal report. Rule on any serious contest or split in the fix's
chat. The hand-run fix lands the round's records, but the round data keeps the round as `failed`,
so the next run audits the scope again. The `Session:` line still names the failed session.

A failed fix whose serious contest or split still needs your winner prints `resume-fix` instead,
under [An unanswered ruling](#an-unanswered-ruling). It does so only when the runner knows the fix
session, because `resume-fix` resumes that session. Without one, the failed fix prints the hand-run
fix.

Do not run `/audit` again for the same work. A new audit would claim another round number instead of
completing the open one.

## A failed implementation worker

A worker failure prints the runner entry that started it with this option added:

```text
--resume <step>:<session-id>
```

Run the whole printed command, for example:

```text
pnpm audit-round implement <stem> <scope> --resume 3:<session-id>
pnpm audit-round <stem> --resume 3:<session-id>
```

The runner reads Git first. It resumes the session only if that step is selected and still has a
pending repository share. If the share already landed, the session stays unused and fresh workers
take the remaining steps. The step's existing log gains the recovered turn.

## An unanswered ruling

An audit fix with an unresolved serious contest or split prints a runner command:

```text
pnpm audit-round resume-fix <report> <session-id>
```

Run it as printed. The runner reloads the in-progress round and its saved fix
session. It prints the ruling notice and waits; the terminal asks nothing.
Answer in the desktop app with `/ruling`. For each missing winner, give
`report`, the tags of the vetters that were right or `neither` with a one-line
reason, or `not yet`. Add any free reply
for the fix. The reply may be empty once all winners are stored. `Not yet`
keeps the commit block and lets the fix answer a question before the runner
waits again.

A failed fix with an unresolved serious contest or split uses the same route when the runner knows
the fix session. Without one, it prints the hand-run fix under
[A failed audit phase](#a-failed-audit-phase). When no
ruling file exists yet, the runner first resumes the fix so it can write one.
The route then finishes through the ordinary record checks.

An implementation worker left at a ruling prints the worker's assistant recovery command instead
of `--resume`. Answer in that session, then rerun the original runner command without attaching a
second worker. Git shows the runner which shares remain.

## When recovery is complete

For an implementation `--resume <step>:<session-id>` route, recovery is complete only when the
worker reports success and the runner verifies its landed commit. A known session by itself proves
neither.

For `resume-fix`, recovery is complete only when every serious contest or split has a
stored winner, the fix reports success and the runner validates its records.

For an assistant recovery command or the hand-run phases, read the final session's result. The
stopped runner does not verify it. If an assistant recovery command fails again, use the newest
printed command because it carries the current resumable session. A hand-run step runs in a new
session that the runner did not start, so its failure prints no new command. Start that step again
in a new session with the same launcher line.

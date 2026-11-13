---
title: Recover a run
description: Continue the retained phase or implementation worker after a failure or unanswered ruling
---

Recovery continues the stopped session and its existing files; it does not create a replacement
round, because a new round would claim another number and leave the open one unfinished.

| Fact | Detail |
| --- | --- |
| Owners | `tools/audit-round/CLAUDE.md` sections **Ownership**, **Phase routing** and **Invocation**; `tools/audit-round/src/requests.ts` owns recovery command construction |

## The printed command

Read the failure reason, correct any named external problem and run the exact recovery command the
runner printed. It preserves the phase, working checkout, model, effort and known session identity.
The retained report files and logs remain the source of the work being continued.

A startup failure can happen before a session exists. In that case no recovery command is printed;
fix the startup problem and rerun the original command.

## A failed audit phase

A failed audit, vet, rebuttal, watch or close prints its assistant recovery
command when the runner knows the session. A failed fix does the same when no
serious contest is open. Run it as printed. The command reopens the stopped
session in the terminal and waits for input. It sends no prompt. Type what the
session should do, such as continue the phase or answer the question it stopped
on.

The runner has already stopped. It does not check or save the resumed session's work. A resumed
audit, vet, rebuttal or watch cannot finish the stopped round because only the runner saves or
publishes the text those phases return. A resumed fix or close may finish the files and commits it
owns. Start the next runner command yourself after the session finishes.

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

An audit fix with an unresolved serious contest prints a runner command:

```text
pnpm audit-round resume-fix <report> <session-id>
```

Run it as printed. The runner reloads the in-progress round and its saved fix
session. It asks for `vet`, `auditor`, `neither` or `not yet` for each missing
winner, stores every winner and one-line reason, then collects the free reply.
The reply may be empty once all winners are stored. `Not yet` keeps the commit
block and lets the fix answer a question before the runner asks again.

A failed fix with an unresolved serious contest uses the same route. When no
ruling file exists yet, the runner first resumes the fix so it can write one.
The route then finishes through the ordinary record checks and report deletion.

An implementation worker left at a ruling prints the worker's assistant recovery command instead
of `--resume`. Answer in that session, then rerun the original runner command without attaching a
second worker. Git shows the runner which shares remain.

## When recovery is complete

For an implementation `--resume <step>:<session-id>` route, recovery is complete only when the
worker reports success and the runner verifies its landed commit. A known session by itself proves
neither.

For `resume-fix`, recovery is complete only when every serious contest has a
stored winner, the fix reports success and the runner validates its records.

For an assistant recovery command, read the resumed session's final result. The stopped runner does
not verify it. If recovery fails again, use the newest printed command because it carries the
current resumable session.

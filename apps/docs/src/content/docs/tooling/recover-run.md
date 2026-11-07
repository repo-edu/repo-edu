---
title: Recover a run
description: Continue the retained phase or implementation worker after a failure or unanswered ruling
---

Recovery continues the stopped session and its existing files; it does not create a replacement
round.

## Start with the printed command

Read the failure reason, correct any named external problem and run the exact recovery command the
runner printed. It preserves the phase, working checkout, model, effort and known session identity.
The retained report files and logs remain the source of the work being continued.

A startup failure can happen before a session exists. In that case no recovery command is printed;
fix the startup problem and rerun the original command.

## Recover a failed audit phase

A failed audit, vet, rebuttal, fix, watch or close prints its assistant recovery command when the
runner knows the session. Run it as printed. The command reopens the stopped session in the
terminal and waits for input. It sends no prompt. Type what the session should do, such as continue
the phase or answer the question it stopped on.

The runner has already stopped. It does not check or save the resumed session's work. A resumed
audit, vet, rebuttal or watch cannot finish the stopped round because only the runner saves or
publishes the text those phases return. A resumed fix or close may finish the files and commits it
owns. Start the next runner command yourself after the session finishes.

Do not run `/audit` again for the same work. A new audit would claim another round number instead of
completing the open one.

## Recover a failed implementation worker

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

## Recover an unanswered ruling

An audit fix left without a reply prints that fix session's recovery command. Run it and answer the
saved ruling in the resumed session.

An implementation worker left at a ruling prints the worker's assistant recovery command instead
of `--resume`. Answer in that session, then rerun the original runner command without attaching a
second worker. Git shows the runner which shares remain.

## Know when recovery is complete

For an implementation `--resume <step>:<session-id>` route, recovery is complete only when the
worker reports success and the runner verifies its landed commit. A known session by itself proves
neither.

For an assistant recovery command, read the resumed session's final result. The stopped runner does
not verify it. If recovery fails again, use the newest printed command because it carries the
current resumable session.

## What owns this page?

`tools/audit-round/CLAUDE.md` sections **Ownership**, **Phase routing** and **Invocation** own this
page; `tools/audit-round/src/requests.ts` owns recovery command construction.

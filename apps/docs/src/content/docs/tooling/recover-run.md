---
title: Recover a run
description: Continue a stopped round, implementation worker or close after a failure or unanswered ruling
---

Recovery finishes the open work from its existing files. A stopped round is continued by typing
the same runner command again, and the runner prints that command. An implementation worker and a
close keep their own recovery.

| Fact | Detail |
| --- | --- |
| Owners | `tools/audit-round/CLAUDE.md` sections **Ownership**, **Stopped rounds** and **Invocation**; `roundRun` in `tools/audit-round/src/output.ts` owns which round a command continues |

## A stopped round

A round stops early when a phase fails, when you leave a ruling unanswered, when you press Ctrl-C
or when you close the terminal. It prints the failed session and one line that names the command
that continues the round:

```text
Session: <session-id>
Rerun: pnpm audit-round <stem>
```

Correct any problem the failure names, such as a usage limit, a model name in the settings or a
premise the plan must settle. Then run the printed command. It is the command you typed, so a bare
run prints `pnpm audit-round <stem>` and a `round` command prints its own target and options. A
commit audit names its commits by their IDs, because a `HEAD` form would name other commits once
`HEAD` has moved.

The rerun continues the round when its audit report was kept. The round keeps its number and adds
to its transcript and log. It skips each phase whose kept report still reads as valid and starts
the first phase that has none in a new session. Of the vetters, only those of the current list
without a valid kept report run. A phase still to run takes the current settings, so a vetter you
switched after a usage limit runs on the new selection. The audit and the rebuttal keep the
auditor of the kept audit report.

A round that stopped in its audit kept no audit report, so the rerun opens a new round. This is
also how a premise stop is answered: record the decision in the plan or in `BOUNDARIES.md`, then
run the printed command, and the new audit reads the changed text.

An `--auditor` or `--first` option on the rerun applies to the rounds after the continued one.

When the stopped round sits in a plan's audit range series, a rerun of the plan name starts at that
range. The ranges before it are not audited again, and the full range at the end still reads every
step. A list of scopes you typed runs as typed.

The `Session:` line names the stopped session, so you can still open it and ask what went wrong.
A resumed session cannot finish the round, because only the runner saves the reports and stores
the round's data.

## A ruling the round still needs

When the rerun reaches a fix whose serious contest or split still needs your winner, the fresh fix
writes the ruling again. The runner prints the ruling notice and waits; the terminal asks nothing.
Answer in the desktop app with `/ruling`. For each missing winner, give `report`, the tags of the
vetters that were right or `neither` with a one-line reason, or `not yet`. Add any free reply for
the fix. The reply may be empty once all winners are stored. `Not yet` keeps the commit block and
lets the fix answer a question before the runner waits again.

A winner you already gave is stored and is not asked again. A free reply you gave the stopped fix
is asked again, because the fresh fix does not have it.

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

An implementation worker left at a ruling prints the worker's assistant recovery command instead
of `--resume`. Answer in that session, then rerun the original runner command without attaching a
second worker. Git shows the runner which shares remain.

## A failed close

A failed close prints its assistant recovery command when the runner knows the session. Run it as
printed. The command reopens the stopped session in the terminal and waits for input. It sends no
prompt. Type what the session should do, such as continue the close or answer the question it
stopped on. A resumed close may finish the files and commits it owns. Then run the `close`
command again, and it finishes any move the session left to the runner.

A startup failure can happen before a session exists. In that case no recovery command is printed;
fix the startup problem and rerun the original command.

## When recovery is complete

A continued round is complete when the runner ends it as finished, which it records in the round's
data like any other round.

For an implementation `--resume <step>:<session-id>` route, recovery is complete only when the
worker reports success and the runner verifies its landed commit. A known session by itself proves
neither.

For an assistant recovery command, read the final session's result. The stopped runner does not
verify it. If the command fails again, use the newest printed command because it carries the
current resumable session.

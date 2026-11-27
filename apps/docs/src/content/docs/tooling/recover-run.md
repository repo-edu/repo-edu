---
title: Recover a run
description: Continue a stopped round, implementation worker or close after a failure or unanswered ruling
---

Recovery finishes the open work from its existing files. A stopped round is continued by typing
the same runner command again, and the runner prints that command. An implementation worker and a
close keep their own recovery.

| Fact | Detail |
| --- | --- |
| Owners | `tools/audit-round/references/ownership.md` maps source files. **Stopped rounds** in `tools/audit-round/references/targets-and-files.md` and `roundRun` in `tools/audit-round/src/output.ts` own round continuation. **Invocation** in `tools/audit-round/CLAUDE.md` covers stopping the runner |

## A stopped round

A round stops early when a phase fails, when you leave a ruling unanswered, when you press Ctrl-C
or when you close the terminal. It prints the failed session and one line that names the command
that continues the round:

```text
Session: <session-id>
Rerun: pnpm audit-round run <stem>
```

Correct any problem the failure names, such as a usage limit, a model name in the settings or a
premise the plan must settle. Then run the printed command. It repeats the command you typed, so a
full-plan run prints `pnpm audit-round run <stem>` and a `round` command prints its own target and
options. Two targets are spelled out instead:

1. A commit audit names its commits by their IDs, because a `HEAD` form would name other commits
   once `HEAD` has moved.
2. A `round` typed without a target names the plan it chose, as `<stem>.md`, because another plan
   may hold the newest stem commit by the time you rerun.

The rerun continues the round when the runner saved the audit result and its report still exists.
The round keeps its number and adds to its transcript and log. A report phase runs in a new session
if its saved result or report is missing. The runner uses the current list of vetters to decide
which reviews and decisions still apply. A phase still to run takes the current settings, so a
vetter you switched after a usage limit runs on the new selection. The audit and the rebuttal keep
the auditor of the kept audit report.

Editing a report changes what people and later sessions read. The runner uses
the saved results to decide which phases still need to run.

A round without a stored audit result opens a new round. This includes rounds
that stopped in their audit and rounds kept before structured results. This is
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

When the rerun reaches the fix with a question still open, the runner asks it again before the
fresh fix starts. The runner prints the ruling notice and waits; the terminal asks nothing. Answer
with `/ruling` in Claude or Antigravity or `$ruling` in Codex. For each missing winner, give
`report`, the tags of the vetters that were right or `neither` with a one-line reason. For each
open choice, give what the fix should do.

A winner you already gave is stored and is not asked again. A choice is asked again, because it is
not stored. A free reply you gave a stopped fix's ruling is lost, because the fresh fix does not
have it; it writes its ruling again when the decision is still open.

## A failed implementation worker

A worker failure prints the runner entry that started it with this option added:

```text
--resume <step>:<session-id>
```

Run the whole printed command, for example:

```text
pnpm audit-round implement <stem> <scope> --resume 3:<session-id>
pnpm audit-round run <stem> --resume 3:<session-id>
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

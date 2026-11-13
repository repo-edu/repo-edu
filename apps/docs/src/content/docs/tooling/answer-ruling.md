---
title: Answer a ruling
description: Read an open decision, submit your answer and resume the same assistant session
---

A ruling is the fix or implementation worker's saved explanation of a decision it cannot make for
you; your reply resumes the same session, so the work continues with everything it already read.

| Fact | Detail |
| --- | --- |
| Owners | `tools/audit-round/CLAUDE.md` owns ruling display, input and resumption; `.agents/skills/fix/references/ruling.md` owns the ruling's contents |

## When the runner asks

Only a fix or an implementation worker returns a ruling. It may ask about a
real product or cost choice that remains after the plan, code, boundaries and
earlier decisions have been checked. An audit fix also asks who won when the
auditor contests the vet on an A-tier or B-tier finding. A choice the shared
rules settle, a routine implementation choice, a permission failure or a
broken check is not a ruling.

The document names the open decision, the viable alternatives, their material differences and one
recommendation. It also gives a short suggested reply. The runner checks that the file exists and is
not empty before it shows it; a missing ruling fails the phase instead.

## Answering

1. Read the displayed ruling. Its path is printed above it if you need to
   reopen the document.
2. For each serious contest, enter `vet`, `auditor`, `neither` or `not yet`.
   A winner also needs a one-line reason. `Not yet` leaves that contest open so
   you can ask the fix a question.
3. Enter the free reply after the contest questions. It may be empty once every
   contest has a winner. For another ruling, state your decision or question in
   one or more lines.
4. Submit a blank line. The runner stores each winner and reason, records the
   free reply and resumes the same assistant session in the background.

You may ask a question instead of deciding. The session answers it and, while the decision stays
open, replaces the ruling with the current alternatives and asks again.

## After your reply

The resumed session carries your reply into the same fix or implementation step. Waiting time is
excluded from the runner's work timing. If the phase finishes, the runner continues its ordinary
checks, records and any remaining series or implementation steps.

A further open decision reuses the same session and ruling path. A resolved decision is not asked
again.

## Leaving without an answer

Pressing Ctrl-C, ending terminal input or closing a non-interactive run
discards an unfinished reply and stops the series or implementation. The round
or step files stay in place and the runner prints a recovery command. Use that
exact command to return to the retained work; do not start the decision again
in a fresh round.

An audit fix with an unresolved serious contest prints
`pnpm audit-round resume-fix ...`. That command reloads the stored winners,
keeps commits blocked while one is missing and resumes the same fix session.
It then performs the ordinary record checks and report deletion.

An implementation worker left at a ruling prints the assistant's recovery command. Answer there,
then rerun the original `pnpm audit-round implement ...` or bare full-plan command so the runner can
read Git and continue. See [Recover a run](/repo-edu/tooling/recover-run/).

## Ruling files

An audit fix writes `<target>-<round>-7-ruling.<tag>.md` in the plan checkout's `active/` folder. An
implementation worker writes `<stem>-impl-<step>-implement-ruling.<tag>.md`. The file is replaced
when the same session needs another decision and remains after the work finishes.

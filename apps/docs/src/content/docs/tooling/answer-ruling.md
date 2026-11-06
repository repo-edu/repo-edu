---
title: Answer a ruling
description: Read an open decision, submit your answer and resume the same assistant session
---

A ruling is the fix or implementation worker's saved explanation of a decision it cannot make for
you.

## When does the runner ask for one?

A phase returns a ruling only when a real product or cost choice remains after the plan, code,
boundaries and earlier decisions have been checked. A routine implementation choice, a permission
failure or a broken check is not a ruling.

The document names the open decision, the viable alternatives, their material differences and one
recommendation. It also gives a short suggested reply.

## How do I answer in the runner?

1. Read the displayed ruling. Its path is printed above it if you need to reopen the document.
2. Type one or more lines stating your decision. You may use the suggested reply or explain another
   listed alternative.
3. Submit a blank line. The runner records the complete non-empty reply and resumes the same
   assistant session in the background.

You may ask a question instead of deciding. The session answers it and, while the decision stays
open, replaces the ruling with the current alternatives and asks again.

## What happens after I submit it?

The resumed session carries your reply into the same fix or implementation step. Waiting time is
excluded from the runner's work timing. If the phase finishes, the runner continues its ordinary
checks, records and any remaining series or implementation steps.

A further open decision reuses the same session and ruling path. A resolved decision is not asked
again.

## What if I leave without answering?

Pressing Ctrl-C, ending terminal input or closing a non-interactive run discards an unfinished
reply. The round or step files stay in place and the runner prints a recovery command. Use that
exact command to return to the retained session; do not start the decision again in a fresh round.

An implementation worker left at a ruling prints the assistant's recovery command. Answer there,
then rerun the original `pnpm audit-round implement ...` or bare full-plan command so the runner can
read Git and continue.

## Where is the ruling saved?

An audit fix writes `<target>-<round>-7-ruling.<tag>.md` in the plan checkout's `active/` folder. An
implementation worker writes `<stem>-impl-<step>-implement-ruling.<tag>.md`. The file is replaced
when the same session needs another decision and remains after the work finishes.

## What owns this page?

`tools/audit-round/CLAUDE.md` owns ruling display, input and resumption;
`.agents/skills/fix/references/ruling.md` owns the ruling's contents.

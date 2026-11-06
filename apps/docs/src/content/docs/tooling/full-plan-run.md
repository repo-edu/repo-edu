---
title: Full Plan Run
description: Take one active plan from its current stage through close with pnpm audit-round
---

`pnpm audit-round <stem>` is the foreground command for moving one active plan through the rest of
its lifecycle. Use it when you want the runner to continue from the plan's current stage, rather
than starting each planning round, implementation step, audit range and close separately.

## When should I use it?

Run the command from either the Repo Edu or plan checkout after a plan exists in the plan repo's
`active/` folder. The stem is the plan filename without `.md` or `-widen`.

```bash
pnpm audit-round tooling-guide-usability
```

Invoking the full run is your permission for its settle, ready, implementation and close actions.
Use the individual stage commands instead when you want a different first auditor, no watch or a
read between stages.

## Where does it start?

The runner derives the start from the plan filename and stem history. It keeps no separate run
cursor.

| Current plan state | Stage that starts |
| --- | --- |
| The filename ends in `-widen` | Widening audits that challenge the plan's shape |
| The plan is settled but has no `ready` marker | Detailing audits that complete the brief |
| The plan is ready and has a missing step share or marker | Implementation, one fresh worker per remaining step |
| All implementation shares are present | The audit ranges written in the plan |
| The full implementation range has settled and no later plan edit intervened | Close |

A later invocation reads the repositories again and continues from the state the earlier run left.

## What does it read and write?

The command reads the active plan, its fixed implementation-step and audit-range lists, the joined
stem history in both repositories and the runner settings. Each stage writes only its ordinary
records:

1. Planning and implementation rounds write their reports, records and any accepted fixes.
2. Settle renames the widening plan and leaves its marker; ready records the assigned coder.
3. Implementation writes one checked step commit in each hosting repo and current `implemented`
   markers after all hosted steps land.
4. Close moves the plan and round data into the archive and writes each repo's closing record.

`-v` or `--verbose` shows assistant tool calls. `--resume <step>:<session-id>` resumes the failed
implementation worker named by the runner. No audit-series options are accepted by the full run;
use `pnpm audit-round round` when you need those controls.

## Where does it stop for me?

Most lifecycle transitions need no mid-run reply because invoking this command already grants them.
It stops when continuing would need information or a decision that the command did not supply.

1. **A ruling.** The runner displays a saved ruling and waits for your reply. Enter the requested
   decision, then submit a blank line. The same assistant session resumes with that answer.
2. **A failed phase or implementation worker.** The runner prints the command that resumes the
   retained session when one exists. Fix the named external problem if necessary, then run that
   exact command.
3. **A red watch or judge stop.** Read the stated concern and provide the requested evidence or
   decision. Run the same full-plan command again after the plan or repositories reflect the
   answer.
4. **Close with an open deferral.** The close route names the unresolved cross-repo correction and
   asks whether the plan may archive with it open.

Every stop prints the stage it ended in and the stages already completed. A normal finish closes
the plan and needs no follow-up command.

## What owns this page?

This page is a mirror. `repo-edu/tools/audit-round/CLAUDE.md`, under **Commands**, owns the bare
`<stem>` invocation and its stage routing. The workflows selected for each stage own their work and
win if this page differs. Correct this page when either owner changes.

---
title: "pnpm audit-round <stem>"
description: Take one active plan from its current stage through close with pnpm audit-round
---

Use `pnpm audit-round <stem>` to move one active plan from its current stage towards close.

:::caution[This command grants changes]
Running this command grants the plan's settle, ready, implementation and close actions. Use the
individual stage commands when you want to read or decide between those stages.
:::

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout. The stem is the plan filename
without `.md` or `-widen`.

```text
pnpm audit-round <stem>                              run from the plan's current stage
pnpm audit-round <stem> -v                           show assistant tool calls
pnpm audit-round <stem> --verbose                    same as -v
pnpm audit-round <stem> --resume <step>:<session-id> resume one failed implementation worker
```

Examples:

```text
pnpm audit-round tooling-guide-usability
pnpm audit-round tooling-guide-usability -v
pnpm audit-round tooling-guide-usability --resume 2:019a5d7d-example
```

`--resume` is used only when the runner printed that exact value after an implementation failure.
The full run accepts no audit-series options. Use `pnpm audit-round round ...` when you need to pick
an opening auditor, disable a watch or run one selected audit scope.

## When do I use it?

Use the full run when the plan may proceed through its remaining stages without a planned reading
between them. The runner derives the start from the plan filename and Git history:

| Current plan state | Stage that starts |
| --- | --- |
| The filename ends in `-widen` | Widening audits that challenge the plan's shape |
| The plan is settled but has no `ready` marker | Detailing audits that complete the brief |
| The plan is ready and has a missing step share or completion marker | Implementation, one fresh worker per remaining step |
| All implementation shares are present | The audit ranges written in the plan |
| The full implementation range has settled and no later plan edit intervened | Close |

A later invocation reads the repositories again. There is no separate run cursor.

## What does it read?

The runner reads the active plan at `../plan/active/<stem>.md`, its implementation steps and audit
ranges, the joined stem history in both repositories and `tools/audit-round/settings.json`. Every
stage then reads the sources its own workflow names. A resumed implementation also reopens the
retained worker session and reads both worktrees before continuing.

## Where does it stop and what do I type?

1. **A ruling needs your answer.** Read the displayed question, type the requested decision in the
   runner and submit a blank line. The same assistant session resumes with your answer.
2. **A phase or worker failed.** Run the exact recovery command printed by the runner. It names the
   retained session when one can continue. Fix any external problem named by the failure first.
3. **The watch grades the work red.** Read the named `-watch.md` file and choose its response before
   running `pnpm audit-round <stem>` again.
4. **A round changes the plan's phase.** This stop can happen in any series. For example, an
   implementation-audit fix may reopen the plan by renaming it to `<topic>-widen.md`. Read the
   correction, then run `pnpm audit-round <stem>` again to start from the new phase.
5. **Widening or detailing ends before the next stage.** A judge stop or the round maximum ends the
   full run during these stages. Read the reason, supply any named evidence or decision, then run
   `pnpm audit-round <stem>` again. During the audit ranges, a judge stop or the round maximum does
   not stop the full run; it continues to the next range or close.
6. **Close finds an open deferral.** An accepted correction still belongs in the other repository
   and has not been applied there. Run the printed `Resume:` command to reopen the retained close
   session, then answer whether to close with the correction still open or keep the plan active.
7. **The run finishes.** Type nothing. The plan has been closed and the runner prints the stages it
   completed.

## What does it leave behind?

The exact outputs depend on the stages that ran:

1. Each round reserves `../plan/active/<target>-<round>-0-claim.md` and writes its transcript to
   `../plan/active/<target>-<round>-1-round.<tag>.md` and its log to the same path ending in `.log`.
   A round may also write an audit at order 2, a vet at order 3, a rebuttal at order 4, a ruling at
   order 7 and a watch at order 9, all under
   `../plan/active/<target>-<round>-<order>-<kind>.<tag>.md`.
2. Plan rounds update `../plan/active/<stem>-plan-rounds.json` or
   `../plan/active/<stem>-impl-rounds.json`. An implementation worker writes
   `../plan/active/<stem>-impl-<step>-implement.log` and, while it waits for an answer,
   `../plan/active/<stem>-impl-<step>-implement-ruling.<tag>.md`.
3. Settle and ready leave Git markers in the plan repository. Implementation leaves one checked
   step commit in each hosting repository and later leaves each repository's `implemented` marker.
4. Close writes `../plan/active/<stem>-close.<tag>.log`. It moves the plan and both existing round
   data files to `../plan/archive/<name>/` and leaves the closing commits in the hosting
   repositories.
5. Close deletes the plan's handoffs, claims, audit reports, vet and rebuttal twins, phase-change
   markers and yield reports. Round transcripts and logs, implementation logs, briefs, rulings,
   watches and the close log stay under `../plan/active/`.

A completed fix removes its audit, vet and rebuttal files after their findings enter the Git
record. The round's claim, transcript, log, ruling, watch and round data remain until close applies
the rules above.

## What owns this page?

`tools/audit-round/CLAUDE.md` owns the full-run command and output paths; the workflows under
`.agents/skills/` own each stage's behaviour.

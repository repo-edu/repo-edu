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
3. **The judge stops the series.** A fresh assistant has decided that another listed auditor would
   not resolve the missing evidence or decision. Read the reason, supply the named evidence or
   decision, then run `pnpm audit-round <stem>` again.
4. **Close finds an open deferral.** An accepted correction still belongs in the other repository
   and has not been applied there. Type whether to close with that correction still open or keep the
   plan active for it; the close route asks the concrete question.
5. **The run finishes.** Type nothing. The plan has been closed and the runner prints the stages it
   completed.

## What does it leave behind?

The exact outputs depend on the stages that ran:

1. Planning and implementation rounds leave claims, transcripts, reports and reviews under
   `../plan/active/<target>-<round>-<order>-<kind>...`, plus machine-owned
   `../plan/active/<stem>-plan-rounds.json` and `../plan/active/<stem>-impl-rounds.json`.
2. An implementation worker leaves `../plan/active/<stem>-impl-<step>-implement.log` and, while it
   waits for an answer, `../plan/active/<stem>-impl-<step>-implement-ruling.<tag>.md`.
3. Settle and ready leave Git markers in the plan repository. Implementation leaves one checked
   step commit in each hosting repository and later leaves each repository's `implemented` marker.
4. A completed close moves the plan and its round data to `../plan/archive/<name>/` and leaves the
   closing commits in the hosting repositories.

Reports from completed fixes are removed after their findings enter the durable Git record. Claims,
transcripts, logs and round data remain until close.

## What owns this page?

`tools/audit-round/CLAUDE.md` owns the full-run command and output paths; the workflows under
`.agents/skills/` own each stage's behaviour.

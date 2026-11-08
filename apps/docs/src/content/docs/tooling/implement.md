---
title: pnpm audit-round implement
description: Implement ready plan steps with one assigned-coder worker per step
---

`pnpm audit-round implement` lands a ready plan's remaining steps in order, one fresh worker per
step on the plan's assigned coder, and stops there instead of going on to the implementation audits
and the close as the full run does.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root; each worker works in the repos its step names |
| Owners | `tools/audit-round/CLAUDE.md` and `tools/audit-round/src/implement.ts` own the command; `.agents/skills/implement/references/workflow.md` owns the worker |

## Usage

```text
pnpm audit-round implement <stem>                           implement every pending step
pnpm audit-round implement <stem> <step>                    implement one step if it is pending
pnpm audit-round implement <stem> <first>-<last>            implement the pending steps in a range
pnpm audit-round implement <stem> [scope] -v | --verbose    also show worker tool calls
pnpm audit-round implement <stem> [scope] --resume <step>:<session-id>
                                                            resume the failed worker it printed
pnpm audit-round implement -h | --help                      show the command's help
```

## Behaviour

The command needs an active plan whose `ready` marker assigns a coder. It reads the plan's
**Implementation plan** steps and their hosting sentences, then scans each hosting repo's history on
its own for the step commits already landed. A step hosted in both repos has two shares, one per
repo.

For each selected step that still has a missing share, in step order, it starts one fresh worker on
the assigned coder's model release and effort. It resolves the release once, when the command
starts. The worker reads the whole plan and the owning repos' instructions, implements the step,
runs the step's checks and commits one share per hosting repo. After each worker the runner checks
the landed share subjects before it starts the next step. A step whose shares have all landed is
skipped.

Once every share a repo hosts has landed, the runner writes that repo's current `implemented`
marker, carrying the coder's model record and capability tag.

A worker that needs a product decision writes a ruling and waits for your reply in the runner. Your
reply resumes the same worker session. Time spent waiting is not counted as implementation time.

`--resume` takes only the value the runner printed after a failure. The resumed session first reads
Git and the worktrees, because the failed turn may have left uncommitted work or landed a share. The
runner uses the session only while that step is selected and still pending; otherwise it prints that
the session stays unused. Fresh workers then take the remaining pending steps.

## Output

1. **Step commits.** One checked `<stem>/impl-<n>` commit in each repo that hosts the step.
2. **Markers.** Each repo's `<stem>/implemented` marker once all its shares have landed.
3. **A log per started step** at `../plan/active/<stem>-impl-<step>-implement.log`. A recovery
   appends to it, so the log shows the failed turn, the recovery and the later ending in order.
4. **A ruling** at `../plan/active/<stem>-impl-<step>-implement-ruling.<tag>.md` while a worker
   waits for your answer.

## Refuses when

The runner prints `audit-round: <reason>` and starts no worker. An argument refusal exits with
status 2 and any other with status 1.

1. **The plan has no ready marker.** `<stem>.md has no ready marker. Run pnpm audit-round ready
   first, or close it with --aborted <reason>.`
2. **The ready marker assigns no coder.** `<stem> has a ready marker without a coder assignment.`
3. **The scope is malformed or runs past the last step.** `<stem> has <n> implementation steps;
   scope <scope> ends at step <m>.`
4. **No active plan has the stem**, or the stem is a path.

## Stop and recovery

A failed worker, an unanswered ruling or a missing landed share stops the command before the next
step. The runner never retries a worker on its own.

1. **A worker needs a ruling.** Read the displayed ruling, type your reply and submit it with a
   blank line. Leaving without a reply prints the worker's own assistant recovery command; answer in
   that session, then run the runner again. See [Answer a ruling](/repo-edu/tooling/answer-ruling/).
2. **A worker failed or landed no share.** Fix any outside problem the failure names, then run the
   printed command. It repeats the command you typed, `-v` included, with `--resume <step>:<id>`.
   A failure without a known session prints no command; run the same command again and a fresh
   worker takes the step. See [Recover a run](/repo-edu/tooling/recover-run/).

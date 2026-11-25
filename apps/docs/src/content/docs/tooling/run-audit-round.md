---
title: Run an audit round
description: Choose a target and carry one audit through vet, rebuttal, fix and the series decision
---

An audit round turns one bounded plan, implementation range or commit set into a checked audit
report and a durable outcome, with a second assistant checking the first before anything lands.

| Fact | Detail |
| --- | --- |
| Owners | `tools/audit-round/CLAUDE.md` owns target resolution, `tools/audit-round/references/rounds.md` owns the phase sequence, `tools/audit-round/references/series.md` owns the series decision and `tools/audit-round/references/output.md` owns what a round prints; the audit, vet, rebuttal, ruler and fix workflows under `.agents/skills/` own their phases |

## Why a round has five phases

One reading by one assistant can be wrong in a confident voice. The round therefore splits the
work so no phase checks itself:

1. **Audit.** One assistant reads the bounded target and returns any findings. The runner writes
   the audit report and records a clean result when there are no findings.
2. **Vet.** Every vetter listed for the work class checks each finding for authority, evidence and
   fit, side by side and each from a fresh context. A reach, rarity or harm value that a vetter
   reads differently is an `Accept` with a note, and the audit report's value stands. It is a
   `Drop` only when it puts the finding in a cell that a round does not raise, and a `Revise` only
   when its rarity changes the correction. A dispute on such a `Drop` or `Revise` reaches the ruler
   or you like any other. A clean audit report skips this phase.
3. **Rebuttal.** A new session answers only revisions, drops and ruling items for the audit report,
   on the same model and effort as the audit. One rebuttal answers every vetter. When every vetter
   accepts every finding, this phase is skipped.
4. **Ruler.** When the rebuttal contests a vetter's verdict, or two vetters give different verdicts,
   on a finding whose highest grade from the audit report or any vetter is C or D, a new session
   names the winner of each such dispute after opening every source it cites. Without such a
   dispute, this phase is skipped.
5. **Fix.** Before the fixer starts, the runner asks you once for every winner and choice the
   reviews leave to you. When the rebuttal contests a vetter's verdict, or two vetters give
   different verdicts, on a finding whose highest grade is A or B, you name whether the audit
   report, one or more vetters by their tags or neither is right, and the runner records your
   one-line reason. You also give your choice on each referral no review disputes and each open
   choice the ruler states. The fixer then reconciles the readings and applies the ruler's winners
   and the winners and choices you gave. It applies the settled corrections and lands the records.
   It writes a ruling only for a decision it meets in its own work. The fix cannot commit until
   every required winner is recorded, and returning finished earlier fails the round. The audit
   target picks the fixer:
   - A planning round, or a commit audit of plan-repo commits alone, fixes on the configured
     planning fixer.
   - An implementation round fixes on the plan's assigned coder.
   - A commit audit with Repo Edu commits fixes on the first listed coder.

The audit, vet, rebuttal and ruler are read-only. The fix is the phase that receives authority to
change the judged repositories. Where due, a watch then checks the episode's trajectory. In an
automatic series the runner applies fixed rules to decide whether another assistant needs a current
read.

## A round or the full run

Every round runs in the runner, which has no chat command for a single phase. Use `round` for a plan
and `round-commits` for Git commits. Both carry the audit report through those phases and apply the
automatic-series rules. See [round and round-commits](/repo-edu/tooling/runner-round/). Use the bare
[`pnpm audit-round run <stem>`](/repo-edu/tooling/full-plan-run/) when the plan may also proceed
through later lifecycle stages without a planned reading between them.

## Targets

```text
pnpm audit-round round <stem>                 round selected from the plan's history
pnpm audit-round round <stem> plan            planning round after a step has landed
pnpm audit-round round <stem> <n>             one implementation step
pnpm audit-round round <stem> <a>-<b>         one implementation step range
pnpm audit-round round <stem> 2,3-5,6-7       several ranges, one series each
pnpm audit-round round-commits <commits>      work outside a plan
```

With `round-commits`, prefix the first plan-repository reference with `plan@`. Earlier references
belong to Repo Edu. With `round`, omitting the stem selects the active plan whose stem commit is
newest across both repositories.

Before implementation, a bare stem selects the planning round its history calls for. After every
step share and implementation marker has landed, it runs the plan's listed audit ranges and then
the full implementation range. After a stopped round, it starts at the range where the round
stopped.

A planning round needs a committed plan. When no commit holds the plan file, the command stops
before any assistant starts and asks for the plan's `init` commit. Commit the plan and run the
command again.

## When a series stops

An automatic series stops when every listed auditor has a current read, the configured round maximum
is reached, a phase fails, a ruling is left unanswered, a watch grades red or a fix changes the
plan's phase. Before the fix the runner asks once for every winner and choice the reviews leave to
you and says whether the fix uses the auditor's model, a vetter's model or neither. A fix's own
ruling resumes the same fix on your reply before the series continues.

A round that stops early prints a `Rerun:` line with the command that continues it. Running it
continues the stopped round on its kept reports. See
[Recover a run](/repo-edu/tooling/recover-run/).

The runner answers stop after the read floor. For a widening plan, the retained settling line may
instead answer settle. During detailing before the ready marker, the answer is ready. These answers
do not make the user's lifecycle call; the full-plan run acts on settle and ready only because
its invocation granted them in advance.

## Following a round

The terminal shows the target, phase selection, elapsed time and each phase's Markdown. The
evidence checkout's `../plan-evidence/active/` folder keeps the transcript, tool log and retained
round data. Use
[Find round outputs](/repo-edu/tooling/find-round-outputs/) when you need the audit report, a vet
or rebuttal report or the complete conversation after the terminal has scrolled.

On macOS the runner keeps the computer from idle-sleeping for as long as it runs, on battery as
well, so an unattended run continues after the display sleeps. Closing the lid still puts the Mac
to sleep.

---
title: "pnpm audit-round <stem>"
description: Take one active plan from its current stage through its close with pnpm audit-round
---

`pnpm audit-round <stem>` takes one active plan from the stage it stands at through its close, by
running the same stages the single runner commands run, in lifecycle order.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root; arguments mean the same from either |
| Owners | `tools/audit-round/CLAUDE.md` owns the run and its output paths; the workflows under `.agents/skills/` and `../plan/.agents/skills/` own each stage |

## Usage

```text
pnpm audit-round <stem>                               run the plan from its current stage to close
pnpm audit-round <stem> -v | --verbose                also show assistant tool calls
pnpm audit-round <stem> --resume <step>:<session-id>  resume the failed worker the runner printed
pnpm audit-round -h | --help                          show the runner's help; a bare call does too
```

```text
pnpm audit-round tooling-help-pages
pnpm audit-round tooling-help-pages --resume 2:019a5d7d-example
```

The stem is the plan filename without `.md` or `-widen`. The run takes no round option. When one
listed auditor has a current read and another has none, an auditor without one opens the series.
With no current read, or one from every listed auditor, the default auditor from
`tools/audit-round/settings.json` opens it. Every series also runs the glance and the watch. Use
[`pnpm audit-round round`](/repo-edu/tooling/runner-round/) for another opener, no watch or a single
scope, and the stage commands when you want to read between stages.

## Behaviour

Invoking the run is your settle, ready and close call given in advance. The run settles the plan
when the runner answers settle after the widening read floor, marks it ready after the detailing
read floor and closes it after a range series that needed nobody, through the same functions and
commit forms as [`settle`](/repo-edu/tooling/settle/), [`ready`](/repo-edu/tooling/ready/) and
[`close`](/repo-edu/tooling/runner-close/).

The start comes from the plan filename and both Git histories:

| Plan state | Stage that starts |
| --- | --- |
| The filename ends in `-widen` | The widening series, which challenges the plan's shape |
| Settled, with no `ready` marker in the plan repo | The detailing series, which completes the brief |
| Ready, with a pending step share or a missing or stale `implemented` marker | The [implementation](/repo-edu/tooling/implement/), one fresh worker per pending step |
| Every share landed with current markers | The audit range series: each listed range, then the full range |
| The full range's newest round ended on a runner stop and no file-changing stem commit landed in either repo since it started, other than the round's own | The close |

After settle or ready the run reads the stage again, because a plan reopened after its ready marker
keeps the marker and goes on to the implementation or the range series. During the audit ranges a
runner stop or the round maximum ends only that range, and the run continues to the next range or
the close.

The run keeps no state of its own. Each stage prints its own lines and keeps its own files, and the
run adds one line per stage start and one ending line naming the stage it ended in and the stages it
completed. Running the same command again reads both repos again and continues from where the plan
stands.

`--resume` attaches the printed worker session only when the run starts in the implementation and
that step is still pending. Otherwise the run prints that the session stays unused and continues
with fresh workers.

## Output

The run leaves what its stages leave:

1. **Each audit round** leaves its claim, transcript, log and round data in `../plan/active/`, as
   [`pnpm audit-round round`](/repo-edu/tooling/runner-round/#output) describes.
2. **Settle** renames the plan and commits `<stem>/settle`; **ready** commits the empty
   `<stem>/ready` marker with the assigned coder.
3. **The implementation** leaves one checked step commit per hosting repo, each repo's `implemented`
   marker and one log per started step.
4. **The close** archives the plan, writes the closing commits and leaves
   `../plan/active/<stem>-close.<tag>.log`.

[Find round outputs](/repo-edu/tooling/find-round-outputs/) names every file and when it goes.

## Refuses when

The runner prints `audit-round: <reason>` and starts nothing. A refusal from the argument parser
prints its own line without that prefix. An argument refusal exits with status 2 and any other
refusal with status 1.

1. **No active plan has that stem.** `No active plan named <stem> at <active folder>. The run
   command requires an active plan.` An archived plan gives the same refusal.
2. **The stem is a path.** `Name the plan by its stem, such as <stem>, without a path.`
3. **An option comes before a subcommand.** For example `pnpm audit-round -v round <stem>`. The
   argument parser prints `--verbose came before round.` without the `audit-round:` prefix. Put the
   option after the subcommand.

## Stop and recovery

Any ending other than the stages' own progress ends the run with that stage's lines and recovery
command. Each recovery ends with running `pnpm audit-round <stem>` again unless a resume command
continues the run itself.

1. **A ruling needs your answer.** A fix or an implementation worker writes its question. The
   terminal prints a notice and the run opens the Claude desktop app, where you answer with
   `/ruling <stem>`. Once the chat sends your answer, the same session resumes and the run
   continues. Ctrl-C in the terminal leaves the question unanswered, ends the run and prints the
   session's recovery command. See [Answer a ruling](/repo-edu/tooling/answer-ruling/).
2. **A phase or worker failed.** Fix any outside problem the failure names, then run the printed
   `Resume:` command or the printed `--resume` form of this command. See
   [Recover a run](/repo-edu/tooling/recover-run/).
3. **The watch grades the episode red.** Read the named `-watch.md` file and act on it before you
   rerun.
4. **A fix changed the plan's phase.** For example an implementation-audit fix renamed the plan to
   `<topic>-widen.md`. Read the correction, then rerun to start from the new phase.
5. **Widening or detailing ended without settle or ready.** A retained `keep open` line or the
   round maximum ends the run in these stages. Supply the evidence or decision its reason names,
   then rerun.
6. **Settle or ready refused.** The lifecycle call refuses, for example when the plan file has
   uncommitted changes. Resolve the named condition and rerun.
7. **The close needs your word.** It asks, for example, to archive with an open deferral, and fails
   with the question. Run its printed `Resume:` command and answer in that session.

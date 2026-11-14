---
title: pnpm audit-round round
description: Run one audit round or series on a plan scope or commit set
---

`pnpm audit-round round` runs the audit, vet, rebuttal and fix sequence on one plan scope or commit
set, and lets fixed runner rules or your own queue decide whether another auditor follows, without
granting any later plan stage.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root; arguments mean the same from either |
| Owners | `tools/audit-round/CLAUDE.md` and `tools/audit-round/src/command.ts` own the command; the workflows under `.agents/skills/` and `../plan/.agents/skills/` own each phase |

## Usage

```text
pnpm audit-round round <stem>                        audit the stage the plan's history selects
pnpm audit-round round <stem> plan                   audit the plan document whatever has landed
pnpm audit-round round <stem> <step>|<first>-<last>  audit implemented steps
pnpm audit-round round <stem> 2,3-5,6-7              one automatic series per scope, in order
pnpm audit-round round <commit> [<commit> ...]       audit commits outside a plan
pnpm audit-round round <from>..<to>                  audit an inclusive commit range
pnpm audit-round round                               use the plan pnpm audit-round plan prints
pnpm audit-round round <target> --first <selection>  open the automatic series with this auditor
pnpm audit-round round <target> --auditor <list>     run a manual series in this auditor order
pnpm audit-round round <target> --no-watch           skip the trajectory glance and watch
pnpm audit-round round <target> -v | --verbose       also show assistant tool calls
pnpm audit-round round -h | --help                   show the command's help
pnpm audit-round replay                              replay stored answers through the fixed rules
```

```text
pnpm audit-round round tooling-help-pages 3-5
pnpm audit-round round tooling-help-pages 3 --auditor atx,obm
pnpm audit-round round HEAD plan@HEAD
pnpm audit-round round HEAD-2..HEAD
```

An auditor selection is `claude`, `codex` or a capability tag without spaces: `a` or `o` for the
assistant, then optionally `b` or `t` for the base or top model and `l`, `m`, `h` or `x` for the
effort. A field a tag omits reads that assistant's `defaults` in `tools/audit-round/settings.json`.
Separate list entries with commas or spaces, and quote a list that holds spaces.

## Behaviour

### Targets

1. **A plan stem alone** runs the audit its history calls for. Before any step lands it is a
   planning audit of the plan document. Once every listed share has landed and each hosting repo's
   `implemented` marker follows its newest hosted step, it runs each `Audit ranges:` scope in order,
   then the full listed range; a sentence listing only the full range runs that range once.
2. **The word `plan`** selects the planning audit whatever has landed, for a plan edited after
   ready. It continues the plan's `-plan-audit` series.
3. **A step or range** selects an implementation audit of those steps. A list of scopes runs one
   automatic series per scope, each on its own target and files.
4. **Commit references** are a commit ID, `HEAD`, `HEAD-<n>`, a list of them or an inclusive
   `<from>..<to>` range. An unprefixed reference is a Repo Edu commit. `plan@` marks a plan-repo
   commit, and every reference after the first `plan@` one belongs to the plan repo too, so list
   Repo Edu commits first. A commit series has no watch.
5. **No target** takes the active plan with the newest stem commit in either repo, as if named
   alone.

The first line of every round names the target it resolved. A plan whose name looks like a commit
reference keeps `.md` to mark it as a plan.

### Phases of a round

1. **Audit.** The selected auditor reports findings.
2. **Vet.** The other assistant checks the findings, so no assistant vets its own report.
3. **Rebuttal.** The auditor answers the vet's revisions, drops and ruling items on the audit's
   model and effort. It is skipped when the vet accepts every finding.
4. **Fix.** The fixer applies the agreed corrections and lands the record. A planning round and a
   commit audit of plan-repo commits alone fix on `planning.fixer` in
   `tools/audit-round/settings.json`. An implementation round fixes on the plan's assigned coder. A
   commit audit with Repo Edu commits fixes on the first `implementation.coders` entry. The fix may
   stop for your ruling. When the auditor contests a verdict whose report or revised vet tier is A
   or B, that ruling shows both positions and you name the side that is right.
5. **Glance and watch.** After a finished plan round with findings, the glance decides from the
   commit record whether a trajectory watch is due, and a due watch writes its grade.
6. **Series decision.** In an automatic series the runner reads retained data and bounded commit
   evidence, then ends the series or names the next auditor without starting an assistant.

A clean audit skips the vet, rebuttal, fix, glance and watch. A plan target lands its `clean` record
directly; a commit target lands nothing. An automatic series still applies its decision rules.

### Series

1. **Automatic series**, without `--auditor`. Planning targets and plan-only commit targets use
   `planning.auditors`. Implementation targets and any commit target with a Repo Edu group use
   `implementation.auditors`. The `--first` selection opens; it must name an auditor from the
   target work class's list. Without it, the retained round data opens on a listed auditor
   without a current read when another has one, so a rerun continues where the series stood;
   otherwise the configured default auditor opens, and a `random` default picks it again for each
   scope. After each round that is not red, the runner applies three rules. A read is current only
   after the latest settle, reopen, plan step, plan edit outside a round or audit with a real bug.
   Each listed auditor needs its own current read, so two models or efforts of one assistant are
   two readers. Once every listed auditor has a current read, widening follows the retained
   settling line, detailing answers ready before the ready marker and every other series answers
   stop. Otherwise the next round goes to the listed auditor without a current read that read the
   scope least recently. `maximumAutomaticRounds` in the settings caps the series, counting its
   first round.
2. **Scope list.** Each scope runs its own automatic series in list order, and `--first` opens every
   scope. A runner stop or the maximum ends only that scope.
3. **Manual series**, with `--auditor`. The entries run left to right on the same target. The ones
   after the current round wait in `../plan/active/<target>-queue.md`, which each round prints. Edit
   it at any time to add, remove or reorder entries; the runner reads it between rounds, and an
   empty or deleted file ends the series after the current round. A clean audit removes queued
   entries that resolve to the same assistant, model and effort.

A settle or ready answer ends the series and prints the `settle` or `ready` command to run; the
plan itself is left unchanged for your call. A commit series' later rounds read the original commits
plus the fixes landed so far.

### Deferrals

Before an automatic implementation series, and again after each finished implementation-audit round,
the runner checks for an open deferral into the plan repo. When one exists and the series would
continue to its decision, it chains one planning round for those deferrals on the default entry
from `planning.auditors`, including that entry's model and effort. That round does not count against
the series maximum. Each plan-scoped
implementation audit also receives the open deferrals into Repo Edu. Every automatic series ending
prints the remaining open deferrals or says there are none.

### Replay the rules

`pnpm audit-round replay` applies the same decision function to every retained automatic-series
answer. It prints the computed answer, stored answer and next round's findings, followed by ordinary
totals and the fixed Baseline totals. It starts no assistant and writes nothing. Use its output when
considering a change to the rules in `../plan/STOP-CONDITIONS.md`.

## Output

All files live in `../plan/active/`:

1. **Every round** claims `<target>-<round>-0-claim.md` and writes its transcript
   `<target>-<round>-1-round.<tag>.md` with a log beside it.
2. **The audit, vet and rebuttal** stay as `-2-audit`, `-3-vet` and `-4-rebut` files until a
   finished fix records their outcome and the runner deletes them. A clean plan-target audit keeps
   its report.
3. **A ruling** adds `-7-ruling.<tag>.md` and **a due watch** `-9-watch.<tag>.md`.
4. **Round data** goes to `<stem>-plan-rounds.json` or `<stem>-impl-rounds.json` for a plan target
   and to `<commit-label>-rounds.json` for a commit target.
5. **A manual series** keeps `<target>-queue.md` until the series ends.

A finished fix lands its local records only in the judged repos whose files took accepted findings.
A finding whose correction belongs outside the judged set is carried as a deferral record in the
sole judged repo. A repo gets no record just because it was judged. The target is
`<stem>-plan-audit`, `<stem>-impl-audit-<a>..<b>` or `commit-<label>`. See
[Find round outputs](/repo-edu/tooling/find-round-outputs/) for every order number.

## Refuses when

The runner prints `audit-round: <reason>` before it claims a round. A refusal from the argument
parser prints its own `error:` line without that prefix. An argument refusal exits with status 2
and any other with status 1.

1. **The scope is malformed.** A step scope is a positive number or an increasing range, and the
   word `plan` joins no list.
2. **A step scope names a plan with no landed step.** `No step of <stem> has landed, so it has no
   implementation to audit.` Name the plan alone for a planning round.
3. **A bare plan is mid-implementation.** `<stem> is still being implemented.` The message names
   pending steps per repo and each missing or stale marker. Name a landed step scope instead.
4. **The plan is archived, missing or given as a path.**
5. **A commit reference names no commit, or a range is not an increasing ancestry range.**
6. **Options conflict.** `--first` cannot join `--auditor`; the argument parser refuses that pair.
   A scope list cannot run with `--auditor`, whose queue belongs to one scope.
7. **`--first` names an unlisted auditor.** The message names what the selection resolved to and
   the target work class's listed auditors. Use `--auditor` for a round with an auditor outside the
   list.

## Stop and recovery

1. **A fix needs your ruling.** The terminal prints a notice and the run opens the Claude desktop
   app on the folder of the work. The notice names the round, the ruling file, the findings that
   need a winner, whether the fix uses the auditor's model, the vet's model or neither, and the line
   to type in the app, `/ruling <stem>`. The terminal reads no answer. For each listed serious
   contest you name `report`, the tags of the vets that were right or `neither` with a one-line
   reason, or `not yet`, which sends your question to the fix and asks again when the ruling
   returns. The fix remains unable to commit until every required winner is recorded. The free reply
   may be empty once every contest has a winner. Ctrl-C in the terminal keeps the round's files,
   prints the fix's recovery command and ends the series. See
   [Answer a ruling](/repo-edu/tooling/answer-ruling/).
2. **A phase fails.** Fix the outside problem the failure names, then run the printed `Resume:`
   command. See [Recover a run](/repo-edu/tooling/recover-run/).
3. **The watch grades the episode red.** The series stops before another round. Read the watch and
   act on it first.
4. **A fix changed the plan's phase.** The round finishes without a series decision and the series
   ends. Rerun against the plan's new phase.

A failure, an unanswered ruling, a red watch or a phase change also ends a scope list and names the
scopes that did not run.

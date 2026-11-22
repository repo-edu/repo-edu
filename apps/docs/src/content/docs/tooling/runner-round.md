---
title: round and round-commits
description: Run one audit round or series on a plan scope or commit set
---

Use `pnpm audit-round round` to audit a plan or its steps. Use `pnpm audit-round round-commits`
to audit Git commits. Both run the audit, vet, rebuttal, ruler and fix sequence. The runner's
series rules or your auditor queue decide whether another auditor follows.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root; arguments mean the same from either |
| Owners | `tools/audit-round/CLAUDE.md` and `tools/audit-round/src/command.ts` own both commands. The workflows under `.agents/skills/` and `../plan/.agents/skills/` own each phase |

## Usage

```text
pnpm audit-round round                                 use the plan pnpm audit-round plan prints
pnpm audit-round round <stem>                          audit the stage the plan's history selects
pnpm audit-round round <stem> plan                     audit the plan document whatever has landed
pnpm audit-round round <stem> <step>|<first>-<last>    audit implemented steps
pnpm audit-round round <stem> 2,3-5,6-7                one automatic series per scope, in order
pnpm audit-round round <stem> --first <selection>      open the automatic series with this auditor
pnpm audit-round round <stem> --auditor <list>         run a manual series in this auditor order
pnpm audit-round round <stem> --no-watch               skip the trajectory glance and watch
pnpm audit-round round <stem> --verbose                also show assistant tool calls
pnpm audit-round round -h                              show plan audit help

pnpm audit-round round-commits <commits>               audit commits from Repo Edu
pnpm audit-round round-commits [<commits>] plan@<commits>
                                                       include commits from the plan repo
pnpm audit-round round-commits -h                      show commit audit help
```

```text
pnpm audit-round round tooling-help-pages 3-5
pnpm audit-round round tooling-help-pages 3 --auditor atx,obm
pnpm audit-round round-commits HEAD plan@HEAD
pnpm audit-round round-commits HEAD-2..HEAD
```

Both commands accept `--first`, `--auditor` and `-v` or `--verbose`. An auditor selection is
`claude`, `codex` or a capability tag written without spaces. Use `a` or `o` for the assistant,
then optionally `b` or `t` for the base or top model and `l`, `m`, `h` or `x` for the
effort. A field a tag omits reads that assistant's `defaults` in `tools/audit-round/settings.json`.
Separate list entries with commas or spaces, and quote a list that holds spaces.

## Behaviour

### Targets

1. **A plan stem alone** runs the audit its history calls for. Before any step lands it is a
   planning audit of the plan document. Once every listed share has landed and each hosting repo's
   `implemented` marker follows its newest hosted step, it runs each `Audit ranges:` scope in order,
   then the full listed range; a sentence listing only the full range runs that range once. When a
   round on one of those ranges stopped, the rerun starts at that range and does not audit the
   ranges before it again. The full range at the end still reads every step.
2. **The word `plan`** selects the planning audit whatever has landed, for a plan edited after
   ready. It continues the plan's `-plan-audit` series.
3. **A step or range** selects an implementation audit of those steps. A list of scopes runs one
   automatic series per scope, each on its own target and files.
4. **`round` with no target** takes the active plan with the newest stem commit in either repo,
   as if named alone.
5. **`round-commits` requires commit references.** For each repo, supply a commit ID, `HEAD`,
   `HEAD-<n>`, a list of references or one inclusive `<from>..<to>` range. Prefix the first
   plan-repo reference with `plan@`. Earlier references belong to Repo Edu and the rest belong
   to the plan repo. Commit audits skip the watch.

The first line of every round names the target it resolved.

### Phases of a round

1. **Audit.** The selected auditor reports findings.
2. **Vet.** Every vetter in the target work class's `vetters` list in
   `tools/audit-round/settings.json` checks the findings, side by side and whoever audited.
3. **Rebuttal.** A new session on the audit's model and effort answers every vetter's revisions,
   drops and ruling items for the audit report. It is skipped when every vetter accepts every
   finding.
4. **Ruler.** When the rebuttal contests a vetter's verdict, or two vetters of the panel give
   different verdicts, on a finding whose highest grade from the audit report or any vetter is C or
   D, a new session names the winner of each such dispute. It runs on the `ruler` selection of the
   target work class's audit level in `tools/audit-round/settings.json` and opens every source it
   cites; the runner sends it back once when its report names a source its session did not open.
   It is skipped when no such dispute exists.
5. **Fix.** The fixer applies the agreed corrections and lands the record. A planning round and a
   commit audit of plan-repo commits alone fix on `planningAudit.fixer` in
   `tools/audit-round/settings.json`. An implementation round fixes on the plan's assigned coder. A
   commit audit with Repo Edu commits fixes on the first `coders` entry. A commit audit's fix
   commits open with its series label, as
   `commit-804833/commit-audit abx pruning-low c3 docs(audit-round): …`; the commit hook writes the
   label, so the log ties each fix to the commits it audited. Before the fix starts, the runner asks
   you once for every question the reviews leave. These are the winner of each such dispute on a
   finding whose highest grade is A or B, each referral no review disputes and each open choice the
   ruler states. [Stop and recovery](#stop-and-recovery) item 1 says how you answer. The fix starts
   with your answers. It stops for your ruling only on a decision it meets in its own work. The fix
   applies the ruler's winners without judging them again. Two revisions the rebuttal agrees with
   both do not stop the round; the fix picks one.
6. **Glance and watch.** After a finished plan round with findings, the glance decides from the
   commit record whether a trajectory watch is due, and a due watch writes its grade. The watch
   runs on the `watch` selection of the target work class's audit level in
   `tools/audit-round/settings.json`, so planning and implementation rounds may use different ones.
7. **Series decision.** In an automatic series the runner reads retained data and bounded commit
   evidence, then ends the series or names the next auditor without starting an assistant.

A clean audit skips the vet, rebuttal, ruler, fix, glance and watch. The runner lands its empty
`clean` record directly, once, in the sole judged repo or in Repo Edu when both repos were judged.
A commit audit's clean record opens with its series label, as
`commit-83bde0+3095d1/commit-audit obx clean: …`, so the log shows that the audit ran. It joins no
later round's commits, because it changes no file. An automatic series still applies its decision
rules.

### Series

1. **Automatic series**, without `--auditor`. Planning targets and plan-only commit targets use
   `planningAudit.auditors`. Implementation targets and any commit target with a Repo Edu group use
   `implementationAudit.auditors`. The `--first` selection opens; it must name an auditor from the
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
   after the current round wait in `../plan-evidence/active/<target>-queue.md`, which each round
   prints. Edit it at any time to add, remove or reorder entries; the runner reads it between
   rounds, and an empty or deleted file ends the series after the current round. A clean audit
   removes queued entries that resolve to the same assistant, model and effort.

A settle or ready answer ends the series and prints the `settle` or `ready` command to run; the
plan itself is left unchanged for your call. A commit series' later rounds read the original commits
plus the fixes landed so far. When a commit series completes, its files move to
`../plan-evidence/commits/<commit-label>/`, and a later audit of the same commits moves them back,
as [Find round outputs](/repo-edu/tooling/find-round-outputs/#what-remains) describes.

### Deferrals

Before an automatic implementation series, and again after each finished implementation-audit round,
the runner checks for an open deferral into the plan repo. When one exists and the series would
continue to its decision, it chains one planning round for those deferrals on the default entry
from `planningAudit.auditors`, including that entry's model and effort. That round does not count
against the series maximum. Each plan-scoped
implementation audit also receives the open deferrals into Repo Edu. Every automatic series ending
prints the remaining open deferrals or says there are none.

### Replay the rules

`pnpm audit-round replay` applies the same decision function to every retained automatic-series
answer. It prints the computed answer, stored answer and next round's findings, followed by ordinary
totals and the fixed Baseline totals. It reads each commit series where it lives, live or archived.
It starts no assistant and writes nothing. Use its output when
considering a change to the rules in `../plan/STOP-CONDITIONS.md`.

## Output

All files live in `../plan-evidence/active/`:

1. **Every round** claims `<target>-<round>-0-claim.md` and writes its transcript
   `<target>-<round>-1-round.<tag>.md` with a log beside it.
2. **The audit, vet, rebuttal and ruler** stay as `-2-audit`, `-3-vet`, `-4-rebut` and `-6-rule`
   files after the
   fix, a ruling or a clean audit, until the close moves them.
3. **A fix's own ruling**, on a decision the fix meets in its own work, adds
   `-7-ruling.<tag>.md`. The questions the runner asks before the fix add no file. **A due watch**
   adds `-9-watch.<tag>.md`.
4. **Round data** goes to `<stem>-plan-rounds.json` or `<stem>-impl-rounds.json` for a plan target
   and to `<commit-label>-rounds.json` for a commit target.
5. **A manual series** keeps `<target>-queue.md` until the close moves it.

A finished fix lands its local records only in the judged repos whose files took accepted findings.
A finding whose correction belongs outside the judged repo set is carried as a deferral record in
the sole judged repo. A repo gets no record just because it was judged. The target is
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

1. **The round needs your answer.** Before the fix starts, the runner asks once for every serious
   contest or split, every referral no review disputes and every open choice the ruler states. A
   fix asks again only for a decision it meets in its own work, in a ruling file. The terminal
   prints a notice and, on macOS, shows a dialog window that stays until you click OK. The notice
   names the round, the ruling file when there is one, the round's reports before a fix, the
   findings that need a winner or a choice, the winner words with the round's vetter tags, whether
   the fix uses the auditor's model, one vetter's model by its tag or neither, and the line to type
   in each app: `/ruling <stem>` in a Claude chat or `$ruling <stem>` in a Codex chat. The terminal
   reads no answer. For each serious contest or split you name `report`, the tags of the vetters
   that were right or `neither` with a one-line reason. For each referral or open choice you give
   your choice. Ctrl-C in the terminal keeps the round's files, prints the command that continues
   the round and ends the series. See [Answer a ruling](/repo-edu/tooling/answer-ruling/).
2. **A phase fails.** Fix the outside problem the failure names, then run the printed `Rerun:`
   command. It continues the stopped round on its kept reports and starts the first phase without
   one in a new session. A round that stopped in its audit kept no audit report, so the rerun opens
   a new round. See [Recover a run](/repo-edu/tooling/recover-run/).
3. **The watch grades the episode red.** The series stops before another round. Read the watch and
   act on it first.
4. **A fix changed the plan's phase.** The round finishes without a series decision and the series
   ends. Rerun against the plan's new phase.

A failure, an unanswered ruling, a red watch or a phase change also ends a scope list and names the
scopes that did not run.

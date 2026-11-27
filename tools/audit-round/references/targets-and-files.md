# Targets and round files

## Plan targets

`target.ts`, `default-target.ts` and `plan-steps.ts` resolve plan targets. The
[round grammar](../../../.agents/references/round-grammar.md#implementation-plan-step) owns the
parsed step form.

### Arguments

`round` takes an optional plan stem followed by its scope. `planTargetRequest` reads these
arguments. Every stem names a plan, including a stem that looks like a commit ID.

- A plan's scope is the word `plan` for its planning round, or step scopes in audit order. Each
  step scope is a step or an increasing range, and scopes are separated by commas or spaces as
  auditor entries are.
- `planningScope` is the one spelling of the word `plan`. It stands alone, because a planning
  round and a step series share nothing a list could sequence.
- Plan arguments drop `.md` and `-widen` and refuse paths with a stem example.
- `resolvePlan` accepts the active artifact in the active folder and reports an archived plan as
  unavailable for audit.
- `requiredActivePlan` accepts only the active artifact. It keeps path validation common, while
  `close`, `settle`, `ready` and `implement` supply their own reason when no active plan exists.

### No target

With no target, the runner selects the active artifact whose stem commit is newest across both
repos, and it skips plans without an active artifact. `stemCommits` merges the two histories by
date only for that choice. Options without a target take `defaultTarget`. `defaultPlan` applies
the same plan rule alone for the [plan](commands.md#plan) command and a `close` given no stem.

### A bare plan name

`default-target.ts` owns the round a plan argument or no target selects, so the plan's history
rather than a typed word decides between planning and implementation. It reads both histories. It
resolves the active plan before reading its step list, so a missing plan says so, and it supplies
the absolute plan path before any assistant starts.

The plan's first implementation-step list and joined stem history decide what a bare plan name
means:

- Before any step lands, it selects a planning audit, without reading the step list.
- After every listed share lands and each hosting repo's newest `implemented` marker is newer than
  its newest hosted step, it reads the fixed `Audit ranges:` sentence in **Execution and audits**.
  It selects each listed range in order and then the full range from step 1 through the last
  listed step. A sentence listing only the full range selects it once.
- Otherwise resolution stops and names the pending steps by repo and every missing or stale
  marker. The user may name a concrete step or range to audit before whole-plan completion.

After the first step lands, `plan-steps.ts` supplies the steps, hosts and audit ranges. Loose
subject reads find the hosted steps and newest marker in each repo's own Git order.

### Scopes

- The scope word `plan`, as in `pnpm audit-round round <stem> plan`, selects the planning audit
  whatever has landed. It is read before the landed-step check, so it reads neither history nor
  the step list. It continues the plan's `-plan-audit` round series and data file, so the round
  lands the ordinary `plan-audit` record. The **Ready marker** section of
  `../plan/.agents/references/lifecycle.md` explains when to use it.
- A concrete step scope selects an implementation audit and is refused before any step lands.
  Before starting its audit, the runner reads the step list to check the scope and find its hosts.
- A list of step scopes, as in `pnpm audit-round round <stem> 2,3-5,6-7`, selects one
  implementation audit per scope and runs an automatic series on each in list order, as typed.
  `resolveTargets` returns that ordered list, one target per scope, so every round still runs on
  one scope and keeps that scope's files, records and round data. The completed bare name uses
  the same path for the plan's listed ranges and its final full range.

### Where a range list starts

A finished implementation-audit record skips no range. A rerun after a stopped run goes on at the
range where the run stopped.

- That range is the one whose newest round, by the round folder's numbers as `roundRun` reads
  them, has an entry that `stoppedEarly` in `round-data.ts` reads as stopped. Of several such
  ranges it is the one whose round started last.
- The read takes the plan's round data once and no commit.
- The ranges before it are not audited again, because a restart does not redo finished work.
- An earlier range is not read again after a later range's fix changed its code. The full range
  that ends the list still reads every step's current code before the close.
- With no stopped round the list starts at its first range. A killed round leaves no entry, so its
  range holds no stopped round.

### The step list

`plan-steps.ts` reads the first ordered list below the depth-2 `Implementation plan` heading. It
requires each item to open with a bold title and one closed host sentence, then returns the steps
and their hosting repos in list order. It also reads the `Audit ranges:` sentence under the
depth-3 `Execution and audits` subsection and requires its scopes to tile the listed steps in
order.

### A planning round needs a committed plan

A new planning round is refused when `HEAD` of the plan checkout does not hold the plan file.
`lifecycle.ts` owns the check. `round` and the run's widening and detailing stages refuse before
any assistant starts, and the refusal names the missing `init` commit.

The audit report names the judged commit, and the fix lands the round's record after the plan's
`init`. Without the refusal, a plan no commit holds passes the audit, the vet and the rebuttal,
and the round then stalls in its fix on a ruling about the missing `init`.

## Commit targets

`round-commits` requires commit references. `commitTargetRequest` groups them by repository. Bare
references before the first `plan@` reference form the Repo Edu group, and that reference and every
reference after it form the plan group. Each request group keeps its repository and its references
as typed. `resolveTargets` returns a commit target as a list of one.

`default-target.ts` resolves the references:

- It captures each request group's starting HEAD once, before round files are allocated.
- It resolves every typed reference against that head, refuses a reference that names no commit
  and admits only an increasing inclusive range.
- It adds the ordered exact full commit set and the resolved short references the filename uses.
- Groups, references and endpoints resolve one at a time in typed order, so a refusal names the
  first bad reference and leaves no Git read running in a checkout.

The original exact groups own the label, under [Names](#names). Each audit phase group carries
those original commits beside its advancing exact set. Before each later round of a commit series,
`command.ts` builds each exact set from the original commits and the earlier landed fixes and
advances each repository head, while the label stays the original one. A clean record joins no set:
it changes no file, so the next auditor has nothing to read in it. The round data still keeps it
among its round's landed commits.

## Round files

`round-paths.ts` owns every round filename and order number. It also names the step transcript,
log and ruling and the close log. Round files live in the round folder.
Plans and their briefs stay in the plan checkout's `active/` folder; no code needs a plan and a
round file in one folder. The runner supplies every phase path. The evidence checkout is a Git
repository, and [Report lifecycle](#report-lifecycle) says when the runner commits it.

### Names

Round files use `<target>-<round>-<order>-<kind>.<tag>.<ext>`. Markdown documents use `.md`; the
transcript's log uses `.log`. Filenames carry no timestamp; each header records the round's start
time.

| Order | Kind | Files |
| --- | --- | --- |
| 0 | claim | Empty number reservation, no tag |
| 0 | settle, reopen | Empty plan phase-change markers, no tag |
| 1 | round | Transcript and log |
| 2 | audit | Audit report |
| 3 | vet | Vet report, one per vetter of the panel |
| 4 | rebut | Rebuttal report |
| 5 | fix | Reserved, no report |
| 6 | rule | Ruler report |
| 7 | ruling | Ruling |
| 8 | glance | Reserved, no report |
| 9 | watch | Watch |

Skipped phases leave gaps.

**Targets.**

- A plan audit target ends in `-plan-audit`. An implementation audit target ends in
  `-impl-audit-<a>..<b>`, with step and round numbers padded to at least two digits. A single step
  repeats its endpoint.
- Both targets use the commit role of their records, as step files use `impl-<n>`, so a sorted file
  list keeps a plan's step files, implementation audits and plan audits in three separate groups.
- A commit target opens with the fixed word `commit-`, so every commit audit sits together in a
  sorted file list as plan targets do under their stem.
- Each commit group's original ordered exact set owns its label: one commit uses its six-character
  ID and a longer set uses `<oldest>..<newest>`. The resolved set, never the typed spelling, names
  the file, so a range and its forward or reversed full list keep one label and round sequence.
  Group labels join with `+` in repository order.
- Later rounds of a commit series keep the original label, while the audit report's target names
  the advancing exact set.
- The same label opens every record the series' rounds land, under
  [After the fix](rounds.md#after-the-fix).

**Tags.**

- The claim, settle and reopen marker files, handoff, target-wide
  [queue](series.md#manual-queue), step transcript and log and [split log](commands.md#split) omit
  the tag. The plan doctrine owns the handoff's six-character commit name.
- Later phases preserve the audit report's target and round. Their tag names their own writer
  under Repo Edu's **Commit Capability Tag**, not the audit report's auditor.
- The transcript and its log use the auditor tag.
- The runner resolves every file-writing phase's tag before opening output.

**One plan's files.** `planRoundFile` says whether a file in the round folder belongs to one plan: a
claim, marker, phase file or queue of its plan or implementation audits, a step transcript, log or
ruling, a close log, a handoff or a yield report. Each form is read whole past the stem, never as a
bare `<stem>-` prefix, so a plan whose stem extends this one never matches. The plan's round data is
not among them, because the close archives it beside the plan.

**Split answers.** Designers share one number sequence per source. The next number follows the
highest saved answer filename. Each `<label>-design-<n>.<tag>.md` has at least two digits. A new
answer from the picker takes the next number. An unchanged answer keeps its name and text.
`<label>-pick-<n>.<tag>.md` holds a pick report. Its number is one higher than the
highest saved report number for the source, or 1 for the first report.
Report numbers and answer numbers count separately. Each report lists the answers it judged and
gives the number of any new answer from the picker.
`<label>-designs.json` records each writer and each designer's position and density. The runner
replaces this record by rename so an interrupted write preserves earlier entries. The plan list
keeps the selected number as `splits/<source stem>.<n>.mv.md`.

**Files under a label.** `seriesFile` matches a commit series' claim, phase files, queue, handoff
and round data. For a split it matches the numbered answers, pick reports, writer record and log.
It reads each name past the full label so a neighbouring label never matches. `seriesArchiveFolder`
names the folder under `commits/` or `splits/` of the evidence checkout.

### Numbers and claims

`round-paths.ts` scans the round folder for the next target-wide number. Round data does not
participate in numbered allocation. `newestRound` names the target's newest round, the highest
number a claim or phase file carries, because only that round may be continued. A marker file is
no round.

`roundRun` in `output.ts` gives every round its number and files, and a series and a chained round
both call it.

- A new round validates all file-writing phase tags before `run-files.ts` exclusively creates the
  tagless claim, then opens the transcript and log. The claim remains after success or failure,
  and a conflict stops without retrying.
- A continued round claims nothing, under [Stopped rounds](#stopped-rounds).

### Titles

A round's title opens with its kind and scope, such as `Plan audit of <plan>` or
`Implementation audit of <plan>, steps 1-6`.

- The title ends with the round's file number in brackets, as `(round 2)`, because the round's
  files, its round data and `disprove` are keyed by that number.
- A planning title first counts the round from the plan's latest settle or reopen marker file, as
  `(detailing round 3, file round 6)`. The marker file took a number of its own, so the file
  number alone does not say how far the current phase is. Before the first marker file both
  numbers are equal.
- A continued round's title counts from the latest marker before it.
- When an implementation audit series opens a planning round, the line below the title names the
  series' step or range and the number of deferred plan corrections the round will review. This
  explains why the series is running a plan audit.

### Round data

`round-data.ts` owns `<stem>-plan-rounds.json`, `<stem>-impl-rounds.json` and
`<commit-label>-rounds.json`. It owns their checked JSON schemas, the atomic replace-or-append
writer, the writer for later rulings, the read of one plan's existing round-kind files from one
selected active or archive folder and the commit-series readers. These are machine artifacts and
are never edited by hand.

**Files.**

- Each file is a checked object whose `rounds` list holds one time-ordered entry per round, keyed
  by target and round number.
- Plan files also hold the user's later rulings in a `disproved` list. Series files have none.
- A round on an active plan updates its file in the round folder, and loop-close moves the files
  beside the archived plan. Closed-plan data remains archive evidence.
- A commit series' file stays beside its round files and moves with them under
  [The series move](#the-series-move). The replay reads it in either place. Plan
  readers and the model read-out ignore it.

**A round entry** records:

- its state, resolved scope, landed commits and any series answer;
- its settings, with the round's `vetters` panel, the chosen auditor and its source, and the
  selection its audit launched on. The settings may hold the ruler's selection; entries written
  before the ruler existed carry none;
- each phase's measurements, including milliseconds, peak context and compactions, with the model
  and effort the tool reported and the launched selection the settings named. A vetter's vet phase
  entry also carries the vetter's tag, which links its reviews to its model and effort;
- its finding review and outcome data;
- which report results were stored, including each vetter's result separately;
- for a new automatic round, the ordered resolved auditor list used for its series answer;
- for a planning entry, the required `settling` field. It keeps the widening round's settling
  recommendation as it stands when the round ends. It comes from the fix result, or from the
  audit result on the direct clean route. Detailing entries use `""`;
- for a commit entry, its original groups, advancing groups and judged repos. Each advancing group
  keeps the references the round carried so a continued round can reuse its exact scope;
- for a chained planning round, the deferral list its audit judged, which marks the round as
  chained;
- for a plan-scoped implementation round, the deferral list into Repo Edu its audit received, an
  empty one included.

**A finding** holds one review per vetter of the panel: the vetter's tag, its verdict, its revised
tier and the rebuttal's answer to it.

- It keeps the audit report's ratings: the reach, the rarity and, beside a rarity other than
  `ordinary`, the harm level. A kept finding also keeps the record's tier, reach and rarity where a
  narrowing changed them, because those three set the commit subject's marks.
- An entry written before the rarity token keeps its old reach value and carries no rarity, harm or
  final rarity. The schema admits it and no reader converts it.
- A review records the verdict and any revised tier from the vet result.
- A finding with a contest or a split may also store its winner: `report`, `neither` or a list of
  vetter tags, with its reason and who named it, the user or the ruler. A user's winner also
  records whether the user's answer added a choice to it. A ruler's winner records whether it
  left a choice open. The runner asks for open choices again on a rerun.

**A later ruling** records its date and full reason in the `disproved` list. A detached entry
names the auditor's model and effort. An attached entry names its target, round and finding.
An implementation finding names the coder's model and effort and its tier. It belongs only in
implementation round data and names no retained audit finding.

| Attached entry | Meaning |
| --- | --- |
| `side: "finding"` or neither field | The finding was wrong. |
| `side: "vet"` | The finding stood as written. |
| `revision: "<tag>"` in place of `side` | The named vetter's revision was right. |

**Writes.** `RoundOutput` writes the settled findings as `in-progress` before later phases, then
replaces the entry with its final state. The writer checks the whole object and publishes a
complete replacement by temporary file rename.

### Step logs

Each started step writes `<stem>-impl-<step>-implement.md` and a matching `.log` in the round
folder. The transcript keeps the worker's commentary, ruling replies and closing note. The log
records prompts, tool calls and the result object. A worker that needs a ruling writes its question
to `<stem>-impl-<step>-implement-ruling.<tag>.md`.

A fresh worker starts both the transcript and log empty. A recovery appends to both and opens with
the session it resumes. Both filenames omit the tag so they stay the same if settings reclassify
the coder between runs.

## Stopped rounds

A round stopped early when its round data entry says `failed`, `interrupted` or `awaiting-ruling`.
`stoppedEarly` in `round-data.ts` owns which statuses mean a stopped round, for this rule and for
[where a range list starts](#where-a-range-list-starts).

### Which round continues

The command that opens a round on a target continues the target's newest round when that round
stopped early, stored an audit result, kept its audit report and is a
chained round exactly when the call is one. `roundRun` in `output.ts` is the one owner of the rule,
so `run`, `round`, a scope list and a chained round need no rule of their own.

- A round without a stored audit result opens a new round. This includes rounds stopped in
  their audit and rounds kept before structured results. The current settings and any
  `--first` or `--auditor` option apply to the new round.
- Only the newest round counts: a stopped round that a later round followed is never continued.
- A runner that is killed writes no entry, so its round is not continued either.
- A chained round's entry stores its deferral list, and a planning entry with that list marks the
  round as chained. A deferral list alone is no mark, because implementation rounds also receive
  and store the deferrals into Repo Edu.
- The kind match keeps a chained call from continuing an ordinary round whose audit report judged
  no deferral, which would close each deferral without an audit. When the kinds differ, the call
  opens a new round.

### What the continued round keeps

The continued round keeps its number, its audit report, its transcript and its log, which carry
the audit's tag. It claims nothing and reopens the transcript and log for appending. Its entry
keeps the stored start time, because its kept audit report read the code then, and the series
rules and the range a bare plan name starts at read that time.

`continuedSetup` takes from the stored entry what no report holds: the audit's launched selection,
the winners the user named, the commits the round landed and the deferral list of a chained or
plan-scoped implementation round.

- **Auditor.** The kept audit report fixes the auditor, so the audit and the rebuttal run on the
  selection the stored audit launched on.
- **Panel.** The panel is the current vetter list. A kept vet report counts for the listed vetter
  whose tag it carries and whose result is stored. Other listed vetters run.
- **Other phases.** A saved rebuttal result counts when its report and the reviews it answers are
  kept. A saved ruler result also needs the ruler report under its current tag.
- **Winners.** A saved winner counts while the reviews it judged still apply. The runner records
  when a winner has an open choice and asks the user again before the fix.
- **Deferrals.** The fix of a chained round or a plan-scoped implementation round receives the
  stored deferral list, an empty one included, because the fix must cite the deferrals the kept
  audit report judged. A deferral that opened during the stop waits for a later round whose audit
  report judges it.
- **Commits.** A commit round keeps the exact commits and references its kept audit report judged,
  because the call's target has moved on to the fixes landed since.

### Which phases run

The coordinator starts from the stored round entry. A report phase runs in a fresh session when
its result or report is missing. A planning round continues only in the same planning phase.
A hand edit to a report changes what a reader sees. Routing uses the stored results.
A continued round whose fix or clean completion already ended runs only what follows it.

### Auditor options on a rerun

An option that names an auditor, `--first` or `--auditor`, applies to the rounds after the
continued one. The series prints that it continues the round and on which auditor, and the auditor
the call chose waits: a `--first` selection opens the first round after it, and an `--auditor`
list's first entry returns to the head of the queue.

### The lines a stopped round prints

Every stopped round prints its `Session:` line and one `Rerun:` line that names the command that
continues it, whatever phase it stopped in, the watch included. `RoundOutput.recoveryText` picks
the line, and both the round's ending and the emergency ending print it.

- A resumed phase session cannot finish the round, because only the runner saves the reports and
  stores the entry, so no stopped round prints a `Resume:` line.
- The `Session:` line stays so the user can still open the stopped session and ask what went wrong.
- An audit that stops on a premise conflict is answered the same way: the user records the
  decision and types the command again, and the new round's audit reads the changed text.
- The close and an implementation step are no round phases and keep their own recovery, under
  [close](commands.md#close) and [implement](commands.md#implement).

The `Rerun:` line is the command the user typed, built from the parsed invocation:

- The full-plan command is `pnpm audit-round run <stem>`, and `round` keeps its typed target and
  options.
- `round-commits` names its original commits by their six-character IDs, with `plan@` before the
  plan group's first. A `HEAD` form typed again names other commits once `HEAD` has moved, and the
  stopped round would not be found.
- A `round` typed without a target names the resolved stem on a rerun because another plan may
  have gained the newest stem commit.

## Report lifecycle

The coordinator keeps every round file after a fix, failure, ruling or clean audit. Files stay
in the round folder until [the close](#the-close-move) or [the series move](#the-series-move).

`evidence.ts` owns the writes that change the evidence checkout: the evidence commit, the close move
and the series move.

### The evidence commit

The commit stages every uncommitted file in the evidence checkout and commits it under a plain
subject that names the runner command. It runs with hooks disabled and carries no capability tag
or model record, because nothing reads that log as a trajectory. `command.ts` calls it at two
moments, so every round file is in Git within one command of being written:

- Every command that may write a round file commits once it ends, after its run files close and
  whatever its outcome: the run, `round`, `round-commits`, `implement`, `close`, `mark`, `settle`,
  `disprove` and `split`. The other commands write nothing there, so a hand-run session's file waits
  for the next of these.
- Before each ruling wait, the shared wait commits too, because a further open decision replaces
  the ruling in the same file and the commit keeps every version.

The commit has these edges:

- A command refused for its arguments, exit code 2, wrote no round file and commits nothing. A
  test that drives the published entry with bad arguments therefore never commits the real
  checkout.
- A checkout with nothing staged gets no commit.
- A failure returns its reason instead of throwing, because the files stay in place and the next
  commit takes them. A failed commit prints one warning, on the round's output before a wait and
  on the error channel at the end, and leaves the command's exit code as it was.

### The close move

Loop-close moves every file of the closed plan that `planRoundFile` matches from the round folder
into the plan's own folder under `archive/` of the evidence checkout,
`plan-evidence/archive/<stem>/`, so the round folder lists live work only and the evidence root
lists only its groups. The stem names the folder whether the plan shipped or was aborted. The move
follows the round data's move beside the archived plan, under [close](commands.md#close), and a
close that finishes an earlier one moves the same way.

- A file of the same name there is replaced, because every earlier file is already in Git.
- The close log may still be open. A rename keeps its open handle on the moved file, so its last
  lines land there.
- The command's evidence commit takes the move.

### The series move

A completed commit series or split call moves out of the round folder, so the folder lists live
work only. `command.ts` moves commit series through `evidence.ts`. `split-output.ts` moves split
files through the same owner.

- **When.** A commit series completes when every requested round has run: an automatic `stop`
  answer or a manual queue that runs out after a finished round. A failure, an unanswered ruling and
  the round maximum with another auditor due leave it in the round folder. The series' ending keeps
  the maximum apart from completion, because both end the series without the user.
- **When, for a split.** Every result archives the split's files. A failed session leaves them in
  the round folder.
- **What.** `archiveSeries` moves the [files under a label](#round-files) into
  `commits/<label>/` for a commit series or `splits/<label>/` for a split. Each file keeps its name
  and contents. Renaming an open log keeps its handle valid, so the move's own line lands in the
  moved log. The command's evidence commit takes the move.
- **Rerun.** Before a series reads its history, picks an auditor, writes a queue or claims a round,
  `restoreSeries` moves any archived file of that label back and removes the emptied folder. The
  series then keeps its earlier fixes and its next number, and every later write uses the round
  folder. A split call restores before it opens its split log, because a log opened first would be
  replaced by the archived one.
- **A move cut short.** Each file moves by one rename, so it sits in exactly one folder at every
  moment. A rerun restores whatever the archive folder holds, so no file is lost and no number is
  claimed twice.
- The loose files directly in `commits/` are recovered evidence that no series owns.

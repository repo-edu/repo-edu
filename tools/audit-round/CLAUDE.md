# CLAUDE.md

Read [`glossaries/audit-round.md`](../../glossaries/audit-round.md) first: it defines the words
of the rounds and of this runner.

This is the private planning and implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers.

## Document layout

The runner's documentation is this file and the reference files in `references/`. Each fact is
stated once, in the section for the behaviour the fact belongs to. A section that needs a fact
from another section links to it and does not restate it, because a copy drifts from its owner.
Before this rule the file held the automatic-series rules in four places.

- This file holds the sections that other documents link to by name, and the commands:
  **Ownership**, **Plan targets**, **Round files**, **Phase routing**, **Stopped rounds**,
  **Report lifecycle**, **Commands** and **Invocation**. Keep each heading and keep its subject
  under it. Listed files are among the linking documents, and a change to a listed file that alters
  what a session does lands only inside a plan.
- A reference file holds one subject that no outside document links to by name. This file is
  loaded whole into every session that works on the runner, while a reference file costs only the
  work that needs it.
- [Ownership](#ownership) maps each file directly inside `src/` to the sections that describe it.
  It is the one such map: a reference file does not list its source files. Before changing a
  source file, read the sections its row names. A change to the runner updates the section for
  the behaviour it changes, and it adds a table row only for a new file.

| Reference | Subject |
| --- | --- |
| [Rounds](references/rounds.md) | One round's phase sequence, its report readers, the winner rule and a ruling's wait |
| [Series](references/series.md) | The automatic series and its fixed rules, scope lists, open deferrals and the manual queue |
| [Watch](references/watch.md) | The glance, the watch record and the episode evidence |
| [Sessions](references/sessions.md) | Who runs each phase, startup, prompts and one assistant invocation |
| [Commit hooks](references/commit-hooks.md) | The commit-message hook both repositories run |
| [Output](references/output.md) | The settings header, the status line, the log and the notices |
| [Model read-out](references/model-read-out.md) | The `models` command and its full-screen view |

## Ownership

| Files | Own | Described in |
| --- | --- | --- |
| `main.ts` | The process entry: the macOS sleep hold, the stop signals and the ruling dialog it supplies | [Invocation](#invocation), [Ruling wait](references/rounds.md#ruling-wait) |
| `command.ts` | The command grammar, startup and final reporting, the round sequence on a target with its counter and the split call's stage | [Commands](#commands), [split](#split), [Commit targets](#commit-targets), [The evidence commit](#the-evidence-commit), [The series move](#the-series-move), [Series](references/series.md#series), [Selections](references/sessions.md#selections), [Time readings](references/output.md#time-readings), [Full-screen view](references/model-read-out.md#full-screen-view) |
| `context.ts` | The installed Repo Edu checkout and its two sibling checkouts | [Invocation](#invocation) |
| `target.ts` | The argument grammar for rounds | [Plan targets](#plan-targets), [Commit targets](#commit-targets), [Clean audits](references/rounds.md#clean-audits), [Watch](references/watch.md#watch) |
| `default-target.ts` | The round a plan argument or no target selects, the resolution of commit references and the stage a run starts at | [Plan targets](#plan-targets), [Commit targets](#commit-targets), [The run](#the-run) |
| `plan-steps.ts` | The read of a plan's step list and audit ranges | [Plan targets](#plan-targets) |
| `round.ts` | The fixed phase sequence of a round, the questions the user answers before the fix, the reply a fix's open item needs, the watch that follows a round, the call of the series decision and the close's run | [Round sequence](references/rounds.md#round-sequence), [Winners and rulings](references/rounds.md#winners-and-rulings), [Watch](references/watch.md#watch), [Stopped rounds](#stopped-rounds), [close](#close) |
| `clean.ts` | Direct completion when the audit report has no findings | [Clean audits](references/rounds.md#clean-audits) |
| `report.ts`, `vet.ts`, `ruler-report.ts` | The readers of the audit report, the vet and rebuttal reports and the ruler report | [Report readers](references/rounds.md#report-readers) |
| `phase-result.ts` | The readers of the `PHASE RESULT` line, the watch grade line and the settling line | [Phase routing](#phase-routing), [One invocation](references/sessions.md#one-invocation), [After the fix](references/rounds.md#after-the-fix), [Watch](references/watch.md#watch) |
| `finding-tokens.ts` | The rating and location token definitions that the audit report reader, the record bullet reader and round data share | [Audit report](references/rounds.md#audit-report), [Record bullets](references/commit-hooks.md#record-bullets), [Round data](#round-data) |
| `phase.ts`, `settings.ts` | Who runs each phase and on what, the capability tag's vocabulary, workflow selection and the loaded settings | [Selections](references/sessions.md#selections), [Startup](references/sessions.md#startup), [Model settings](#model-settings), [Report readers](references/rounds.md#report-readers), [The ruler](references/rounds.md#the-ruler), [Manual queue](references/series.md#manual-queue), [Watch](references/watch.md#watch) |
| `judge.ts`, `replay.ts` | The automatic-series evidence, the three fixed rules and their replay | [Automatic series](references/series.md#automatic-series), [replay](#replay) |
| `queue.ts` | The shared entry splitter and the queue file's contents | [Manual queue](references/series.md#manual-queue) |
| `open-deferrals.ts` | One active plan's open deferrals | [Open deferrals](references/series.md#open-deferrals) |
| `glance.ts` | The rule that decides whether the watch is due, and the write of the cadence entry | [Watch](references/watch.md#watch) |
| `episode.ts`, `episode-log.ts`, `episode-facts.ts` | Episode membership and history facts for the glance and the watch evidence | [Episode evidence](references/watch.md#episode-evidence), [No target](#no-target) |
| `ruling-wait.ts` | A ruling's wait, the check of its answer and the ruling dialog | [Ruling wait](references/rounds.md#ruling-wait) |
| `round-paths.ts` | The file-name grammar, target names, round numbers and titles, the match of one plan's or one series' round files and the series archive folders | [Round files](#round-files), [Phase routing](#phase-routing), [The close move](#the-close-move), [The series move](#the-series-move), [Manual queue](references/series.md#manual-queue) |
| `round-data.ts` | The checked round-data schemas, readers and writers, the split rule and highest grade, and which statuses mean a stopped round | [Round data](#round-data), [Where a range list starts](#where-a-range-list-starts), [Stopped rounds](#stopped-rounds), [Winners and rulings](references/rounds.md#winners-and-rulings), [Ranges](references/model-read-out.md#ranges), [Vetter pairs](references/model-read-out.md#vetter-pairs) |
| `run-files.ts` | The exclusive creation of the claim and every required file write | [Numbers and claims](#numbers-and-claims), [Step logs](#step-logs), [Output](references/output.md) |
| `evidence.ts` | The writes that change the evidence checkout | [Report lifecycle](#report-lifecycle) |
| `lifecycle.ts` | The plan-file preflight and the Git operations for settle, ready, the `implemented` marker and the close's round-data commit, and the check that a planning round's plan is committed | [settle](#settle), [ready](#ready), [implement](#implement), [close](#close), [Plan targets](#plan-targets), [The run](#the-run) |
| `plan-links.ts` | The rewrite of the Markdown links that settle points at the plan's new name | [settle](#settle) |
| `implement.ts`, `implement-output.ts` | The implementation of plan steps and its logs | [implement](#implement), [Step logs](#step-logs) |
| `subject.ts`, `commit-msg.ts`, `commit-msg-main.ts`, `findings.ts`, `sequence.ts` | The commit subject reader, the record bullet reader and the commit hook's rule | [Commit hooks](references/commit-hooks.md#commit-hooks) |
| `listed-files.json` | Each repository's listed files | [Listed files](references/commit-hooks.md#listed-files) |
| `startup.ts`, `requests.ts` | The cache root, the update checks, release resolution, and every phase's arguments and prompt | [Phase routing](#phase-routing), [Assistant sessions](references/sessions.md#assistant-sessions), [Ruler report](references/rounds.md#ruler-report), [The watch record](references/watch.md#the-watch-record) |
| `assistant.ts`, `claude.ts`, `codex.ts`, `codex-session.ts`, `cli-process.ts` | One assistant invocation, its decoders and its child process | [Invocation](#invocation), [Assistant sessions](references/sessions.md#assistant-sessions) |
| `feedback.ts` | The selection, event, output and recorder types that the assistant sessions and the output share | [Selections](references/sessions.md#selections), [Startup](references/sessions.md#startup), [One invocation](references/sessions.md#one-invocation), [Recorder slots](references/output.md#recorder-slots), [Measurements](references/output.md#measurements) |
| `output.ts`, `run-clock.ts`, `terminal.ts`, `model-change.ts` | Terminal presentation, run recording, the number and files of every round, time readings and the model-change notice | [Output](references/output.md), [Where a range list starts](#where-a-range-list-starts), [Numbers and claims](#numbers-and-claims), [Round data](#round-data), [Stopped rounds](#stopped-rounds), [close](#close), [Full-screen view](references/model-read-out.md#full-screen-view) |
| `output-format.ts` | The text of the settings header, the time and token readings, the capability tag and the commit stamps | [Selections](references/sessions.md#selections), [Output](references/output.md), [The hook's rule](references/commit-hooks.md#the-hooks-rule) |
| `models.ts`, `model-evidence.ts`, `model-comparison.ts`, `pager.ts`, `pinned-headings.ts` | The model read-out and its full-screen view | [Model read-out](references/model-read-out.md) |
| `contract-main.ts`, `contract.ts` | The contract command's entry and the CLI contract recorder | [Contract recorder](#contract-recorder) |
| `move-list.ts`, `split-result.ts` | The reader of a move list, and the reader and writer of the split result line | [Move list](../../.agents/references/round-grammar.md#move-list), [Split result](../../.agents/references/round-grammar.md#split-result) |
| `split.ts`, `split-attempt.ts`, `split-output.ts` | One split call: the read of the file's move list, the split lock, the attempt in a child process, the write, the checks and the commit or the restore, and the design selection and log | [split](#split), [Phase routing](#phase-routing) |

Workflows own findings, authority, gates and phase outcomes. The shared protocol's
[Runner result](../../.agents/references/round-protocol.md#runner-result) rule defines the meaning
of a phase result, and a phase result carries only status and reason. The runner reads audit
reports, vet reports, rebuttal reports, ruler reports and the fix's landed subjects for routing and
completion checks, and it reads the log the glance counts. The automatic-series decision is runner
code and has no workflow or assistant selection.

Keep assistant adapters independent of the product LLM adapters.

## Plan targets

`target.ts`, `default-target.ts` and `plan-steps.ts` resolve plan targets. The
[round grammar](../../.agents/references/round-grammar.md#implementation-plan-step) owns the parsed
step form.

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
the same plan rule alone for the [plan](#plan) command and a `close` given no stem.

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

Once a step has landed, no unscoped invocation selects a planning audit. Each repository's own Git
order decides whether its marker follows its newest hosted step. For a bare plan once a step has
landed, `plan-steps.ts` supplies every listed step, hosting repo and audit range, and loose
subject reads find each hosted step, its repo's newest step and its newest `implemented` marker.

### Scopes

- The scope word `plan`, as in `pnpm audit-round round <stem> plan`, selects the planning audit
  whatever has landed. It is read before the landed-step check, so it reads neither history nor
  the step list. It continues the plan's `-plan-audit` round series and data file, so the round
  lands the ordinary `plan-audit` record. The plan doctrine's
  [Ready marker](../../../plan/CLAUDE.md#ready-marker) owns when the user reaches for it.
- A concrete step scope selects an implementation audit and is refused before any step lands. It
  returns after the landed-step check without reading the step list.
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

`round-paths.ts` owns every round filename and order number. It also names the step log, the step
ruling and the close log. Round files live in the round folder.
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
- Both targets use the commit role of their records, as step logs use `impl-<n>`, so a sorted file
  list keeps a plan's step logs, implementation audits and plan audits in three separate groups.
- A commit target opens with the fixed word `commit-`, so every commit audit sits together in a
  sorted file list as plan targets do under their stem.
- Each commit group's original ordered exact set owns its label: one commit uses its six-character
  ID and a longer set uses `<oldest>..<newest>`. The resolved set, never the typed spelling, names
  the file, so a range and its forward or reversed full list keep one label and round sequence.
  Group labels join with `+` in repository order.
- Later rounds of a commit series keep the original label, while the audit report's target names
  the advancing exact set.
- The same label opens every record the series' rounds land, under
  [After the fix](references/rounds.md#after-the-fix).

**Tags.**

- Six forms omit the tag: the claim, the settle and reopen marker files, the handoff, the
  target-wide [queue](references/series.md#manual-queue) and a move-list series' split log, under
  [split](#split). The plan doctrine owns the handoff's six-character commit name.
- Later phases preserve the audit report's target and round. Their tag names their own writer
  under Repo Edu's **Commit Capability Tag**, not the audit report's auditor.
- The transcript and its log use the auditor tag.
- The runner resolves every file-writing phase's tag before opening output.

**One plan's files.** `planRoundFile` says whether a file in the round folder belongs to one plan:
a claim, marker, phase file or queue of its plan or implementation audits, a step log or step
ruling, a close log, a handoff or a yield report. Each form is read whole past the stem, never as a
bare `<stem>-` prefix, so a plan whose stem extends this one never matches. The plan's round data
is not among them, because the close archives it beside the plan.

**One series' files.** `seriesFile` says whether a file belongs to one commit or move-list series:
a claim, phase file, queue or handoff under its label, a move-list series' split log, or its round
data. It reads each form whole
past the label in the same way, so a neighbouring label that extends this one never matches.
`seriesArchiveFolder` names the series' folder under `commits/` or `splits/` of the evidence
checkout.

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

### Round data

`round-data.ts` owns `<stem>-plan-rounds.json`, `<stem>-impl-rounds.json` and
`<commit-label>-rounds.json`. It owns their checked JSON schemas, the atomic replace-or-append
writer, the disproved-finding writer, the read of one plan's existing round-kind files from one
selected active or archive folder and the commit-series readers. These are machine artifacts and
are never edited by hand.

**Files.**

- Each file is a checked object whose `rounds` list holds one time-ordered entry per round, keyed
  by target and round number.
- Plan files also hold the user's later rulings in a `disproved` list. Series files have none.
- A round on an active plan updates its file in the round folder, and loop-close moves the files
  beside the archived plan. Closed-plan data remains archive evidence.
- A commit or move-list series' file stays beside its round files and moves with them under
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
- for a new automatic round, the ordered resolved auditor list used for its series answer;
- for a planning entry, the required `settling` field. It keeps the widening round's settling
  recommendation as it stands when the round ends: the fix's settling line, or the audit report's
  closing settling line when the clean audit ran no fix. Detailing entries use `""`;
- for a commit entry, its original groups, advancing groups and judged repos. Each advancing group
  keeps the references the round carried, because the audit report's `Target:` line repeats them
  and a continued round reads that report against them;
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
- A vet report reading carries each finding's audit report number, audit report tier, verdict and
  optional revised tier. A review records a revised tier only when its `Revise to [<tier>]` line
  differs from the audit report tier.
- A finding with a contest or a split may also store its winner: `report`, `neither` or a list of
  vetter tags, with its reason and who named it, the user or the ruler. A user's winner also
  records whether the user's answer added a choice to it, but never the choice itself.

**A disproved entry** records its date and full reason. It then records either its target, round
and finding numbers with the side the ruling disproves, or the manually named auditor model and
effort. An attached entry names whether the finding or its non-Accept vet verdicts were wrong. An
attached entry without that side predates the field and disproves the finding.

**Writes.** `RoundOutput` writes the settled findings as `in-progress` before later phases, then
replaces the entry with its final state. The writer checks the whole object and publishes a
complete replacement by temporary file rename.

### Step logs

The implement command retains one log and one possible ruling per step in the round folder, as
`<stem>-impl-<step>-implement.log` and `<stem>-impl-<step>-implement-ruling.<tag>.md`.
`implement-output.ts` names one log and one ruling path per step. These are round files but not
phase files, because no numbered
round writes them.

- The log name carries no tag. Settings may change the coder's tag between a failed run and its
  recovery, and the log opening already records the model.
- A fresh worker owns each step log and starts it empty.
- A recovery reopens the log for appending through `RunPaths.reopenLog`, the only append route in
  `run-files.ts`, and writes a new invocation opening before the resumed phase. The one log then
  shows the failed turn, the recovery and the later ending in order.

## Phase routing

`requests.ts` resolves every workflow header and supplies its listed files whole. Planning
sessions work in the plan checkout; implementation and commit sessions work in Repo Edu. Claude
receives the peer checkout and the evidence checkout as additional directories; recovery commands
restore the working directory.

`round-paths.ts` supplies each phase's absolute arguments in this order:

- design: the source file's path relative to the Repo Edu root and the blob hash the runner read
  before the session. The session returns its answer as text and writes no file, under
  [split](#split)
- audit: audit report output, then either a plan with an optional implementation
  scope and open-deferral object, a plan with an open-deferral object for a
  chained planning round, the move list's absolute path for a move-list round,
  or one structured object per commit group carrying
  its `repository`, its carried `references`, its starting HEAD as
  `startingHead`, its advancing exact commit set as `commits`, its original
  commit set as `originalCommits` and its resolved `shortReferences`
- vet: audit report input, vet report output; no vetter receives another vetter's vet report
- rebuttal: audit report input, every vet report input in panel order, rebuttal report output; each
  answer line names the vetter it answers by the tag in that vet report's input filename. The runner
  saves the rebuttal to the last argument
- rule: audit report input, every vet report input in panel order, the rebuttal report input,
  ruler report output and a findings object holding each contest and split on a C or D finding with
  its audit tier; the input separately carries the panel. The runner saves the ruler report to the
  argument before the findings object
- fix: audit report input, then every vet report input, an existing rebuttal report input and an
  existing ruler report input, followed by the same open-deferral object for a chained planning or
  plan-scoped implementation round, a contest object when the round holds a contest or split
  under the shared protocol's
  [Reconciliation](../../.agents/references/round-protocol.md#reconciliation) and a choice object
  when the user gave a choice. The contest object carries every contest and split with its winner
  and reason, the ruler's and the user's, because the runner asks before the fix starts. The fix
  child's `COMMIT_OPEN_CONTESTS` environment value carries the numbers that still lack winners. An
  empty value lifts the commit block.
- implement: plan, one-based step number, remaining hosting repo shares,
  resolved model release and launched effort; the ruling path is supplied
  separately and reused when the same worker resumes
- watch: no path arguments; the prompt separately supplies the evidence
- close: plan, capability tag, model record, open-deferral object and optional
  abort reason

The runner saves audit, vet, rebuttal and ruler final text without the parsed phase result line.
Report phases finish only when their supplied output exists and is non-empty. The runner then
reads the audit report under the round grammar and fails the round when the audit report's
`Target:` line does not repeat the target it supplied to the audit, before any later phase starts,
so a vetter never has to ask which target an audit report judged.

The watch has no path argument because the runner owns both of its writes, under
[Watch](references/watch.md#watch).

A fix or implementation worker receives its ruling path separately and reuses it when the same
session resumes. An implementation resume after a ruling carries the user's reply. One after a
failed worker carries the generic continuation and no reply. Neither carries a time value.

## Stopped rounds

A round stopped early when its round data entry says `failed`, `interrupted` or `awaiting-ruling`.
`stoppedEarly` in `round-data.ts` owns which statuses mean a stopped round, for this rule and for
[where a range list starts](#where-a-range-list-starts).

### Which round continues

The command that opens a round on a target continues the target's newest round when that round
stopped early, kept an audit report that reads as valid against the target it judged and is a
chained round exactly when the call is one. `roundRun` in `output.ts` is the one owner of the rule,
so `run`, `round`, a scope list and a chained round need no rule of their own.

- A round that stopped in its audit kept no audit report, so the call opens a new round, and
  `--first`, `--auditor` and the current settings apply to it.
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
  whose tag it carries, and a listed vetter without a valid report runs.
- **Other phases.** A kept rebuttal or ruler report counts under the tag the current settings give
  its phase. Every other phase still to run takes the current settings.
- **Winners.** A stored user winner stands only while the kept reports rebuild its finding as
  stored. A choice is not stored, so the runner asks for it again before the fix.
- **Deferrals.** The fix of a chained round or a plan-scoped implementation round receives the
  stored deferral list, an empty one included, because the fix must cite the deferrals the kept
  audit report judged. A deferral that opened during the stop waits for a later round whose audit
  report judges it.
- **Commits.** A commit round keeps the exact commits and references its kept audit report judged,
  because the call's target has moved on to the fixes landed since.

### Which phases run

The coordinator skips each phase whose kept report its reader admits and runs the first that has
none, so a new round is the case where nothing is kept. A kept report its reader refuses runs its
phase again. A continued round whose fix or clean completion already ended runs only what follows
it.

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
  [close](#close) and [implement](#implement).

The `Rerun:` line is the command the user typed, built from the parsed invocation:

- The full-plan command is `pnpm audit-round run <stem>`, and `round` keeps its typed target and
  options.
- `round-commits` names its original commits by their six-character IDs, with `plan@` before the
  plan group's first. A `HEAD` form typed again names other commits once `HEAD` has moved, and the
  stopped round would not be found.
- A `round` typed without a target names the resolved stem on a rerun because another plan may
  have gained the newest stem commit.

## Report lifecycle

Nothing deletes a round's files. The coordinator deletes no round file: a round's audit, vet,
rebuttal and ruler reports stay in the round folder after a finished fix, a failure, a ruling or a
clean audit, until the close moves them. A commit or move-list series has no close, so the completed
series moves
under [The series move](#the-series-move) instead.

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
follows the round data's move beside the archived plan, under [close](#close), and a close that
finishes an earlier one moves the same way.

- A file of the same name there is replaced, because every earlier file is already in Git.
- The close log may still be open. A rename keeps its open handle on the moved file, so its last
  lines land there.
- The command's evidence commit takes the move.

### The series move

A commit series or a move-list series that completes moves out of the round folder, so the round
folder lists live work only. `command.ts` asks `evidence.ts` for the move: after a commit series,
on the ending the series runner returns, and after a split call, on the call's outcome.

- **When.** A commit series completes when every requested round has run: an automatic `stop`
  answer or a manual queue that runs out after a finished round. A failure, an unanswered ruling and
  the round maximum with another auditor due leave it in the round folder. The series' ending keeps
  the maximum apart from completion, because both end the series without the user.
- **When, for a move-list series.** The move follows the split call, so the call's last lines land
  in the moved split log. The series stays in the round folder while it is live work: after a
  failed phase or an unanswered ruling, at the round maximum and when another call wrote the list
  first, whose rounds are that call's. Every other ending moves the label's files: a rules stop,
  whatever the split code then reports, a fix that withdrew the list and a call that ended before
  any round, such as a design that judged the file fine.
- **What.** `archiveSeries` moves every file that `seriesFile` matches for the series' label, round
  data, claims, logs, reports, rulings, handoffs and queue included, into `commits/<label>/` or
  `splits/<label>/` of the evidence checkout. Each file keeps its name and contents. The last
  round's log is still open, and a rename keeps its open handle, so the move's own line lands in the
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

## Commands

`command.ts` owns the command grammar, startup and final reporting.

- The first word selects a subcommand. `run` takes the plan stem so Commander can report an
  unknown command before checking its arguments or options.
- Options belong to their subcommand and follow its name. Each command's `-h` prints its help.
  A bare command line prints the top-level help.

| Command | Purpose | Help |
| --- | --- | --- |
| [`run`](#the-run) | Take an active plan from its current stage through its close | Listed |
| [`round`](#round) | Audit a plan or its steps | Listed |
| [`round-commits`](#commit-targets) | Audit a set of Git commits | Listed |
| [`settle`](#settle) | Record the user's settle call | Listed |
| [`ready`](#ready) | Record the user's ready call and assign the coder | Listed |
| [`implement`](#implement) | Implement the pending steps of a ready plan | Listed |
| [`close`](#close) | Close a plan's loop | Listed |
| [`split`](#split) | Split one source file by a move list that audit rounds judged | Listed |
| [`plan`](#plan) | Print the plan an omitted target selects | Listed |
| [`models`](references/model-read-out.md) | Print the model read-out | Listed |
| [`replay`](#replay) | Recompute the stored series answers | Listed |
| [`disprove`](#disprove) | Record a later ruling on a finding | Listed |
| [`mark`](#mark) | Claim a reopen marker file | Hidden |
| [`episode`](#episode) | Page the watch evidence view | Hidden |
| [`ruling`, `answer`](#ruling-and-answer) | Carry a ruling and its answer to a waiting run | Hidden |

Help lists the commands a user runs. The hand-run watch calls `episode`, the ruling chat calls
`ruling` and `answer`, and the reopen step calls `mark`, so help hides them.

### Model settings

Edit `tools/audit-round/settings.json` to change model selection for runs from
either checkout. Changes apply to the next invocation. This local file is
gitignored. It is JSON with comments: `//` and `/* */` comments and trailing
commas are allowed, so an alternative selection can stay commented out beside
the live one, and editors already open a file named `settings.json` that way.
When it is missing, the runner creates it from
[default-settings.json](default-settings.json), the version-controlled
defaults, as plain JSON. An invalid file stops the command with a validation
error and is left unchanged.

The file opens with `defaultAuditor` and `defaults`. Then it lists four fields
in the order a plan meets them: `planningAudit`, `coders`,
`implementationAudit` and `close`, for the planning audits, the
implementation, the implementation audits and then the close.
Each audit level lists its roles in the order a round runs them: `auditors`,
`vetters`, `ruler`, for planning `fixer`, and `watch`. `splitAudit` follows,
because a file split belongs to no plan, and lists its roles in the order a
split runs them: `designer`, `auditors`, `vetters`, `ruler` and `fixer`.
`maximumAutomaticRounds` and `strengthModels` close the file. The runner reads
the fields in any order.

- `defaultAuditor` selects which entry in the target work class's auditor list opens a series when
  neither `--auditor` nor `--first` is given and the retained data gives rule 3 no opener. `first`
  opens on the first entry. `random` picks one entry for each scope's series, so no listed auditor
  always takes the first look at a target; the round data still records that choice as
  settings-chosen.
- `defaults` names each assistant's default model and effort outright. A phase
  or list field that says `default` reads it, and `--auditor claude` or
  `--auditor codex` runs the audit on it. Neither CLI's own model configuration
  is ever read, so this file alone decides what every phase runs on.
- A `default` in a list field, in an audit level's `ruler`, in `planningAudit.fixer`, in an audit
  level's `watch` or in a `splitAudit` role resolves when the file loads. The auditor list, the
  `models` read-out, a fix and a ready marker therefore all name the resolved selection. A ready
  marker keeps the coder it recorded when `defaults` changes later.
- `planningAudit.auditors` and `implementationAudit.auditors` are non-empty ordered lists. Each
  entry names its assistant, a model and an effort, such as Claude Fable at high and Claude Opus at
  xhigh; either field may say `default`. An automatic series opens from the target work class's
  list and picks every later entry from that list. Planning targets and plan-only commit targets
  use `planningAudit.auditors`. Implementation targets and commit targets with any Repo Edu group
  use `implementationAudit.auditors`. Two models of one vendor are two entries, and each needs its
  own current read before the series ends. A `--first` selection must resolve to an entry in that
  target's list. A one-entry list runs every settings-chosen round in its class on that entry.
- `planningAudit.vetters` and `implementationAudit.vetters` are non-empty lists. Each entry names
  its assistant, model and effort, and either field may say `default`. Every entry of the target
  work class's list vets every audit report of that class, side by side and whoever audited, so a
  vetter may sit on an audit report from its own model and effort. A list refuses two entries with
  one capability tag, because the second vetter's vet report would overwrite the first's.
- `planningAudit.ruler` and `implementationAudit.ruler` each name the assistant, model and effort
  that judge the contests and splits on a C or D finding in a round of that work class. Either field
  may say `default`. The tracked default is Claude Fable at xhigh. The ruler is not compared with
  the auditor or the vetters, so it may share a selection with either. A file without a `ruler` in
  both levels is refused like any other invalid file.
- `planningAudit.fixer` names the assistant, model and effort that fix a planning round or a
  plan-only commit audit. Either field may say `default`. `implementationAudit` has no fixer field,
  because a coder fixes its rounds.
- `coders` is a non-empty ordered list of coders. It sits at the top level, under neither
  `planningAudit` nor `implementationAudit`, because two workflows use it: the plan's coder writes
  every step and every implementation-audit fix of the plan. Each coder
  names its assistant, model and effort, and either field may say `default`.
  `ready` gives each new plan the coder that follows the one recorded in the
  most recent ready marker. After the last coder it starts again at the first.
  With no earlier coder to follow, or one no longer in the list, it takes the
  first coder. A one-entry list always selects that coder.
- `planningAudit.watch` and `implementationAudit.watch` each name the assistant, model and effort
  that write the watch after a round of that work class. Either field may say `default`. The watch
  sits in the audit level because it follows that level's rounds, so each work class can run its
  watch on its own selection.
- `splitAudit` names the roles of a file split, the split work class. `designer` runs the design
  session under the [design workflow](../../.agents/skills/design/references/workflow.md).
  `auditors`, `vetters`, `ruler` and `fixer` fill the roles of a move-list round that the fields of
  those names fill in the other levels, and the vetter list refuses two entries with one tag as
  theirs do. Each field may say `default`. The tracked defaults hold one auditor and two vetters:
  the design session is the file's first reader and one auditor adds a second, and two vetters are
  the fewest that can disagree. The level has no `watch`, because a move-list series runs none. A
  file without the level, or a level without one of its five roles, is refused like any other
  invalid file.
- `close` names the assistant, model and effort of the loop-close. Each field names a value or says
  `default`; `null` is refused. A named model must suit the selected CLI. It sits at the top level,
  under neither audit level, because the close belongs to no round. The old `planning` and
  `implementation` levels and the old `phases` level are refused like any other invalid file;
  rewrite it or delete it to regenerate the defaults.
- `maximumAutomaticRounds` limits an active plan or commit target's automatic series, counting
  its first round.
- `strengthModels` maps each assistant's base and top tiers to a model name.
  The same names classify reported models for capability tags. A family alias
  such as `opus` follows the CLI's current release; a full model name pins it.
  The settings header shows the release either one resolves to.
- Rebuttal shares the audit's selection. The watch of each work class and the close each select
  their assistant, whoever audited.
- The audit target picks the work class and the fixer, even when an implementation audit also
  fixes stale plan text. A planning round, before or after
  `ready` and including one chained for a plan-bound deferral, fixes on
  `planningAudit.fixer`, because it edits the plan rather than code and its fix
  enters no coder evidence. An implementation target fixes on the plan's ready
  assignment. A commit target whose groups are all in the plan repo fixes on
  `planningAudit.fixer`; one with a Repo Edu group fixes on the first coder,
  because its correction may change code and it has no ready assignment. An
  implementation target without an assignment also takes the first coder.
- The names `claude` and `codex`, given to `--auditor` or `--first`, run the audit and rebuttal on
  that assistant's `defaults`. Letter tags name a tier from `strengthModels` and an effort; a field
  a tag omits reads that assistant's `defaults`. Each `--auditor` entry selects its own settings
  independently, and other phases keep their configured selections.

Tests supply an independent configuration through `configured-runner.ts` and
`fixtures/settings.json`. Neither changes to the local file nor changes to
the built-in defaults change the test inputs. Settings tests cover loading,
generation and validation separately.

### Invocation

Run from either checkout with authenticated `claude` and `codex` commands available and the
evidence checkout `plan-evidence` beside both, a Git repository holding its `active/` round folder.
Terminal Markdown rendering is bundled with the runner and needs no separate executable;
[Output](references/output.md#terminal-rendering) describes it, colour included.

**Checkouts.** `context.ts` resolves the installed Repo Edu checkout and its two siblings: the plan
checkout with its `active/` folder, which holds every active plan and its briefs, and the evidence
checkout with its round folder. A missing evidence checkout or round folder fails that resolution,
so no command runs without it. It reads no invoking directory and carries no round kind.

**Sleep.** On macOS `main.ts` starts `caffeinate -i -w <runner pid>` before any command runs,
because an unattended run otherwise stops once the display sleeps on battery and no app holds the
Mac awake. The hold ends with the runner process however it exits. A failed start prints one
warning and the command continues. Linux takes no hold.

**Stopping.** Ctrl-C, a closed terminal and a termination request stop the run alike.

- `main.ts` aborts the run as `Interrupted` on the interrupt, hang-up and termination signals.
  `cli-process.ts` cancels its child on the same signals, because the child shares the terminal's
  process group and may exit successfully on them.
- The round then stops its phase's process, confirms it gone and writes its entry as
  `interrupted`, so a closed terminal leaves the entry that Ctrl-C leaves.
- A failed write to standard output or standard error also aborts the run. A closed terminal fails
  both, so both carry a listener for the process's whole life: an unobserved failure would end the
  process before its ending lands.
- A runner that is killed writes no entry.

**From a chat.** A chat's sandbox refuses Unix sockets, which `ruling` and `answer` open. The
ruling chat runs each as the bare `pnpm audit-round ruling [target]` or
`pnpm audit-round answer <target> <file>`, and each app lets it run outside the sandbox its own way:

- **Claude.** The user's Claude Code settings list `pnpm audit-round ruling`,
  `pnpm audit-round ruling *` and `pnpm audit-round answer *` under `sandbox.excludedCommands`.
  Without those entries both commands fail inside the sandbox with an `EPERM` error. The chat then
  says so, names the three entries and stops. It does not retry inside the sandbox, because there
  both commands fail with `EPERM` every time.
- **Codex.** The commands run under Codex's command permissions. When the sandbox blocks one, the
  chat requests permission for that command. When access is refused, it reports the permission
  error and stops.

```bash
pnpm audit-round round example 1-3
pnpm audit-round round example 2,3-5,6-7
pnpm audit-round round example 3 --auditor a -v
pnpm audit-round round example 3 --auditor atx
pnpm audit-round round task-modifier 1-4 --auditor claude
pnpm audit-round round task-modifier --auditor codex
pnpm audit-round round example plan --auditor claude
pnpm audit-round round example 3 --auditor codex,claude,claude
pnpm audit-round round example 3 --auditor "atx, obm"
pnpm audit-round round example 1-4 --first codex
pnpm audit-round round example 3 --no-watch
pnpm audit-round round-commits HEAD-1
pnpm audit-round round-commits HEAD-2..HEAD
pnpm audit-round round-commits HEAD plan@HEAD
pnpm audit-round round --auditor codex
pnpm audit-round models
pnpm audit-round models --all
pnpm audit-round replay
pnpm audit-round disprove example example-plan-audit 2 1 "The claim did not hold."
pnpm audit-round disprove example example-plan-audit 2 1 --vet "The vet verdict did not hold."
pnpm audit-round disprove example example-plan-audit --by "gpt-5.6-sol xhigh" "The finding predates the data."
pnpm audit-round plan
pnpm audit-round settle example
pnpm audit-round settle
pnpm audit-round ready example
pnpm audit-round ready
pnpm audit-round implement example
pnpm audit-round implement example 2-4
pnpm audit-round close example
pnpm audit-round close
pnpm audit-round close example --aborted "The check cost more than it gave."
pnpm audit-round split packages/domain/src/roster.ts
pnpm audit-round split packages/domain/src/roster.ts -v
pnpm audit-round run example
pnpm audit-round run example -v
pnpm audit-round mark reopen
pnpm audit-round episode example --lines 1-200
pnpm audit-round episode HEAD-2 --lines 201-400
pnpm audit-round ruling
pnpm audit-round ruling example
pnpm audit-round answer example answer.json
pnpm audit-round:contract
pnpm audit-round:contract codex
```

### round

`round` audits a plan document or its steps. `round-commits` audits Git commits.
Both commands use the same round sequence.

- [Plan targets](#plan-targets) and [Commit targets](#commit-targets) for what the target selects.
- [Series](references/series.md#series) for `--auditor`, `--first` and the rounds that follow the
  first.
- [Watch](references/watch.md#watch) for `--no-watch`.
- [Stopped rounds](#stopped-rounds) for a rerun.

### The run

`run <stem> [-v] [--resume <step>:<session-id>]` takes an active plan from the
stage its state calls for through its close. Invoking it is the user's settle, ready and close
call, given in advance.

`lifecycleStage` in `default-target.ts` reads the stage the run starts at, from the same state a
[bare plan name](#a-bare-plan-name) reads:

| Plan state | Stage |
| --- | --- |
| A `-widen` filename | The widening series |
| A settled plan whose plan-repo stem commits hold no `ready` record | The detailing series |
| A ready plan with a pending share or a missing or stale marker | The implementation |
| An implemented plan | The audit range series, which the close follows |
| An implemented plan whose full step range has settled | The close |

The full step range has settled once the newest round on it carries a runner stop and no
file-changing stem commit in either repo has landed since that round started, other than the
round's own. That stop judged every step's current code, so the listed ranges have nothing left to
read, and empty clean records change no code. Without the check, a rerun after a finished range
series audits every range again before the close.

The run resolves its named active plan and its stage before startup, then reads settings and
releases once. It calls the stage functions the single commands use, in lifecycle order: the
series, `settlePlan`, the series, `readyPlan`, the implementation, the range series and the close.

- The run settles on the runner's widening `settle` answer, marks the plan ready on the runner's
  detailing `ready` answer and closes after a range series that ended without needing the user. It
  uses the same lifecycle functions and commit forms as `settle`, `ready` and `close`.
- After `settlePlan` or `readyPlan` the run reads the next stage through `lifecycleStage`, because
  a plan reopened after its ready marker keeps the marker and goes on to the implementation or the
  range series.
- Every other ending, a refused lifecycle call included, ends the run with the stage's own lines
  and recovery command.
- Each stage keeps its own files, logs and printed lines. The run adds one line per stage start
  and one ending line naming the stage it ended in, the stages it completed and that a rerun
  continues from the plan's state.
- Running the same command again continues from where the plan stands; no run file or cursor
  keeps a second copy of that state. In the audit range series it goes on at the range where the
  run stopped, under [Where a range list starts](#where-a-range-list-starts).

The run takes `-v`, the implementation recovery option `--resume` and no round option, so every
series it opens starts with the ordinary opener and runs the glance and the watch. A resumed
session attaches only when the run starts in the implementation; a run starting in another stage
says the session stays unused. A user who wants another opener, no watch or a read between stages
runs the stage commands.

### settle

`settle [stem]` takes an active widening plan, or the plan `plan` prints when no stem is named. It
runs only the lifecycle Git owner: it loads no settings and starts no assistant.

`lifecycle.ts` owns the plan-file preflight and the Git operations for the user's `settle` and
`ready` calls, whether the commands or the run record them. Both keep the plan checkout's normal
hooks enabled.

1. It refuses any current filename other than a widening one, and a target plan with untracked,
   staged or unstaged changes. Unrelated work in the plan checkout remains untouched.
2. It points every link to the widening name in the plan checkout's other Markdown files outside
   `archive/` that Git does not ignore at the bare name. That is the set the repo-wide
   `rumdl fmt .` checks, and nothing else repairs a link in another file. A link whose whole text
   is the old file name takes the new name as its text too. The plan's own text stays as it is.
3. It renames the plan onto its bare name and commits the rename and the rewrites of files HEAD
   held as they stood, as `<stem>/settle: settle the plan's shape`. A rewrite in a file with
   other uncommitted changes stays uncommitted beside them, because Git commits a whole file. It
   prints those files after the commit.
4. It then claims and prints the empty settle marker file beside the commit.

### ready

`ready [stem]` takes an active settled plan through the same resolution and plan-file preflight
as `settle`. It reads settings but starts no assistant process or release lookup.

- It refuses a widening plan and a stem whose history already carries a ready marker.
- It validates the committed plan's steps and audit ranges.
- It advances through `coders`, after the newest earlier assigned ready marker, as the `coders`
  field under [Model settings](#model-settings) states.
- It records the assigned coder in the body of
  `<stem>/ready: declare the plan ready for implementation`. The commit is empty and preserves
  unrelated staged work, through the `git commit --only --allow-empty` route it shares with
  [direct clean completion](references/rounds.md#clean-audits).

### implement

`implement <stem> [scope] [-v] [--resume <step>:<session-id>]` requires an active plan with an
assigned `ready` marker, checked before assistant startup. `implement.ts` owns that gate, the
optional step scope, the per-repo landed-share scan and the sequential worker loop.

- It parses the plan's implementation steps and scans each hosting repo's log independently. It
  reuses the per-repo progress reader of [Plan targets](#plan-targets) without applying bare-plan
  audit selection.
- It starts one fresh worker per selected step that still has a missing share, in step order, on
  the assigned coder's resolved release and effort. `implement-output.ts` resolves the assigned
  coder's release, effort, tag and model record once.
- It verifies the landed share subjects after each worker before continuing.
- A ruling reply resumes only that worker, without adding a time argument.
- A failed worker, an unanswered ruling or a missing landed share stops before the next step and
  retains its recovery session.
- After the loop, each hosting repo with every share landed receives its current `implemented`
  marker, which the runner writes through `lifecycle.ts`. The marker carries the assigned coder's
  resolved model record and capability tag.
- The command retains one log per started step, under [Step logs](#step-logs).

**Recovery.** No recovery file exists, and the runner never retries a failed worker on its own.

- A failed worker or missing landed share with a known session prints the entry that owned the
  worker, with `--resume <step>:<session-id>` naming the step and its session. That entry is
  `pnpm audit-round implement <stem> [scope]` or `pnpm audit-round run <stem>`, with `-v`
  when it was typed.
- A failure without a session prints no runner command, and the ordinary rerun remains.
- An unanswered ruling prints the worker's assistant recovery command instead: the user answers in
  that session and reruns the runner.
- The printed command reads Git first and resumes the session with the generic continuation, on
  the same coder and release a fresh worker would get.
- A recovery binds at most one resumed session to the step it served. It uses the session only
  while Git shows that step selected and with a pending share. Otherwise it says the session stays
  unused.
- Fresh workers then take the remaining pending steps, and the entry continues as typed.

### close

`close [stem]` closes a plan's loop under the plan repo's
[loop-close workflow](../../../plan/.agents/skills/close/references/workflow.md). It is the one
entry to loop-close; the home `/close` and `$close` launchers run it. `runClose` in `round.ts`
runs the loop-close phase alone, on the `close` settings and with its own log.

**What it takes.**

- It takes an active plan's stem, or the plan `plan` prints when none is named.
- Without `--aborted` it refuses a plan whose stem scan holds no `ready` marker, before any
  assistant starts, because the unmarked archive form records shipped work.
- `--aborted <reason>` archives an episode that never shipped and passes the reason for its
  README.
- An archived plan is refused as already closed, unless it left files behind as described below.

**The session.**

- The runner resolves the plan's open deferrals before assistant startup. It passes them in the
  phase arguments with the active plan, the capability tag and model record the session's commits
  carry and any abort reason. The close's run yields that tag and model record.
- One session moves the plan, rewrites the links to it and writes each repo's `closed` commit. It
  deletes nothing. It works in the plan checkout and writes only `<stem>-close.<tag>.log` beside
  the round folder's other runner files.
- Where the close would need the user's answer, including permission to archive with an open
  deferral, it fails with the question. `RoundOutput.recoveryText` prints the assistant recovery
  command of a failed close, and that command continues the session.

**After the session.**

1. A finished close that left its plan in the active folder fails, because the move is the close.
2. The runner itself moves the plan's round-data files beside the archived plan and commits them
   through `lifecycle.ts`, as a second `<stem>/closed` record with the same tag and model record.
   The session does not move them, because the runner cannot see whether a session remembered
   them. The commit finds the one archived plan with the stem, moves each existing round-data file
   from the round folder into its folder with a plain rename and commits only those paths. No
   archived plan, or more than one, fails the close. A plan with no round data commits nothing.
   The printed `Committed` line names that commit.
3. The runner then moves the plan's other round files under
   [The close move](#the-close-move) and prints how many it moved. An aborted close moves the same
   files.

**Leftover files.** A close named for a plan already under `archive/` whose round data or round
files still sit in the round folder does only those moves and starts no session. A resumed close
session moved the plan without the runner there, so the rerun finishes the close. It stamps the
round-data commit from the close selection alone.

### split

`split <path> [-v]` splits one source file by its move list, or says why no split happens.
`runSplit` in `split.ts` owns the call, and `command.ts` supplies its design session, its series,
its attempt and its checks. The round grammar's
[Move list](../../.agents/references/round-grammar.md#move-list) and
[Split result](../../.agents/references/round-grammar.md#split-result) own the two forms the call
reads and writes.

**What it takes.** A path relative to the Repo Edu root that names a file inside one workspace
package under `apps/`, `packages/` or `tools/`, because that package's tests prove the split.
`splitSource` in `target.ts` refuses any other path before startup.

**The list.** The call reads the source's blob hash, as `git hash-object` prints it, and the
file's move list, `moveListFile`, as the plan checkout's HEAD holds it. The series rules date every
read by commits, so only committed text has rounds behind it. The call reports, tries and carries
out no other text, and the series reads the committed list after each round too.

1. A list that names the current content is not designed again. A withdrawn list gives the result
   it records, without a session. A list of moves goes to the early attempt and then to the rounds.
2. Otherwise the design session runs on `splitAudit.designer` under the
   [design workflow](../../.agents/skills/design/references/workflow.md). Its answer must be a move
   list that names the same source and hash. An answer of fine or needs a plan ends the call with
   that result and writes no list.
3. Under the split lock the call then looks again for a list that names the current content. When
   another call wrote one meanwhile, it drops its own design and ends as skipped. It also ends as
   skipped when the list's path has uncommitted changes, which the write would overwrite. Otherwise
   it tries the designed list, writes it and commits it alone in the plan repo, in the subject
   grammar's design form.

**The rounds.** When a listed auditor of `splitAudit` lacks a current read of the list,
`missingReads` in `judge.ts` says so and an automatic move-list series runs, under
[Move-list series](references/series.md#move-list-series). With every read current no round runs,
so a list whose split was skipped or whose checks failed is carried out on a later call without
another round. After each finished round that changed the list, the call tries the changed list
before the series decides; a refusal or a changed source halts the series.

An uncommitted change beside a committed list for the current content does not stop the rounds. A
stopped fix leaves its change so, and the series continues that round, whose fix reads the change
and commits it.

**The split.** Under the split lock the call ends as skipped when the move list has uncommitted
changes, because a round reads the list in the plan checkout and may have judged that text in place
of the committed list. It then tries the list once more, asks Git for uncommitted changes in the
attempt's file set, keeps each file's text and writes the files. Outside the lock it runs
`pnpm check` and then `pnpm test <package>`.

- Both pass: the call commits exactly the file set in the subject grammar's split form. Code
  writes its sentence and its body from the list: the model record, the list's path and one bullet
  per target with its responsibility.
- Either fails: the call puts every file back under the lock, removing the ones it created, and
  reports the failed command with its whole output. An interrupted check puts the files back too.

**The lock.** `withSplitLock` takes a `proper-lockfile` lock at `audit-round-split.lock` in the Repo
Edu checkout's Git folder, and a second call waits for it. A killed holder's lock is stale after 10
seconds. The lock covers each attempt, the design commit beside its attempt, the uncommitted check
with the write, and the restore. The rounds, the checks, the tests and the split commit hold none.

**The attempt.** `split-attempt.ts` runs the statement move tool's `list` command in a child process
and reads its reply. The attempt builds a TypeScript 6 project before and after each move, which
blocks a process for seconds. In a child process the runner's event loop stays free, so the lock's
refresh timer keeps running and no waiting call takes the lock as stale.

**Endings.** A call with a result prints its `SPLIT RESULT:` line last and exits 0.

| Ending | Result |
| --- | --- |
| The split committed | `made` |
| The design or a withdrawn list judged the file fine | `fine` |
| The design or a withdrawn list judged that it needs a plan, a move was refused or the rounds reached their maximum | `needs-plan` |
| The source changed, a file to write had uncommitted changes, the move list had uncommitted changes or another call wrote the list first | `skipped` |
| A check or the package's tests failed | `checks-failed` |

A failed design session prints its reason, its `Session:` line and a `Rerun:` line naming the same
command, and exits 1. A stopped round prints its own ending and the `Rerun:` line, which names the
split command, under [Stopped rounds](#stopped-rounds).

**The split log.** Each call appends to `<label>-split.log` in the round folder: its opening, the
design session, each attempt, the write, the checks, the commits and the result. The log carries no
tag, because settings may change the designer between calls and each opening records the model.
The rounds keep their own files, and every file of the label moves under
[The series move](#the-series-move).

**Stamps.** The design commit and the split commit carry the capability tag and model record of the
design selection, which `split-output.ts` resolves once per call. The runner sets no round stamps
on them, so their own record stands.

### plan

`plan` prints the plan an omitted target selects, as its absolute path, and writes nothing, so a
user can see it before a round or a close takes it. The home `/brief-plan` runs `plan` for an
omitted stem.

### replay

`replay` reads every active and archived plan's retained round data and every commit-series and
move-list series file, live in the round folder or archived in its own folder under `commits/` or
`splits/`. Each series' file sits in one of the two places, so its answers count once, and the loose
recovered files directly in `commits/` stay out. It starts no assistant and writes nothing.

- It applies the automatic-series decision function of `judge.ts` to each stored answer.
  `replay.ts` reads each answer stored without an auditor list as the assistant-keyed rules that
  produced it.
- It prints the computed answer, the stored answer, the next round's findings and whether the row
  is in the fixed corpus.
- Its ordinary totals cover every stored answer and count commit series and move-list series each
  as their own phase.
- Its fixed Baseline totals exclude both kinds of series and use plan entries started before
  `2026-11-08T18:53:13Z`, with the historical auditor list fixed by the deterministic-judge plan.

### disprove

`disprove` records the user's later ruling on a finding in one active or archived plan's round
data. It writes through the shared atomic writer, starts no assistant and reads no settings.

- `disprove <stem> <target> <round> <finding> <reason>` resolves a finding in the plan's checked
  round data and writes the user's date and full reason. A rerun on the same target, round and
  finding replaces that entry, including a ruling in the other direction.
- Adding `--vet` before the reason records that the non-Accept vet verdicts were wrong and the
  finding stood instead. It requires at least one non-Accept vet verdict on the attached finding,
  so it is refused for a finding every vetter accepted. It is also refused beside `--by`.
- `disprove <stem> <target> --by "<model> <effort>" <reason>` records a finding that retained
  round data does not hold, under the manually named auditor. It creates the round-kind file when
  it does not exist. Each such ruling appends, because two unrecorded findings by one auditor may
  both be real.

An active plan's file in the round folder stays there until loop-close moves it. An archived
plan's file is committed alone, as the tag-free `<stem>/disprove:` form with the reason as its
body. An attached vet ruling names `vet finding` in that subject.

### mark

`mark reopen [stem]` claims the next plan-round number of an active plan, or of the plan `plan`
prints when none is named. It writes the empty `<stem>-plan-audit-<round>-0-reopen.md` in the
round folder and prints its path. The marker file takes a number so a file list shows where the
reopen fell among the rounds. The shared planning rules'
[Round completion](../../../plan/.agents/references/planning-rules.md#round-completion) own when
the reopen marker is written. The command loads no settings, resolves no release and starts no
assistant.

### episode

`episode [stem-or-commit] --lines <start>-<end>` prints one one-based inclusive line range from
the current view of the [episode evidence](references/watch.md#episode-evidence).

- It resolves the target before reading the range. Omission selects the newest topic: the newest
  stem commit across both histories by commit date. A commit is an explicit anchor in whichever
  repo holds its SHA, and the peer keeps its own anchor. HEAD forms mean Repo Edu.
- The first line states the returned range and the view's current total line count, on every
  call. An out-of-range request reports `none` and returns no evidence lines.
- Each call reads both histories and the current round data again.
- It resolves no release, starts no assistant and writes no file, cache entry or snapshot.

### ruling and answer

`ruling [target]` and `answer [target] <file>` are the ruling chat's two carriers to a run that
waits for a ruling, under [Ruling wait](references/rounds.md#ruling-wait). Both start no assistant,
read no settings and write no file.

- `ruling` prints what the waiting run asks and the answer form.
- `answer` carries one JSON answer document to the waiting run, prints the waiting run's response
  and exits 1 on a refusal.
- With no target they take the one run that waits and refuse when none or several wait.
- The chat follows [Answering a ruling](../../.agents/skills/fix/references/answer.md). Its
  launchers live in the plan checkout: Claude's `/ruling` at `home/claude/commands/ruling.md` and
  Codex's `$ruling` at `home/agents/skills/ruling/SKILL.md`. The waiting run's notice and dialog
  name both, so the user picks the app whatever model runs the fix or worker.
- [Invocation](#invocation) says how each app runs both commands outside a chat's sandbox.

### Contract recorder

`pnpm audit-round:contract` runs `contract-main.ts`, which calls the recorder in `contract.ts`.
The recorder invokes the same assistant and output boundaries as a round, with a probe prompt on
the built-in default selection.

- It requires successful and deliberately failed shell calls before replacing any selected
  fixtures.
- The Claude probe also ends a turn on a background command and the recorder requires that second
  turn, so the recording pins one result per turn.
- A second probe resumes the first session and requires token usage from both invocations.
- It invokes no workflow and refreshes only this package's recordings.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use child processes and the recordings under
`src/__tests__/fixtures`. Ordinary tests make no live model calls.

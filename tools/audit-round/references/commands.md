# Commands

`command.ts` owns the command grammar, startup and final reporting.

- The first word selects a subcommand. `run` takes the plan stem so Commander can report an
  unknown command before checking its arguments or options.
- Options belong to their subcommand and follow its name. Each command's `-h` prints its help.
  A bare command line prints the top-level help.

| Command | Purpose | Help |
| --- | --- | --- |
| [`run`](#the-run) | Take an active plan from its current stage through its close | Listed |
| [`round`](#round) | Audit a plan or its steps | Listed |
| [`round-commits`](targets-and-files.md#commit-targets) | Audit a set of Git commits | Listed |
| [`settle`](#settle) | Record the user's settle call | Listed |
| [`ready`](#ready) | Record the user's ready call and assign the coder | Listed |
| [`implement`](#implement) | Implement the pending steps of a ready plan | Listed |
| [`close`](#close) | Close a plan's loop | Listed |
| [`split`](#split) | Split one source file by a chosen numbered move list | Listed |
| [`plan`](#plan) | Print the plan an omitted target selects | Listed |
| [`models`](model-read-out.md) | Print the model read-out | Listed |
| [`replay`](#replay) | Recompute the stored series answers | Listed |
| [`disprove`](#disprove) | Record a later ruling on a finding | Listed |
| [`mark`](#mark) | Claim a reopen marker file | Hidden |
| [`episode`](#episode) | Page the watch evidence view | Hidden |
| [`ruling`, `answer`](#ruling-and-answer) | Carry a ruling and its answer to a waiting run | Hidden |

Help lists the commands a user runs. The hand-run watch calls `episode`, the ruling chat calls
`ruling` and `answer`, and the reopen step calls `mark`, so help hides them.

## Model settings

Edit the gitignored `tools/audit-round/settings.json` for runs from either checkout. Changes
take effect on the next invocation. The loader accepts JSON with line comments (`//`), block
comments (`/* */`) and trailing commas, so alternatives can stay beside the active selections
in an editor. If the file is missing, the runner creates it as plain JSON from
[default-settings.json](../default-settings.json). An invalid file stops the command with a
validation error and remains available for correction.

The file presents `defaultAuditor` and `defaults` first, then the plan's stages in order:
`planningAudit`, `coders`, `implementationAudit` and `close`. Each audit level lists
`auditors`, `vetters`, `ruler`, the planning-only `fixer` and `watch`. The `split` settings
select designers and a picker. `maximumAutomaticRounds` and `strengthModels` come last.
Field order does not affect loading.

**Defaults and overrides.** `defaults` gives an explicit model and effort for Claude, Codex and
Gemini. The tracked Gemini default is `gemini-4-neon` at `high`.
Model and effort fields that accept `default` resolve independently at load time, including
list entries, rulers, the planning fixer, watch writers and split roles. The auditor list,
`models` read-out, fixes and ready markers therefore receive resolved selections. A ready
marker retains its coder when defaults change. The runner gets its model selections from this file.

`strengthModels` requires a base model for each assistant and accepts an optional top model.
The same names classify reported models for capability tags. Gemini's vendor letter is `g`.
Its tracked base is `gemini-4-neon`, so `gbx` selects Neon at extra high effort. A tag requesting
`t` requires a configured top model. A family alias such as `opus` follows the CLI's current
release, while a full model name pins it. The settings header shows the resolved release.
For `--first` and `--auditor`, an assistant name selects its defaults. A letter tag selects
the fields it names and takes omitted fields from those defaults. Each entry resolves
independently and selects the audit and rebuttal together. Other phases keep their settings.

**Audit levels.** Planning targets and plan-only commit targets use `planningAudit`. Implementation
targets and commit targets with a Repo Edu group use `implementationAudit`.

- `auditors` is a non-empty ordered list of assistant, model and effort selections. The work
  class's list supplies every auditor in an automatic series. Different models of one vendor count
  separately towards the [read floor](series.md#automatic-series). A one-entry list runs every
  settings-chosen round on that entry. A `--first` selection must resolve to a listed auditor.
- `defaultAuditor` supplies the opener when neither auditor option was given and rule 3 yields no
  opener from retained data. `first` chooses the first listed auditor. `random` picks one per
  scope's series so no auditor always takes the first look. Round data records the choice as
  settings-chosen.
- `vetters` is a non-empty list of selections. All listed vetters check every report of their
  class side by side, including reports from their own model and effort. Tags must be distinct
  within a panel because they name the vet report files.
- `ruler` selects who judges C or D contests and splits. Each level requires a ruler and may
  share that selection with the auditor or a vetter. The tracked default is Claude Fable at
  xhigh effort.
- `watch` selects the watch writer for the level, independently of the auditor.
- `planningAudit.fixer` fixes every planning round, including one after ready or chained for a
  plan-bound deferral, and every plan-only commit audit. Planning fixes edit the plan and
  contribute no coder evidence.

**Coders.** `coders` is a non-empty ordered list of assistant, model and effort selections. It
sits outside the audit levels because the assigned coder implements every step and fixes the
plan's implementation audits. Ready selects the entry after the most recent ready marker's coder,
wrapping to the first. It also takes the first when there is no previous assignment or that
coder has left the list. A one-entry list always selects its sole coder.

The target determines the fixer even if an implementation fix corrects stale plan text. An
implementation target uses its ready assignment, or the first coder if unassigned. A commit
target with a Repo Edu group takes the first coder because it can change code and has no ready
assignment. The implementation audit level has no fixer field.

**Other settings.**

- `close` selects an assistant, model and effort outside either audit level. Model and effort
  may take `default`. A named model must suit its CLI. A null close or the obsolete `planning`,
  `implementation` or `phases` levels are invalid. Rewrite the file or delete it to regenerate
  the defaults.
- `split.designers` is a non-empty list that allows repeated selections, each with a density
  of `normal` (the default) or `coarse`. Tracked settings use normal for Codex and coarse for
  Claude. `split.picker` selects one fresh session, Claude by default.
- `maximumAutomaticRounds` caps an active plan or commit target's automatic series, counting
  the first round.

Tests use independent settings from `configured-runner.ts` and `fixtures/settings.json`, so
edits to local or built-in settings cannot change their inputs. Settings tests separately cover
loading, generation and validation.

## Examples

```bash
pnpm audit-round round example 2,3-5,6-7
pnpm audit-round round example plan --auditor "atx, obm"
pnpm audit-round round-commits HEAD-2..HEAD plan@HEAD
pnpm audit-round disprove example example-plan-audit 2 1 --revision abx "The smaller correction was enough."
pnpm audit-round split pick packages/domain/src/roster.ts 1 2
pnpm audit-round split run ../plan/splits/packages/domain/src/roster.01.mv.md
```

## round

`round` audits a plan document or its steps. `round-commits` audits Git commits.
Both commands use the same round sequence.

- [Plan targets](targets-and-files.md#plan-targets) and
  [Commit targets](targets-and-files.md#commit-targets) for what the target selects.
- [Series](series.md#series) for `--auditor`, `--first` and the rounds that follow the
  first.
- [Watch](watch.md#watch) for `--no-watch`.
- [Stopped rounds](targets-and-files.md#stopped-rounds) for a rerun.

## The run

`run <stem> [-v] [--resume <step>:<session-id>]` takes an active plan from the
stage its state calls for through its close. Invoking it is the user's settle, ready and close
call, given in advance.

`lifecycleStage` in `default-target.ts` reads the stage the run starts at, from the same state a
[bare plan name](targets-and-files.md#a-bare-plan-name) reads:

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
  run stopped, under [Where a range list starts](targets-and-files.md#where-a-range-list-starts).

The run takes `-v`, the implementation recovery option `--resume` and no round option, so every
series it opens starts with the ordinary opener and runs the glance and the watch. A resumed
session attaches only when the run starts in the implementation; a run starting in another stage
says the session stays unused. A user who wants another opener, no watch or a read between stages
runs the stage commands.

## settle

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

## ready

`ready [stem]` takes an active settled plan through the same resolution and plan-file preflight
as `settle`. It reads settings but starts no assistant process or release lookup.

- It refuses a widening plan and a stem whose history already carries a ready marker.
- It validates the committed plan's steps and audit ranges.
- It assigns the next coder under [Model settings](#model-settings).
- It records the assigned coder in the body of
  `<stem>/ready: declare the plan ready for implementation`. The commit is empty and preserves
  unrelated staged work, through the `git commit --only --allow-empty` route it shares with
  [direct clean completion](rounds.md#clean-audits).

## implement

`implement <stem> [scope] [-v] [--resume <step>:<session-id>]` requires an active plan with an
assigned `ready` marker, checked before assistant startup. `implement.ts` owns that gate, the
optional step scope, the per-repo landed-share scan and the sequential worker loop.

- It parses the plan's implementation steps and scans each hosting repo's log independently. It
  reuses the per-repo progress reader of [Plan targets](targets-and-files.md#plan-targets) without
  applying bare-plan audit selection.
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
- Each started step retains its transcript and log under
  [Step logs](targets-and-files.md#step-logs).

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

## close

`close [stem]` closes a plan's loop under `../plan/.agents/skills/close/references/workflow.md`.
The home `/close` and `$close` launchers both use this entry. `runClose` in `round.ts`
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
   [The close move](targets-and-files.md#the-close-move) and prints how many it moved. An aborted
   close moves the same files.

**Leftover files.** A close named for a plan already under `archive/` whose round data or round
files still sit in the round folder does only those moves and starts no session. A resumed close
session moved the plan without the runner there, so the rerun finishes the close. It stamps the
round-data commit from the close selection alone.

## split

1. `split design <source>` runs the designers side by side and saves their answers in designer
   order. The source path, hash and line count come from one snapshot. The call prints the answer
   paths and the pick command, then ends as `answers-saved`.
2. `split pick <source> <answer>...` compares the named saved answers in number order, including
   answers from different design calls. It loads their writer records and skips if any answer's
   hash differs from the current source. A pick with moves ends as `designed` and prints the command
   to run the committed list.
3. `split run <move list>` reads a numbered committed plan path from Git's HEAD or a designer's
   answer by its evidence path. It checks the source hash before acting. A designer's moves are
   published in a tag-free `choose` commit. A no-split answer returns its saved reason. The command
   starts no assistant and looks up no release.
4. `split <source>` designs, picks and immediately carries out the selected moves.

The source path is relative to Repo Edu and belongs to a workspace package. During the pick stage,
the runner tries proposed moves in memory. The picker sees the tool's refusal on any ineligible
list. Unanimous no-split results stand without a picker session. If every answer is a refused list,
the call ends as `needs-plan`. The runner writes the pick report and any replacement answer from
the pick result.

The final attempt runs under the split lock. A clean result supplies every path and text to write. A
picked or user-chosen list is copied from its saved answer and replaces the older numbered plan list
in one commit. Local edits to either plan path skip publication. An immediate split holds the same
lock while checking Repo Edu for local edits and writing the returned texts. Both checks include
ignored files at the paths the runner would change. A run of the committed list reads Git's version
and leaves working-copy edits to that list in place.

The lock lives in the Repo Edu Git folder. The statement move tool runs in a child process so the
lock can refresh. Stopping the runner cancels the move attempt in that process. Checks and
package tests run outside the lock. A failed check restores the files
under the lock. A successful split commit credits the saved answer's writer. A design commit credits
the picker and names the original answer and its designers.

The final line follows the
[split result grammar](../../../.agents/references/round-grammar.md#split-result). A failed session
prints its reason, session ID and rerun command. A failed design reruns every designer. A failed
picker reruns `split pick` with the same answer numbers, including when the picker ran inside a
bare split.

## plan

`plan` prints the plan an omitted target selects, as its absolute path, and writes nothing, so a
user can see it before a round or a close takes it. The home `/brief-plan` runs `plan` for an
omitted stem.

## replay

`replay` reads every active and archived plan's retained round data and every commit series' data
file. A commit series lives in the round folder or its own folder under `commits/`, so its answers
count once. Loose recovered files directly in `commits/` stay out. Replay starts no assistant and
writes nothing.

- It applies the automatic-series decision function of `judge.ts` to each stored answer.
  `replay.ts` reads each answer stored without an auditor list as the assistant-keyed rules that
  produced it.
- It prints the computed answer, the stored answer, the next round's findings and whether the row
  is in the fixed corpus.
- Its ordinary totals cover every stored answer and count commit series as their own phase.
- Its fixed Baseline totals use plan entries started before
  `2026-11-08T18:53:13Z`, with the historical auditor list fixed by the deterministic-judge plan.

## disprove

`disprove` records the user's later ruling on a finding in one active or archived plan's round
data. It writes through the shared atomic writer, starts no assistant and reads no settings.

- `disprove <stem> <target> <round> <finding> <reason>` finds the exact stored target and round
  number in the plan's planning or implementation round data. Older target names still identify
  their rounds. The command records the date and the user's full reason on the named finding.
  A rerun replaces that entry. Without an option the ruling says the finding was wrong.
- Adding `--vet` records that the finding stood as written, even if every vetter accepted it.
- Adding `--revision <tag>` credits the named vetter's revision. The command checks that the
  vetter revised this finding. Only one of `--revision`, `--vet` and `--by` may be used.
- `disprove <stem> <target> --by "<model> <effort>" <reason>` records a finding that retained
  round data does not hold, under the manually named auditor. It creates the round-kind file when
  it does not exist. Each such ruling appends, because two unrecorded findings by one auditor may
  both be real.
- Adding `--implementation <A|B|C|D>` to `--by` records an implementation finding against the
  named coder. It requires an implementation target and cannot accompany `--vet` or `--revision`.
  It appends to the same later-ruling list without inventing an audit round. The model read-out
  displays it under **Implementation findings** and counts it against that coder once the plan
  qualifies for the coder comparison. Like other rulings without a known round, it is omitted
  from a date-filtered read-out.

An active plan's file in the round folder stays there until loop-close moves it. An archived
plan's file is committed alone, as the tag-free `<stem>/disprove:` form with the reason as its
body. A finding that stood as written uses `vet finding` in that subject. Both other attached
rulings use `finding`. A detached ruling or implementation finding uses `by <model> <effort>`.

## mark

`mark reopen [stem]` claims the next plan-round number of an active plan, or of the plan `plan`
prints when none is named. It writes the empty `<stem>-plan-audit-<round>-0-reopen.md` in the round
folder and prints its path. The marker file takes a number so a file list shows where the reopen
fell among the rounds. The **Round completion** section of
`../plan/.agents/references/planning-rules.md` specifies when to write the marker. The command loads
no settings, resolves no release and starts no assistant.

## episode

`episode [stem-or-commit] --lines <start>-<end>` prints one one-based inclusive line range from
the current view of the [episode evidence](watch.md#episode-evidence).

- It resolves the target before reading the range. Omission selects the newest topic: the newest
  stem commit across both histories by commit date. A commit is an explicit anchor in whichever
  repo holds its SHA, and the peer keeps its own anchor. HEAD forms mean Repo Edu.
- The first line states the returned range and the view's current total line count, on every
  call. An out-of-range request reports `none` and returns no evidence lines.
- Each call reads both histories and the current round data again.
- It resolves no release, starts no assistant and writes no file, cache entry or snapshot.

## ruling and answer

`ruling [target]` and `answer [target] <file>` are the ruling chat's two carriers to a run that
waits for a ruling, under [Ruling wait](rounds.md#ruling-wait). Both start no assistant,
read no settings and write no file.

- `ruling` prints what the waiting run asks and the answer form.
- `answer` carries one JSON answer document to the waiting run, prints the waiting run's response
  and exits 1 on a refusal.
- With no target they take the one run that waits and refuse when none or several wait.
- The chat follows [Answering a ruling](../../../.agents/skills/fix/references/answer.md).
  The notice lists the command for Claude, Codex and Antigravity. The same target identifies
  the wait in each app. See [Ruling wait](rounds.md#ruling-wait).
- [Invocation](../CLAUDE.md#invocation) describes each app's permissions for reaching the runner.

## Contract recorder

`pnpm audit-round:contract [claude|codex|gemini|all]` records all three CLIs by default.
To refresh Gemini alone, run `pnpm audit-round:contract gemini` from the Repo Edu root in
your shell. The recorder uses the same invocation and output code as a round, with a probe
prompt on the built-in default selection.

- It requires successful and deliberately failed shell calls before replacing any selected
  fixtures.
- The Claude probe also ends a turn on a background command and the recorder requires that second
  turn, so the recording pins one result per turn.
- A second probe resumes the first session and requires token usage from both invocations.
- Both probes use the fix schema and require a valid structured result. The Claude recording also
  keeps a finished turn without the object before its final turn.
- For Gemini the recorder keeps the session ID and model, tool and response events and the
  final result with usage. It saves the fresh and resumed streams, the CLI version and the
  shared recording date.
- It invokes no workflow and refreshes only this package's recordings.

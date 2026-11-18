# Series

This file describes the rounds that follow one another on a target: the automatic series and its
fixed rules, scope lists, open deferrals and the manual queue. Read
[`glossaries/audit-round.md`](../../../glossaries/audit-round.md) and the runner's
[CLAUDE.md](../CLAUDE.md) first. The [Ownership](../CLAUDE.md#ownership) table there names the
source files this file describes. It follows the runner documentation's
[Document layout](../CLAUDE.md#document-layout) rule: each fact is stated once.

## Series

`command.ts` owns the round sequence on one target and its counter. Without `--auditor`, an active
plan or commit target runs an [automatic series](#automatic-series). With `--auditor`, it runs a
[manual queue](#manual-queue), which applies no automatic decision.

- Each round records its own file pair. The command runner opens one output per round, retires the
  previous one first, and reads updates and settings once for the whole run before opening any
  files.
- Every round's title carries the number it claimed or continued for its target, so a rerun's
  first round names the round its data records.
- Required write failures stop phase progression. If recording itself fails, the emergency channel
  still reports the known session and the same `Rerun:` line as the round's ending.
- Failure or leaving a ruling without a reply stops either kind of sequence. A submitted reply
  resumes the fix, then the sequence after the round completes.
- The series returns its ending as a value, so a reader never parses the printed lines: `settle` or
  `ready` for the runner's lifecycle answer, `ended` for a runner stop, the maximum or an emptied
  manual queue, and `stopped` for an ending that needs the user.

### Auditor options

`command.ts` reads the `--auditor` and `--first` values with the queue's entry grammar and refuses
a list with no entries. [Selections](sessions.md#selections) says how an entry resolves.

- `--first` takes exactly one entry. It is refused beside `--auditor`, because the list's first
  entry already names the first round. An entry that does not resolve to a listed auditor of the
  target's list is refused before any round, because the series ends on the listed auditors' reads
  alone.
- `--auditor` accepts one selection or a sequence on the named plan scope or commit series.
  Repeated entries request separate rounds.

### Automatic series

The series reads the auditor list of the target's work class. It writes no queue.

**Opening.** The `--first` selection runs first. Without it, `openingAuditor` applies rule 3 to the
target's retained data:

- When the data holds a current read of the target by one listed auditor and none by another, the
  series opens on a listed auditor without one. A rerun after a failed round therefore continues
  where the series stood.
- With no current read at all, or one for every listed auditor, the configured default opens,
  because the rules give that round no reader and the user asked for one. `defaultAuditor` under
  [Model settings](../CLAUDE.md#model-settings) names that default.

**Decision.** After each round that is not red and did not change the plan's phase, the runner
applies the three fixed rules in `judge.ts`, which the plan repo's `STOP-CONDITIONS.md` states. A
round that changes the plan's phase finishes without a series answer. `judge.ts` builds bounded
evidence for the decision:

- A plan target supplies all of the stem's planning and implementation round data plus its episode
  commits. A commit target supplies only its round data.
- A read is settled when its findings have outcomes and it has a landed record, except that a
  finished or current commit round needs none, because a commit round whose every accepted finding
  needs a listed-file change lands nothing. The current `in-progress` entry is eligible.
- The glossary's **Current read** and **Real bug** entries name the events that make earlier reads
  stale. Reads that started after the latest event are current.
- A hand-run audit represented only by Git still contributes its event.
- A retained real-bug round takes its event time from its latest landed record commit, so an
  overlapping audit that started before the fix is not current.
- A read belongs to the listed auditor whose selection its audit launched on, as the round data
  records it, because a CLI may report another model or effort than it was asked for.

The answer follows from that evidence:

- When every listed auditor has a current read, widening follows the current round's parsed
  settling line, detailing answers ready before the ready marker and every other series answers
  stop.
- Otherwise the runner selects the listed auditor without a current read that read the scope least
  recently. List order breaks a never-read tie, so the auditor of this round goes last.
- The reason names the chosen auditor's last read of the target and the latest event, or says that
  the auditor has no read. The bare conclusion left the reader to work out which event made a read
  stale.
- `auditorText` owns the answer's `<assistant> <model> <effort>` spelling.

The answer is terminal output and retained data, not a phase or an assistant turn. The output
stores the answer, the reason and the ordered resolved auditor list in the round's final entry.
Each automatic round prints its answer and reason and repeats the reason in the line that ends the
series or opens the next round, so the log and the terminal's last lines both carry the
recommendation.

**Endings.** The series ends on settle, ready or stop, the configured maximum, a failure, an
unanswered ruling, a red watch or a phase change.

- A settle answer ends the series with the settle command to run and leaves the widening plan
  unchanged, for the user to settle or keep widening. Its reason stays in the round.
- A detailing ready answer ends the series with the ready command to run and leaves the settled
  plan unchanged, for the user to mark ready or keep detailing.
- Under [the run](../CLAUDE.md#the-run) both lines still print and the run records the call itself.
- Every automatic series ending on a plan prints the remaining open deferrals or says there are
  none.

### Commit series

Commit targets use the same fixed rules and maximum. A commit series has no lifecycle answer and no
watch: the runner stops it or chooses another listed auditor. The series decision reads one active
commit series. The series runner reads the commit data file before reruns, and the runner reads it
after automatic rounds. [Commit targets](../CLAUDE.md#commit-targets) says how each later round's
commit set grows.

### Scope lists

A resolved scope list, whether typed or derived from a completed plan's audit ranges, runs one
series per scope in list order, each scope on its own target.

- Each scope opens as its own series: the opener is chosen again, `--first` opens every scope and
  the round count starts over.
- Every ending but `stopped` ends only that scope, and the next one is announced.
- A failure, an unanswered ruling, a red watch or a plan phase change ends the whole list and names
  the scopes that did not run.
- After target resolution, the list is refused beside `--auditor`, whose queue belongs to one
  target and whose pairing with the scopes would need a second reading.

### Open deferrals

`open-deferrals.ts` owns one active plan's open set. The automatic series chain, each plan-scoped
implementation audit, every automatic series ending and loop-close all read this owner.

- It selects plan-bound deferrals from every Repo Edu commit by their destination plan, and Repo
  Edu-bound deferrals from that plan's stem commits.
- It removes plan-bound deferrals through plan-repo citations. It removes Repo Edu-bound deferrals
  through citations in Repo Edu history or the plan's stem commits. Each match uses the exact full
  commit ID and position.
- It returns the remaining deferring repo, full commit ID, position, tier, destination and title,
  newest first.

**Deferrals into the plan repo.** An automatic implementation series chains a planning round for
them:

- Before the series starts, the runner computes the open set and chains one scoped planning round
  when the set holds a deferral into the plan repo.
- After each finished implementation-audit round, it computes the set again. It chains the
  planning round only when the series remains eligible to continue to its decision.
- A red implementation watch or a plan phase change caused by the implementation fix leaves the
  deferral open, prints it and stops the series.
- The chained round receives only those deferrals. It runs before the implementation series
  decision, takes no implementation-series turn and does not count against that series' maximum.
- The chain uses the entry that `defaultAuditor` selects from `planningAudit.auditors`, including
  its model and effort.
- The chained round claims the next number for its own planning target, unless it continues a
  stopped chained round.
- The implementation series ends when the chained round fails, awaits a ruling, changes the plan's
  phase or receives a red watch.

**Deferrals into Repo Edu.** Before each plan-scoped implementation audit, the runner supplies the
open deferrals into Repo Edu to its audit and fix phases.

- Those items add Repo Edu to the judged repo set for their named corrections.
- The audit report opening names each supplied item whose correction already holds. Findings name
  the missing items.
- A clean round cites satisfied items. A fix reads both audit report parts and cites each item it
  applies or drops.

### Manual queue

With `--auditor`, the first entry runs first and the remaining entries seed an editable queue.
`queueFile` names the queue `<target>-queue.md`, beside the target's rounds in the round folder.
The name carries no round number because the file belongs to the whole sequence: one path stays
valid across rounds, so an editor holding it open keeps editing the file the runner reads.

- Each manual round prints the queue's path and contents when it opens.
- Edit the file to add, remove or reorder rounds. The runner reads it only between rounds, so an
  edit made during a round applies from the next one.
- A missing or empty file reads as an empty queue, which ends the sequence after the current
  round.
- A malformed entry stops the sequence with an error naming the file and the entry.
- A clean audit removes queued entries that resolve to that round's assistant, model and effort.
  Other settings remain. A fix that lands a clean record removes none.
- Failure, a round requiring a ruling, a red watch or an empty queue stops the manual sequence.
  The queue file stays until the close moves it.

`queue.ts` owns the shared entry splitter and the queue file's contents. Commit references, plan
scopes, `--auditor`, `--first` and queue files admit entries separated by commas, spaces or line
breaks. Auditor entries are each read by `parseAuditor` and keep the user's spelling, so a rewrite
changes only which entries remain. `queue.ts` resolves each entry through the same phase settings
and startup model selection as the round, so ending signals compare the exact assistant, model and
effort rather than the entry's spelling.

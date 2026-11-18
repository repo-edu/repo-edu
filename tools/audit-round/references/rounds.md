# Rounds

This file describes one round: its phase sequence, the readers of its reports, the winner rule and a
ruling's wait. Read [`glossaries/audit-round.md`](../../../glossaries/audit-round.md) and the
runner's [CLAUDE.md](../CLAUDE.md) first. The [Ownership](../CLAUDE.md#ownership) table there names
the source files this file describes. It follows the runner documentation's
[Document layout](../CLAUDE.md#document-layout) rule: each fact is stated once.

## Round sequence

`round.ts` is the coordinator of one round. It runs a fixed sequence of phases: audit, vet,
rebuttal, ruler and fix. Each phase starts a fresh session. The coordinator retains the audit
result and the audit report as local values. A round that continues a stopped one skips phases
under [Stopped rounds](../CLAUDE.md#stopped-rounds).

1. **Audit.** The runner names every input and output path of the round before the audit starts:
   the audit report, the vet reports, the rebuttal report, the ruler report, the ruling and the
   watch. The coordinator reads the saved audit report through `report.ts` to decide whether it is
   clean. A clean audit ends the round under [Clean audits](#clean-audits).
2. **Vet.** The vetters of the target work class's panel run side by side, each on the audit report
   alone. The round waits for every vetter. A failed vet fails the round, and the finished vetters'
   vet reports stay. The coordinator reads each vet report through `vet.ts` and decides from its
   verdict lines whether every finding was accepted.
3. **Rebuttal.** One rebuttal answers every vetter of the panel. It starts as a new session on the
   audit's resolved model and effort, including `--auditor` or `--first` fields, because it answers
   for the audit report. Its workflow grounds answers in current sources. Only Accept verdicts skip
   the rebuttal: when every vetter accepted every finding, the rebuttal would have nothing to
   answer, and the fix then reads the audit report with its vet reports alone.
4. **Ruler.** The rule phase runs only when a contest or split falls to the ruler, under
   [The ruler](#the-ruler).
5. **Fix.** The fix lands the round's records. It stops for a ruling when a decision is the
   user's, under [The user's ruling](#the-users-ruling).

The coordinator has no process, filesystem or terminal side effects of its own. Its dependencies
supply those operations explicitly. A returned phase failure stops the sequence. A rejected phase
invocation also stops it without retrying; the invocation owner must release its resources before
rejecting. The invocation owner's one request for a missing result line is not a retry: it repeats
no phase work, and the coordinator sees only the invocation's result.

### Clean audits

A clean audit completes directly through `clean.ts`, without vet, rebuttal, ruler, fix, glance or
watch. An automatic series still applies its decision rules to a clean round.

- A plan target lands one empty clean record in the sole judged repo, or in Repo Edu when both
  repos were judged. The record uses the audit report's judged-repos opening and the audit's actual
  model record and capability tag. `git commit --only --allow-empty` preserves staged work while
  using the normal hooks and signing settings. Full commit IDs identify any deferrals that the
  clean record closes.
- A commit target lands no commit.

Both routes retain their audit report and leave existing handoffs untouched. Completion failures
stop the run without a fictitious fix session or resume command. `target.ts` supplies the active
plan stem shared by output naming and clean records.

### After the fix

The round records both repositories' HEADs before the fix. After a finished fix it reads the
landed records and validates every subject under its repository's grammar.

- A plan target keeps only the records whose subject carries its stem, because another plan's
  round may land in the same checkout while the fix runs.
- A commit target keeps only the records whose subject opens with its series label, which the
  [hook](commit-hooks.md#the-hooks-rule) writes into every commit the fix lands. Another series
  has another label and hand-run work has none, so neither joins the round.
- A plan target fails when a finished fix landed no commit.
- A commit target may land nothing. A finished clean commit entry settles the runner's read
  without a landed record.

Reader failures retain the owning phase and its session for recovery.

After the fix, `round.ts` resolves the plan's current filename. A widening fix must end with the
grammar's settling line. That line replaces the audit report's closing line as the entry's
retained settling recommendation, because the fix ends the round and has answered every ruling it
asked. A fix outside widening must return none.

Before the watch, `round.ts` publishes the settled findings as the current `in-progress` round-data
entry. The [watch](watch.md#watch) then runs, and an automatic series applies its
[decision](series.md#automatic-series). The watch still runs when the fix changed the plan's phase,
but the series decision does not.

## Report readers

The coordinator receives its readers through `RoundDependencies`: the audit report reader, the vet
report reader, and the HEAD and subject reads. The ruler report reader and the read of one landed
record by its full ID are supplied the same way, because a continued round reads its kept ruler
report and the commits its stopped fix landed.

### Audit report

`report.ts` uses `mdast-util-from-markdown` to read the document-level opening and the finding
fields.

- The first grammar-owned field heading ends the opening. Other level-2 headings stay inside it, so
  presentation depth cannot hide the workflow, target or judged repositories from the reader.
- Planning audit reports have Excess functionality and Missing functionality fields.
  Implementation audit reports have one Findings field, which includes deferred findings.
- Each field holds depth-3 finding headings or its exact empty-field sentence. A heading form keeps
  evidence free of the indentation a numbered list needs, which grew by one space at the tenth
  finding and was missed.
- Finding titles are distinct across the whole audit report, because the vet and the rebuttal name
  findings by them. Round data joins findings to record bullets by the `[finding:<n>]` number each
  bullet opens with.
- Quoted evidence and code blocks supply no findings.
- A widening audit report must end with the grammar's settling line as its last paragraph. The
  reader takes the line from its source, so a formatted reason keeps its words, and returns it as
  the audit report's settling value. It refuses a settling line on any other audit report class
  and returns an empty value there. A clean widening round retains the audit report's line as its
  settling recommendation, since no fix ran to replace it.

### Vet and rebuttal reports

`vet.ts` reads the fixed verdict and answer lines and ignores every other line.

- It requires verdicts for the audit report's finding numbers in order.
- A `Revise to [<tier>]` suffix records a changed tier. An unchanged tier stays plain `Revise`.
- A rebuttal answer line names the vetter it answers by its tag, so the reader takes the vetter
  from the line alone.
- It requires one answer for each revise, drop and ruling verdict of each panel vetter, in audit
  report order and then panel order.
- It refuses by name an answer that names no vetter, a vetter outside the panel or a vetter that
  accepted the finding. A misnumbered or mistagged answer therefore fails on its own line rather
  than as a missing one.

### Ruler report

`ruler-report.ts` reads the ruler report under the grammar's
[Ruler report](../../../.agents/references/round-grammar.md#ruler-report), against the findings the
ruler was given and the round's panel. It returns one winner and one-line reason per given finding
in audit report order, and every source the report names as opened, each once.

A source is a file's absolute path or a commit's first six characters, so it can be matched as
plain text against the ruler's own tool lines. `unopenedSources` is that reading check: a source
counts as opened when its text appears in a tool invocation line of the session, or when it is the
path of a file the first prompt supplied whole. The assistant boundary sends a ruler that missed a
source back once with `rulerSourceRequest`, and a second miss fails the phase.

## Winners and rulings

One winner rule holds in every round and both work classes, under the shared protocol's
[Reconciliation](../../../.agents/references/round-protocol.md#reconciliation): a contest or split
whose highest grade from the audit report or any vetter is A or B goes to the user, and one on C
or D goes to the ruler. `seriousFindings` finds the user's set and `rulerFindings` the ruler's.
`round-data.ts` owns the pairwise split rule and the highest grade. The schema also reads them,
because only a contest or a split may store a ruling.

### The ruler

When the ruler's set is not empty, the rule phase runs after the rebuttal in a fresh session on the
work class's `ruler` selection, which `rulerPhase` names.
[Phase routing](../CLAUDE.md#phase-routing) lists what it receives. The runner records each winner
the ruler names with the ruler as the namer. A failed ruler fails the round before the fix.

### The user's ruling

Each serious finding goes to the user:

1. The fix writes the final ruling to the ruling path it received and checks it for clarity before
   returning `needs-ruling`. A missing or empty ruling fails the fix with its recovery session.
2. The runner checks that file, then waits for the user's answer under
   [Ruling wait](#ruling-wait). Its notice says whether the fix uses the auditor's model, one
   vetter's model named by its tag or neither. The runner compares the releases startup resolved,
   so a model alias and its release name the same model.
3. The answer names `report`, the tags of the vetters that were right, `neither` or `not yet` for
   each such finding, with a reason where a winner was named, and the free reply.
4. The runner retains each winner and reason on the finding and passes them to the resumed fix.
   The same fix session resumes in the background with that reply.
5. Further open decisions repeat this route and ask only for the findings still without winners.
   They replace the ruling in that same session under
   [Writing a ruling](../../../.agents/skills/fix/references/ruling.md). No separate ruling phases
   run.

Every fix child receives the finding numbers still without winners in `COMMIT_OPEN_CONTESTS`. The
shared commit hook refuses a commit while that value is non-empty, and the coordinator refuses a
finished fix while any remain.

A completed fix follows the same commit checks and watch as an uninterrupted fix. A submitted
reply lets a completed round continue any remaining auditor entries. Ending the wait with Ctrl-C
retains the round files and ends the auditor sequence. A continued round's fresh fix starts with
the stored winners and the commits the stopped fix landed, then re-enters this same loop.

### Ruling wait

`ruling-wait.ts` owns a ruling's wait under the ruling-answer plan's Decisions 2 and 3. It serves a
fix and an implementation worker alike.

**The socket.** While a fix or implementation worker waits for a ruling, the run listens on one
Unix domain socket in the `rulings` folder under the cache root. It serves two `node:http`
requests: what is open, and the answer.

- The socket's name is a short hash of the plan stem or commit label the run serves, because a
  socket path is limited to 103 bytes on macOS and 107 on Linux.
- The run removes any file at its own path before it listens, because a killed run never closes its
  server and its file would block every later wait on the target.
- When two runs of one target wait at once, the later one takes the name, and ending the earlier
  one removes the later one's file. That outcome is accepted.

**The answer.** One `zod` schema covers the waiting ruling and the answer document. The winner
words are `round-data.ts`'s list plus `not yet`. The waiting ruling carries the round's panel tags
once, because every finding of a round has the same panel, and the notice and `ruling` print them
among the winner words. The module owns the one check for a complete answer:

- Each open finding gets a winner with a one-line reason, or `not yet`, which takes no reason.
- A winner's vetter tags name vetters of the round's panel.
- The free reply may be empty only when every open finding has a winner.
- An implementation ruling has no finding and no panel, so its answer is the reply.

The run answers accepted or refused with every missing part named, and a refusal keeps it waiting.
Reply recording completes before the fix can resume. The runner's signal ends the wait unanswered.
The assistant never inherits the terminal.

**The carriers.** The hidden `ruling` and `answer` commands are only carriers, under
[ruling and answer](../CLAUDE.md#ruling-and-answer). They find the waiting runs through the folder
and count a socket that refuses the connection as no run.

**The dialog.** The module also holds the ruling dialog: a window that names the round and the
`/ruling <target>` line, with one OK button. A window that needs a click is hard to miss, while a
notice in a busy terminal is easy to miss.

- On macOS it is AppleScript's `display dialog`, because `display alert` draws a narrow window
  that breaks a file path across several lines.
- `main.ts` supplies the dialog on macOS only. Linux shows none, and the notice alone asks for the
  ruling.
- The run does not wait for the click. The dialog lives as long as the wait: ending the wait closes
  it, so no stale window outlives its ruling.
- A dialog that cannot show prints one line and the wait goes on.

[Output](output.md#ruling-notice) describes the printed notice.

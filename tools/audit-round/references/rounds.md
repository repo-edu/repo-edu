# Rounds

This file describes one round: its phase sequence, the readers of its reports, the winner rule and a
ruling's wait. Read [`glossaries/audit-round.md`](../../../glossaries/audit-round.md) and the
runner's [CLAUDE.md](../CLAUDE.md) first. The [Ownership](../CLAUDE.md#ownership) table there names
the source files this file describes. It follows the runner documentation's
[Document layout](../CLAUDE.md#document-layout) rule: each fact is stated once.

## Round sequence

`round.ts` is the coordinator of one round. It runs a fixed sequence of phases: audit, vet,
rebuttal, ruler and fix, and asks the user's questions before the fix. Each phase starts a fresh
session. The coordinator retains the audit
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
5. **Questions.** The runner asks the user for every winner and choice the reviews leave open,
   under [The user's ruling](#the-users-ruling).
6. **Fix.** The fix lands the round's records. It stops for a ruling only on a decision it meets
   in its own work.

The coordinator has no process, filesystem or terminal side effects of its own. Its dependencies
supply those operations explicitly. A returned phase failure stops the sequence. A rejected phase
invocation also stops it without retrying. The invocation owner must release its resources before
rejecting.

### Clean audits

A clean audit completes directly through `clean.ts`, without vet, rebuttal, ruler, fix, glance or
watch. An automatic series still applies its decision rules to a clean round.

- Every target lands one empty clean record in the sole judged repo, or in Repo Edu when both
  repos were judged. The record uses the audit report's judged-repos opening and the audit's actual
  model record and capability tag. `git commit --only --allow-empty` preserves staged work while
  using the normal hooks and signing settings. Full commit IDs identify any deferrals that the
  clean record closes.
- A plan target's record opens with its stem. A commit target's record opens with its series label
  and the `commit-audit` role, as the [hook](commit-hooks.md#the-hooks-rule) would open it.

The round retains its audit report and leaves existing handoffs untouched. Completion failures
stop the run without a fictitious fix session or resume command. `target.ts` supplies the active
plan stem shared by output naming and clean records, and `round-paths.ts` the series label.

### After the fix

The round records both repositories' HEADs before the fix. After a finished fix it reads the
landed records and validates every subject under its repository's grammar.

- A plan target keeps only the records whose subject carries its stem, because another plan's
  round may land in the same checkout while the fix runs.
- A commit target keeps only the records whose subject opens with its series label, which the
  [hook](commit-hooks.md#the-hooks-rule) writes into every commit the fix lands. Another series
  has another label and hand-run work has none, so neither joins the round.
- A plan target fails when a finished fix landed no commit.
- A commit target may land nothing, because a round whose every accepted finding needs a
  listed-file change lands no record. A finished commit entry settles the runner's read without a
  landed record.

Phase failures retain the owning phase and its session for recovery.

After the fix, `round.ts` resolves the plan's current filename. A widening fix must return
settling advice. That advice replaces the audit result's advice as the entry's
retained settling recommendation, because the fix ends the round and has answered every ruling it
asked. A fix outside widening must return none.

Before the watch, `round.ts` publishes the settled findings as the current `in-progress` round-data
entry. The [watch](watch.md#watch) then runs, and an automatic series applies its
[decision](series.md#automatic-series). The watch still runs when the fix changed the plan's phase,
but the series decision does not.

## Report results

The runner validates each report result against the schema it gave the session.
It writes the Markdown, displays it and keeps the fields needed for routing in
the round entry. Vet explanations, audit evidence and the ruler's evidence
record stay in the report.

### Audit report

The runner supplies the target and the judged repositories with their heads.
It writes the opening metadata and numbers the findings. In a planning audit it
groups excess before missing. It writes the recommendation last for a widening
audit and retains its value for the series when a clean audit needs no fix.

### Vet and rebuttal reports

The vet schema has a slot for each audit finding. The rebuttal schema has a
slot for each review that needs an answer. The runner writes findings in audit
order and includes the audit's tier. Each rebuttal finding follows panel order.

### Ruler report

The ruler schema names each finding the ruler judges and the panel tags
available as winners. A source is an absolute path or the first six characters
of a commit ID. The runner checks these names against actual tool calls and the
files supplied whole in the prompt. It leaves out the call that returns the
result because that call repeats the names. It asks the same session once to open any
missing sources and obtain a new result. A second miss fails the phase.

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

The runner asks every question the reviews leave to the user before the fix starts, so the fix
begins with each decision it needs. `rulingQuestions` lists them in finding order:

- A serious contest or split without a stored winner needs a winner.
- A referral that no review disputes needs a choice. `referredFindings` finds them. A referral the
  rebuttal disputes is a contest instead, and a revise or drop all sides agree on needs nothing.
- An open choice in the ruler report needs a choice.
- A stored winner the user gave with a choice needs that choice again, because the choice is not
  stored. The winner stands and is not asked again.

The questions follow one route:

1. The runner waits once for all of them under [Ruling wait](#ruling-wait), with no ruling file.
   Its notice names the round's reports and says whether the fix uses the auditor's model, one
   vetter's model named by its tag or neither. The runner compares the releases startup resolved,
   so a model alias and its release name the same model.
2. The runner stores each winner and reason on the finding with the user as its namer. It passes
   each choice to the fix in the user's words, in a choice object after the contest object.
3. A choice is not stored, so a stopped round asks for it again. A stored winner stands under
   [Stopped rounds](../CLAUDE.md#stopped-rounds) and is not asked again.
4. Ending the wait with Ctrl-C stops the round with no fix session. The round files stay, and the
   rerun asks the open questions again.

A decision the fix meets in its own work takes the ruling route:

1. The fix writes the final ruling to the ruling path it received and checks it for clarity before
   returning `needs-ruling`. A missing or empty ruling fails the fix with its recovery session.
2. The runner checks that file and waits under the same wait. The answer is the user's reply, and
   the same fix session resumes in the background with it.
3. Further open decisions repeat this route and replace the ruling in that same session under
   [Writing a ruling](../../../.agents/skills/fix/references/ruling.md). No separate ruling phases
   run.

Every fix child receives the finding numbers still without winners in `COMMIT_OPEN_CONTESTS`. The
shared commit hook refuses a commit while that value is non-empty, and the coordinator refuses a
finished fix while any remain.

A completed fix follows the same commit checks and watch as an uninterrupted fix. A submitted
answer lets a completed round continue any remaining auditor entries. Ending a wait with Ctrl-C
retains the round files and ends the auditor sequence. A continued round asks only its open
questions, and its fresh fix starts with the stored winners and the commits the stopped fix landed.

### Ruling wait

`ruling-wait.ts` owns a ruling's wait under the ruling-answer plan's Decisions 2 and 3. It serves
the questions before a fix, a fix and an implementation worker alike.

**The socket.** While a run waits for a ruling, it listens on one
Unix domain socket in the `rulings` folder under the cache root. It serves two `node:http`
requests: what is open, and the answer.

- The socket's name is a short hash of the plan stem or commit label the run serves, because a
  socket path is limited to 103 bytes on macOS and 107 on Linux.
- The run removes any file at its own path before it listens, because a killed run never closes its
  server and its file would block every later wait on the target.
- When two runs of one target wait at once, the later one takes the name, and ending the earlier
  one removes the later one's file. That outcome is accepted.

**The answer.** One `zod` schema covers the waiting ruling and the answer document. The waiting
ruling names the ruling file when a fix or worker wrote one, the round's reports and each finding
that needs a winner or a choice. The winner words are `round-data.ts`'s list. The waiting ruling
carries the round's panel tags once, because every finding of a round has the same panel, and the
notice and `ruling` print them among the winner words. The module owns the one check for a
complete answer:

- Each finding that needs a winner gets one with a one-line reason, and may add a choice.
- Each finding that needs a choice gets a choice alone.
- A winner's vetter tags name vetters of the round's panel.
- The answer names only asked findings, each once.
- A ruling that asks about no finding, such as an implementation ruling, takes the reply as its
  answer.
- Before the fix the reply stays empty, because no session reads it.

The run answers accepted or refused with every missing part named, and a refusal keeps it waiting.
Answer recording completes before the fix starts or resumes. The runner's signal ends the wait
unanswered. The assistant never inherits the terminal.

**The carriers.** The hidden `ruling` and `answer` commands are only carriers, under
[ruling and answer](../CLAUDE.md#ruling-and-answer). They find the waiting runs through the folder
and count a socket that refuses the connection as no run.

**The commands.** The module holds the one wording of the chat commands that answer the wait,
which the notice and the dialog share: Claude's `/ruling <target>` and Codex's `$ruling <target>`,
each labelled with its app and holding the waiting run's target. Both reach the same wait, so the
user picks the app whatever model runs the fix or worker.

**The dialog.** The module also holds the ruling dialog: a window that names the round and the two
commands, with one OK button. A window that needs a click is hard to miss, while a notice in a busy
terminal is easy to miss.

- On macOS it is AppleScript's `display dialog`, because `display alert` draws a narrow window
  that breaks a file path across several lines.
- `main.ts` supplies the dialog on macOS only. Linux shows none, and the notice alone asks for the
  ruling.
- The run does not wait for the click. The dialog lives as long as the wait: ending the wait closes
  it, so no stale window outlives its ruling.
- A dialog that cannot show prints one line and the wait goes on.

[Output](output.md#ruling-notice) describes the printed notice.

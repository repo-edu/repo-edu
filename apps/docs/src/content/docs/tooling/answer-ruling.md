---
title: /ruling
description: Answer a waiting run's questions in a Claude or Codex chat, which explains them and sends your confirmed decision
---

`/ruling` answers what a waiting run asks you; `$ruling` does the same in Codex. Before an audit fix
starts, the runner asks for every decision the round's reviews leave to you. During a fix or a plan
step, the fix or implementation worker may write a ruling: its saved explanation of a decision it
cannot make for you. The chat reads the evidence itself, explains each open item and what its
options cost, proposes the answer its own reading supports, takes your decision and sends it to the
run in the terminal.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout; `$ruling` is the Codex counterpart |
| Owners | `../plan/home/claude/commands/ruling.md` and `../plan/home/agents/skills/ruling/SKILL.md` launch it; `.agents/skills/fix/references/answer.md` owns the answer; `.agents/skills/fix/references/ruling.md` owns the ruling's contents; `tools/audit-round/references/rounds.md` owns the wait and resumption |

## Usage

```text
/ruling                      answer the one run that waits
/ruling <stem>               answer the run that waits on that plan or commit target
```

In Codex type `$ruling` or `$ruling <stem>`. The terminal notice prints the exact line for each
app. The whole session uses the `/simple` wording requirement.

## When a run waits

An audit round asks you once, after its reviews and before its fix starts:

1. **A serious dispute.** The rebuttal contests a vetter, or two vetters give different verdicts, on
   a finding whose highest grade is A or B. You name who was right.
2. **A referral.** A vetter or the rebuttal sends a finding to you, and no review disputes that.
   You give your choice: what the fix does.
3. **An open choice from the ruler.** The ruler names the winner of the same disputes on a C or D
   finding. When the winning side leaves a real choice, the ruler states it and you give your
   choice.

A fix or an implementation worker writes a ruling only for a decision it meets in its own work: a
real product or cost choice that remains after the plan, code, boundaries and earlier decisions
have been checked.

The terminal prints a notice. It names the round or step, the ruling file when there is one, the
round's reports before a fix, the findings that need a winner or a choice, the winner words with the
round's vetter tags, whose model runs the fix and the two lines to type, `Claude: /ruling <stem>`
and `Codex: $ruling <stem>`. On macOS the run also shows a dialog window with the round and those
two lines. The window stays until you click OK, and it closes by itself once the wait ends. Open a
Claude or Codex chat on the Repo Edu or plan folder and type that app's line there. Either app
answers the same wait, whichever model runs the fix. On Linux no window shows; the notice alone
asks for your answer.

## What it shows you

1. **What is open.** The chat asks the waiting run through the hidden `pnpm audit-round ruling`
   command. When several runs wait, it asks you which one.
2. **What it reads.** It reads any ruling and, for each open finding, its part of the round's audit
   report, vet reports, rebuttal report and any ruler report. It answers your questions from those
   files and the sources they cite.
3. **Its own reading.** Before its first message the chat lists the points an open item rests on,
   opens every source behind them itself and builds its own full record. The first message opens
   with one line for each open item: what the chat recommends and, on a ruling, whether its reading
   supports the ruling's suggested answer. For an audit round, the next line shows the auditor's
   model and effort, for example `Auditor model: gpt-6.2-astra xhigh`.
4. **Each open item.** What is being decided, each option and what it means for you, what each
   option costs and the chat's recommendation. Then the points that settle it, as a short numbered
   list: the question, the source the chat opened with the place in it and what that source
   settles. On a ruling, a difference from the ruling's record that changes the answer is told with
   its evidence; any other difference gets one line.
5. **The record it proposes to send.** Each finding's winner and reason or its choice, and any free
   text for a fix or worker that wrote a ruling, in the words that will be sent. It is the last
   part of the first message; only the request for your yes and the line of item 6 follow it. When
   the chat could not open a source that decides a finding, it proposes nothing for that finding
   and says what is missing. Nothing is sent before your yes.
6. **The full record on request.** Each side's claim and the passage read are left out of the
   first message. Name a point by its open item and its number, such as `finding 2, point 1`, or
   ask about a whole open item, and the chat gives that part in full. The message's last line says
   how.

## Your answers

1. **Yes to the proposed record.** The chat sends it through the hidden `pnpm audit-round answer`
   command and relays the run's response. An accepted answer starts the fix, or resumes the fix or
   worker session that wrote the ruling, in the terminal. A refused answer names what is missing;
   the chat asks for it and shows the record again.
2. **Your own decision.** Give a finding that needs a winner `report`, the tags of the vetters that
   were right or `neither` with a reason in your own words, and a choice when the winning side
   leaves one. Give a finding that needs a choice what the fix should do. An implementation ruling
   has no finding; your decision is the text for the worker. Your words replace that part of the
   proposal. The chat asks when a winner, reason or choice is unclear, shows the new record and
   waits for your yes.
3. **A question for the chat.** It answers from the round's files and the sources they cite, and
   shows the record again.
4. **A question only the writer of a ruling can answer.** Put it in the text for the fix or worker.
   It answers and writes a new ruling while the decision stays open; you then answer with `/ruling`
   or `$ruling` again.

Before the fix every asked finding needs its answer, and the free text stays empty because no
session reads it. A winner you gave is stored and not asked again. A choice is passed to the fix in
your words and not stored, so a stopped round asks for it again. Waiting time is excluded from the
runner's work timing.

## Early stops

1. **No run waits.** The chat says so and stops. Check the terminal; a run that ended no longer
   takes an answer.
2. **The chat's command is refused by the sandbox.** Both hidden commands open a local socket, which
   the chat's sandbox refuses. In Claude, add these three entries to `sandbox.excludedCommands` in
   your Claude Code settings once: `pnpm audit-round ruling`, `pnpm audit-round ruling *` and
   `pnpm audit-round answer *`. In Codex, the chat asks your permission to run the blocked command
   outside the sandbox; when you refuse, it reports the permission error and stops. That permission
   is not your yes to the proposed record.
3. **You leave without an answer.** Ctrl-C in the terminal stops the run. The round or step files
   stay, and the runner prints a recovery command. Use that exact command to return to the retained
   work.

A round left at its questions or at a fix's ruling prints its `Rerun:` command. Running it
continues the round on its kept reports. It asks the questions still open, then starts a fresh fix.
An implementation worker left at a ruling prints the assistant's recovery command. Answer there,
then rerun the original `pnpm audit-round implement ...` or full-plan command so the runner can
read Git and continue. See [Recover a run](/repo-edu/tooling/recover-run/).

## Ruling files

An audit fix writes `<target>-<round>-7-ruling.<tag>.md` in `../plan-evidence/active/`. An
implementation worker writes `<stem>-impl-<step>-implement-ruling.<tag>.md`. The file is replaced
when the same session needs another decision and remains after the work finishes. The runner
commits the evidence repository before each wait, so its Git log keeps every version. The questions
before a fix have no ruling file; the round's reports hold their evidence.

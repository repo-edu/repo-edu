---
title: /ruling
description: Answer a waiting run's ruling in the Claude desktop chat, which explains it and sends your confirmed decision
---

`/ruling` answers a ruling a waiting run asks for. A ruling is the fix or implementation worker's
saved explanation of a decision it cannot make for you. Each open item shows what its writer read:
the points the sides differ on, the source it opened for each and what that source settles. The
chat reads the evidence itself, explains the ruling, proposes the answer its own reading supports,
takes your decision and sends it to the run in the terminal, which resumes the same session.

| Fact | Detail |
| --- | --- |
| Runs in | Claude desktop chat in the Repo Edu or plan checkout; there is no Codex counterpart |
| Owners | `../plan/home/claude/commands/ruling.md` launches it; `.agents/skills/fix/references/answer.md` owns the answer; `.agents/skills/fix/references/ruling.md` owns the ruling's contents; `tools/audit-round/CLAUDE.md` owns the wait and resumption |

## Usage

```text
/ruling                      answer the one run that waits
/ruling <stem>               answer the run that waits on that plan or commit target
```

The terminal notice prints the exact line to type. The whole session uses the `/simple` wording
requirement.

## When a run waits

Only a fix or an implementation worker returns a ruling. It may ask about a real product or cost
choice that remains after the plan, code, boundaries and earlier decisions have been checked. An
audit fix also asks who was right when the rebuttal contests a vetter, or two vetters give different
verdicts, on a finding whose highest grade is A or B. The ruler names the winner of the same
disputes on a C or D finding before the fix starts. Such a dispute reaches you only when the ruler
finds that a real choice remains or that the finding would change a fixed input.

The terminal prints a notice in place of the ruling's text. It names the round or step, the ruling
file, the findings that need a winner, the winner words with the round's vetter tags, whose model
runs the fix and the line `/ruling <stem>`. On macOS the run also shows a dialog window with the
round and that line. The window stays until you click OK, and it closes by itself once the wait
ends. Open a chat in the Claude desktop app on the Repo Edu or plan folder and type the line there.
On Linux no window shows; the notice alone asks for your ruling.

## What it shows you

1. **What is open.** The chat asks the waiting run through the hidden `pnpm audit-round ruling`
   command. When several runs wait, it asks you which one.
2. **What it reads.** It reads the ruling and, for a disputed finding, the round's audit report,
   vet reports, rebuttal report and any ruler report. It answers your questions from those files
   and the sources they cite.
3. **Its own reading.** Before its first message the chat lists the points the sides differ on,
   opens every source behind them itself and builds its own full record. The first message opens
   with one line for each open item: the chat's reading supports the ruling's suggested answer,
   differs from it or could not check a point that decides it.
4. **Each open item.** What is being decided, each option and what it means for you, and the
   ruling's recommendation. Then the points that settle it, as a short numbered list: the question,
   the source the chat opened with the place in it and what that source settles. A difference from
   the ruling's record that changes the answer is told with its evidence; any other difference gets
   one line.
5. **The record it proposes to send.** Each finding's winner and reason, then the free text for the
   fix, in the words that will be sent. It is the last part of the first message; only the request
   for your yes and the line of item 6 follow it. The chat proposes what its own reading supports,
   not simply the ruling's suggested answer. When it could not open a source that decides a
   finding, it proposes no winner for that finding, says what is missing and proposes `not yet`
   with a question for the fix. Nothing is sent before your yes.
6. **The full record on request.** Each side's claim and the passage read are left out of the
   first message. Name a point by its open item and its number, such as `finding 2, point 1`, or
   ask about a whole open item, and the chat gives that part in full. The message's last line says
   how.

## Your answers

1. **Yes to the proposed record.** The chat sends it through the hidden `pnpm audit-round answer`
   command and relays the run's response. An accepted answer resumes the same fix or worker session
   in the terminal. A refused answer names what is missing; the chat asks for it and shows the
   record again.
2. **Your own decision.** Give a finding that needs a winner `report`, the tags of the vetters that
   were right or `neither` with a reason in your own words, or change the text for the fix. An
   implementation ruling has no finding; your decision is the text for the fix. Your words replace
   that part of the proposal. The chat asks when a winner or reason is unclear, shows the new record
   and waits for your yes.
3. **A question for the chat.** It answers from the round's files and shows the record again.
4. **A question only the fix can answer.** Answer the finding with `not yet` and put the question in
   the text for the fix. The fix answers and writes a new ruling while the decision stays open; you
   then answer with `/ruling` again.

The free text may be empty only when every finding has a winner. A resolved decision is not asked
again. Waiting time is excluded from the runner's work timing.

## Early stops

1. **No run waits.** The chat says so and stops. Check the terminal; a run that ended no longer
   takes an answer.
2. **The chat's command is refused by the sandbox.** Both hidden commands open a local socket, which
   the chat's sandbox refuses. Add these three entries to `sandbox.excludedCommands` in your Claude
   Code settings once: `pnpm audit-round ruling`, `pnpm audit-round ruling *` and
   `pnpm audit-round answer *`.
3. **You leave without an answer.** Ctrl-C in the terminal stops the run. The round or step files
   stay, and the runner prints a recovery command. Use that exact command to return to the retained
   work; do not start the decision again in a fresh round.

An audit fix with an unresolved serious contest or split prints `pnpm audit-round resume-fix ...`.
That command reloads the stored winners, keeps commits blocked while one is missing and resumes the
same fix session. An implementation worker left at a ruling prints the assistant's recovery command.
Answer there, then rerun the original `pnpm audit-round implement ...` or bare full-plan command so
the runner can read Git and continue. See [Recover a run](/repo-edu/tooling/recover-run/).

## Ruling files

An audit fix writes `<target>-<round>-7-ruling.<tag>.md` in `../plan-evidence/active/`. An
implementation worker writes `<stem>-impl-<step>-implement-ruling.<tag>.md`. The file is replaced
when the same session needs another decision and remains after the work finishes. The runner
commits the evidence repository before each wait, so its Git log keeps every version.

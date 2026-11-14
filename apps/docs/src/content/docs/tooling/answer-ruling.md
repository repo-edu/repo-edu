---
title: /ruling
description: Answer a waiting run's ruling in the Claude desktop chat, which explains it and sends your confirmed decision
---

`/ruling` answers a ruling a waiting run asks for. A ruling is the fix or implementation worker's
saved explanation of a decision it cannot make for you. The chat explains it, takes your decision in
your own words and sends it to the run in the terminal, which resumes the same session.

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
audit fix also asks who was right when the auditor contests a vet, or two vets give different
verdicts, on an A-tier or B-tier finding.

The terminal prints a notice in place of the ruling's text. It names the round or step, the ruling
file, the findings that need a winner, the winner words with the round's vet tags, whose model runs
the fix and the line `/ruling <stem>`. The
run then opens the Claude desktop app on the Repo Edu folder when the work touches Repo Edu files,
and on the plan folder otherwise. The app starts a new chat and asks "Trust this workspace?" each
time. On Linux the app does not open; the notice says so, and you open a chat yourself.

## What it shows you

1. **What is open.** The chat asks the waiting run through the hidden `pnpm audit-round ruling`
   command. When several runs wait, it asks you which one.
2. **The explanation.** It reads the ruling and, for a disputed finding, the round's audit report,
   vet and rebuttal. It explains what is being decided, each option and the recommendation, and
   answers your questions from those files and the sources they cite.
3. **The record it will send.** Each finding's winner and reason, then the free text for the fix,
   exactly as they will be sent.

## Your answers

1. **A decision.** Give each finding that needs a winner `report`, the tags of the vets that were
   right or `neither` with a reason in your own words, and add any text for the fix. An
   implementation ruling has no finding; your decision is the text for the fix. The chat never picks
   a winner or writes a reason you did not give, and asks for what is missing.
2. **A question for the chat.** It answers from the round's files and asks for your decision again.
3. **A question only the fix can answer.** Answer the finding with `not yet` and put the question in
   the text for the fix. The fix answers and writes a new ruling while the decision stays open; you
   then answer with `/ruling` again.
4. **Yes to the shown record.** The chat sends it through the hidden `pnpm audit-round answer`
   command and relays the run's reply. An accepted answer resumes the same fix or worker session in
   the terminal. A refused answer names what is missing; the chat asks for it and shows the record
   again.
5. **A change to the shown record.** The chat shows the corrected record and waits for your yes.

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

An audit fix writes `<target>-<round>-7-ruling.<tag>.md` in the plan checkout's `active/` folder. An
implementation worker writes `<stem>-impl-<step>-implement-ruling.<tag>.md`. The file is replaced
when the same session needs another decision and remains after the work finishes.

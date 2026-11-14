---
title: Tooling Guide
description: Choose the planning, audit or maintenance command that fits the work in front of you
---

Use this guide to choose the planning, audit or maintenance command for the work in front of you.

Runner commands beginning with `pnpm audit-round` work from either the Repo Edu or plan checkout.
Commands beginning with `/` run in Claude chat; their Codex counterparts use `$`.

## What is the life of a plan?

1. **Widen.** Challenge the plan's problem and shape while its filename ends in `-widen`.
2. **Settle.** Record that the shape is fixed and remove `-widen` from the filename.
3. **Detail.** Complete the decisions, steps and checks that implementation needs.
4. **Ready.** Record that the plan may be implemented and assign its coder.
5. **Implement.** Run one fresh worker for each plan step and commit each hosting-repository share.
6. **Audit the implementation.** Check the finished step ranges, vet findings and apply accepted
   corrections.
7. **Close.** Move the finished plan and its round records into the archive.

## What do the guide's terms mean?

- **Stem:** the plan filename without `.md` and without the optional `-widen` ending.
- **Series:** consecutive audit rounds on one target, with the runner applying fixed rules after
  each round to decide whether another assistant needs a current read.
- **Vet:** an independent check of an audit report from a fresh context. Every vet listed for the
  work class checks each report, whoever audited.
- **Rebuttal:** the original auditor's evidence-based answer to vet disagreements.
- **Ruling:** a saved question that needs your decision before the same assistant session can
  continue.
- **Deferral:** an accepted correction that belongs in a repository outside the repositories the
  current round may change, so it remains open for a later round there.

## Which command fits my situation?

### Plan stages

| Your situation | What to run | What you see and decide |
| --- | --- | --- |
| I want to start or reopen a plan | Give the start or reopen instruction in the plan checkout | A planning document whose open shape can be audited |
| I want to settle a plan's shape | [`pnpm audit-round settle [stem]`](/repo-edu/tooling/settle/) | The widening filename is changed to its settled name; the command starts no assistant |
| I want to mark a detailed plan ready | [`pnpm audit-round ready [stem]`](/repo-edu/tooling/ready/) | The ready marker records your call and assigns the next coder |
| I want one command to take a plan through its whole life | [`pnpm audit-round <stem>`](/repo-edu/tooling/full-plan-run/) | The plan advances from its current stage; a stop that needs you ends the run and the same command continues later |
| I want to close a finished plan | [`/close [stem]`](/repo-edu/tooling/close/) or [`pnpm audit-round close [stem]`](/repo-edu/tooling/runner-close/) | The plan and its round data move to the archive; the command asks before closing with an open decision |
| I want to archive an abandoned plan | [`/close aborted [stem]`](/repo-edu/tooling/close/) or [`pnpm audit-round close <stem> --aborted "<reason>"`](/repo-edu/tooling/runner-close/) | The abandoned episode and its reason move to the archive |

### Audits

| Your situation | What to run | What you see and decide |
| --- | --- | --- |
| I want a plan checked and settled corrections applied | [`pnpm audit-round round <stem>`](/repo-edu/tooling/runner-round/) | Audit findings, an independent vet, any rebuttal and the fix |
| I want a plan checked after a step has landed | [`pnpm audit-round round <stem> plan`](/repo-edu/tooling/runner-round/) | A planning round that treats landed steps as fixed inputs |
| I want to check implemented steps | [`pnpm audit-round round <stem> <n\|a-b>`](/repo-edu/tooling/runner-round/) | Coverage and findings for that step range, followed by any auditor the fixed series rules require |
| I want to replay the automatic-series rules | [`pnpm audit-round replay`](/repo-edu/tooling/runner-round/#replay-the-rules) | Computed and stored answers, the next round's findings and totals; nothing is written |
| I want to check every range of a finished plan | [`pnpm audit-round round <stem>`](/repo-edu/tooling/runner-round/) | One series for each range in the plan, followed by a series over the full range |
| I want to check several ranges in one sitting | [`pnpm audit-round round <stem> 2,3-5,6-7`](/repo-edu/tooling/runner-round/) | One series per scope in list order |
| I want to check work outside a plan | [`pnpm audit-round round <commits>`](/repo-edu/tooling/runner-round/) | A series over the named commits and any fixes it lands |
| I want to run one audit phase by hand | [`/audit`](/repo-edu/tooling/audit/), [`/vet`](/repo-edu/tooling/vet/), [`/rebut`](/repo-edu/tooling/rebut/) or [`/fix`](/repo-edu/tooling/fix/) | One phase at a time; any assistant vets and the original auditor answers |
| I want to check a round's trajectory | [`/watch [stem\|commit]`](/repo-edu/tooling/watch/) | A grounded green, amber or red judgement; you decide the response |
| I want to compare the recorded auditors and coders | [`pnpm audit-round models`](/repo-edu/tooling/models/) | Auditor and coder tables, and a coder recommendation when the records clearly support one |
| I found that an earlier audit finding or vet verdict was wrong | [`pnpm audit-round disprove ...`](/repo-edu/tooling/disprove/) | Your dated ruling, chosen side and full reason enter the plan's round data |

### Implementation

| Your situation | What to run | What you see and decide |
| --- | --- | --- |
| I want to implement a ready plan | [`pnpm audit-round implement <stem> [scope]`](/repo-edu/tooling/implement/) | One fresh worker per remaining step, checked commits and completion markers |
| I want to see which plan an omitted stem selects | [`pnpm audit-round plan`](/repo-edu/tooling/plan/) | The active plan with the newest stem commit; nothing is written |

### Waiting and recovery

| Your situation | What to run | What you see and decide |
| --- | --- | --- |
| The runner is waiting for a ruling | [`/ruling [stem]`](/repo-edu/tooling/answer-ruling/) in the Claude desktop app | The chat explains the ruling and sends your confirmed answer; the same assistant session resumes |
| A phase failed or I left without replying | [Run the recovery command](/repo-edu/tooling/recover-run/) printed by the runner | The retained session and files continue that specific work |

### Source upkeep

| Your situation | What to run | What you see and decide |
| --- | --- | --- |
| I want to inspect growing source files | [`/sweep`](/repo-edu/tooling/sweep/) in Repo Edu | One file and a proposed verdict; you choose whether to record, plan or refactor it |
| I want to work through flagged refactors | Claude [`/refactor`](/repo-edu/tooling/refactor/) in Repo Edu | The backlog head and a recommended route; work starts only after your answer |

### Chat helpers

| Your situation | What to run | What you see and decide |
| --- | --- | --- |
| I want a plain-words read of a plan | [`/brief-plan [chat\|file] [stem]`](/repo-edu/tooling/brief-plan/) | A reading of the plan, in chat by default; no audit or plan change |
| I want the last reply explained more clearly | [`/rewrite`](/repo-edu/tooling/chat-helpers/#rewrite) | New wording of the selected reply; its judgements stay intact |
| I want to judge whether a plan is worth its complexity | [`/yield <plan.md>`](/repo-edu/tooling/yield/#yield) in the plan checkout | Ratings grouped by yield-to-complexity ratio; no plan edit without your instruction |
| I want plain words throughout this chat | [`/simple [prompt]`](/repo-edu/tooling/chat-helpers/#simple) | The plain-language requirement applies to chat and files for that session |

## What owns this page?

This page mirrors `tools/audit-round/CLAUDE.md` and the launchers under
`../plan/home/claude/commands/` and `../plan/home/agents/skills/`.

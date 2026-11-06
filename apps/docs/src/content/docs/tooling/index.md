---
title: Tooling Guide
description: Choose the planning, audit or maintenance command that fits the work in front of you
---

The planning and audit tools are easier to use when you start with your situation, not with a list
of commands. This first version of the guide has three sample command pages. Later pages will cover
the other commands in the table.

## How do I use this guide?

Find your situation below, then open its command page when one is linked. A command page explains
why the command exists, when to use it, what it reads and writes and every point where it waits for
your answer.

`plan` means the plan checkout root. `repo-edu` means the Repo Edu checkout root. Commands beginning
with `pnpm` run in a terminal. Commands beginning with `/` run in Claude chat; their Codex
counterparts use `$`.

## Which command fits my situation?

| Your situation | What to run and where | What you see and decide |
| --- | --- | --- |
| I want to start or reopen a plan, settle its shape or mark it ready | Give the start or reopen instruction in `plan`; run `pnpm audit-round settle [stem]` or `pnpm audit-round ready [stem]` from either checkout | You make each lifecycle decision; settle and ready record those calls without starting an assistant |
| I want one command to take a plan through its whole life | [`pnpm audit-round <stem>`](/repo-edu/tooling/full-plan-run/) in either checkout | The plan advances from its current stage through audit, implementation and close; a stop that needs you ends the run and the same command continues later |
| I want to close a finished or abandoned plan | `/close [aborted] [stem]` or `pnpm audit-round close [stem]` from either checkout | The plan and its round data move to the archive; the command asks before closing with an open decision |
| I want a plain-words read of a plan | `/brief-plan [chat\|file] [stem]` in either checkout | A reading of the plan, in chat by default; no audit or plan change |
| I want the last reply explained more clearly | `/rewrite` in the same chat | New wording of the selected reply; its judgements stay intact |
| I want a plan checked and settled corrections applied | `pnpm audit-round round <stem>` in either checkout | Audit findings, an independent vet, any rebuttal and the fix; a series stops when it needs evidence or a decision from you |
| I want to implement a ready plan | `pnpm audit-round implement <stem> [scope]` in either checkout | One fresh worker per remaining step, checked commits and completion markers |
| I want a plan checked after a step has landed | `pnpm audit-round round <stem> plan` in either checkout | A planning round that treats landed steps as fixed inputs and checks the brief for the work still to land |
| I want to check implemented steps | `pnpm audit-round round <stem> <n\|a-b>` in either checkout | Coverage and findings for that concrete step range, followed by another auditor when the series judge calls for one |
| I want to check every range of a finished plan | `pnpm audit-round round <stem>` in either checkout | One series for each range written in the plan, followed by a series over the full range |
| I want to check several ranges in one sitting | `pnpm audit-round round <stem> 2,3-5,6-7` in either checkout | One series per scope in list order; a stop that needs you ends the list |
| I want to check work outside a plan | `pnpm audit-round round <commits>` in either checkout | A series over the named commits and any fixes it lands |
| I want to compare the recorded auditors and coders | `pnpm audit-round models` in either checkout | A graded reading and a recommendation when the records support one |
| I found that an earlier audit finding was wrong | `pnpm audit-round disprove ...` in either checkout | Your dated ruling and full reason enter the plan's round data |
| I want to run one audit phase by hand | [`/audit`](/repo-edu/tooling/audit/), `/vet`, `/rebut` or `/fix` from either checkout | One phase at a time; use the other assistant for vet and the auditor's assistant for rebuttal |
| The runner is waiting for a ruling | Reply in the runner and submit a blank line | The saved ruling names the choices; the same session resumes with your reply |
| A phase failed or I left without replying | Use the recovery command printed by the runner | The retained session and files continue that specific work |
| I want to see which plan an omitted stem selects | `pnpm audit-round plan` in either checkout | The active plan with the newest stem commit; nothing is written |
| I want to check a round's trajectory | `/watch [stem\|commit]` at either root | A grounded green, amber or red judgement; you decide the response |
| I want to judge whether a plan is worth its complexity | `/yield <plan.md>` in `plan` | Ratings grouped by yield-to-complexity ratio; no plan edit without your instruction |
| I want to inspect growing source files | [`/sweep`](/repo-edu/tooling/sweep/) in `repo-edu` | One file and a proposed verdict; you choose whether to record, plan or refactor it |
| I want to work through flagged refactors | Claude `/refactor` in `repo-edu` | The backlog head and a recommended route; work starts only after your answer |
| I want plain words throughout this chat | `/simple [prompt]` in any chat | The plain-language requirement applies to chat and files for that session |

## What owns this overview?

This page is a mirror. The runner contract in `tools/audit-round/CLAUDE.md`, the launchers under the
plan repo's `home/claude/commands/` and `home/agents/skills/` folders and the workflows they invoke
own command behaviour. Those sources win when this overview differs, and this page must then be
corrected.

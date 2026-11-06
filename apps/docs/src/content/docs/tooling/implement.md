---
title: pnpm audit-round implement
description: Implement ready plan steps with one assigned-coder worker per step
---

Use `pnpm audit-round implement` to land the remaining shares of a ready plan in step order.

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout.

```text
pnpm audit-round implement <stem>                         implement every pending step
pnpm audit-round implement <stem> <step>                  implement one pending step
pnpm audit-round implement <stem> <first>-<last>          implement an inclusive step range
pnpm audit-round implement <stem> -v                      show worker tool calls
pnpm audit-round implement <stem> --resume <step>:<id>    resume the printed failed worker
```

Use `--resume` only with the exact value printed after a failed worker.

## When do I use it?

Use this command after the plan has a ready marker. It is the bounded implementation route when you
do not want the bare full-plan command to continue automatically into implementation audits and
close.

## What does it read?

The runner reads the plan's implementation steps, hosting repositories, ready assignment and both
Git histories. Before each step it checks which repository shares remain. A worker reads the whole
plan and the owning repository instructions. A recovery also reads both worktrees and reopens the
retained session.

## Where does it stop and what do I type?

1. **A worker needs a product ruling.** Read its displayed ruling, type your answer and submit a
   blank line. The same worker resumes and waiting time is not counted as implementation time.
2. **A worker fails.** Fix the named external problem, then run the exact `--resume` command the
   runner prints. The same session continues only while that step still has a pending share.
3. **A step lands.** Type nothing. The runner verifies its share commits before starting the next
   selected step.

## What does it leave behind?

Each started step has `../plan/active/<stem>-impl-<step>-implement.log`. A worker waiting for a
ruling also has `<stem>-impl-<step>-implement-ruling.<tag>.md`. Each complete step leaves one
checked step commit in every hosting repository. Once all shares in a repository have landed, the
runner writes that repository's current `implemented` marker.

## What owns this page?

`tools/audit-round/CLAUDE.md`, `tools/audit-round/src/implement.ts` and the implementation workflow
under `.agents/skills/implement/` own this page.

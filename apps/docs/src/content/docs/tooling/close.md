---
title: /close
description: Archive a completed or abandoned plan and close its implementation episode
---

Use `/close` when you have decided that a plan's loop is finished or abandoned.

## How do I run it?

Run the command from the Repo Edu or plan checkout. Use `$close` for the same command in Codex.

```text
/close                     close the active completed plan
/close <stem>              close that completed plan
/close aborted <stem>      archive an episode that never shipped
```

The stem is optional. Without it, the command closes the plan printed by `pnpm audit-round plan`.

## When do I use it?

Use `/close` after implementation and its audit rounds have settled. Use `aborted` when the episode
never shipped. Invoking the command is the stop call and grants the closing commits; it is not a
preview.

## What does it read?

The command reads the plan, its step and audit history, open deferrals and both repositories' Git
state. It checks for a ready marker, current implementation markers, a whole-plan audit and staged
or uncommitted plan work before moving anything. For a completed plan it then asks the sweep tool
to clear backlog rows whose reason names that plan.

## Where does it stop and what do I type?

1. **A completed plan has no ready marker.** Run `pnpm audit-round ready <stem>` first, or rerun
   `/close aborted <stem>` when the episode did not ship.
2. **An aborted plan has no reason.** Reply with the reason the episode ended.
3. **The implementation has no current whole-plan audit, or no step landed.** Reply whether to
   close it in that state.
4. **Open deferrals remain.** Reply whether to archive the plan with the named deferrals still open.
5. **The plan has uncommitted changes or either index has staged work.** Resolve that work, then run
   `/close` again.
6. **A split peer closes first.** Reply with the shared archive folder name its peers will use.
7. **All checks pass.** The command closes the episode and stops. Type nothing.

## What does it leave behind?

A lone plan moves to `../plan/archive/<stem>/plan.md`. A split peer keeps its filename inside the
shared archive folder chosen for its peers. An aborted plan moves to
`../plan/archive/aborted/<stem>/plan.md` with a reason in `README.md`. Round data moves beside the
plan. Links outside the archive follow the move. The plan repo gets its `<stem>/closed` commit, and
Repo Edu gets an empty closing commit when it hosted a landed step. When the plan had a committed
refactor-backlog row, Repo Edu first gets a separate `chore(sweep)` commit containing only that row
deletion. A matching row added only in the working file is removed without a commit. An aborted
close leaves backlog rows in place. The command deletes the plan's handoffs, claims, audit reports,
review files, phase markers and yield reports from `active/`.

## What owns this page?

`../plan/.agents/skills/close/references/workflow.md` owns loop-close;
`../plan/home/claude/commands/close.md` and the Codex skill launch it.

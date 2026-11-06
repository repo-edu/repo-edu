---
title: /refactor
description: Work through source files that the sweep marked for refactoring
---

Use `/refactor` to inspect the largest flagged source file and choose whether to refactor or plan
it.

## How do I run it?

Run this Claude-only command from the Repo Edu checkout.

```text
/refactor          inspect the queue head and recommend a route
/refactor help     show usage
```

The help forms `-h`, `--help` and `?` also work. There is no Codex counterpart.

## When do I use it?

Use `/refactor` after `/sweep` has flagged one or more source files. It handles the backlog from the
largest file down. The command recommends an inline refactor or a plan, but you choose the route and
nothing changes before your go.

## What does it read?

The command runs `pnpm sweep queue`, reads the first backlog entry and rereads that source file. It
checks the recorded reason, the likely split, shared contracts and any earlier unfinished planning
episode for the file's primary area.

An unfinished prior plan makes the command recommend another plan. A file that no longer matches
its reason gets a recommendation to remove the stale queue entry.

## Where does it stop and what do I type?

1. **The queue is empty.** The command says so and stops.
2. **A current entry needs a route.** Read the explanation and recommendation. Type `Go.` to accept
   it, name the other route or keep discussing the shape.
3. **The inline change is ready to commit.** Approve or refuse the commit when asked. After an
   approved commit, the command removes the old backlog entry.
4. **The plan is ready to commit.** Approve or refuse the plan init when asked. After an approved
   commit, the command links the backlog entry to the plan and prints `pnpm audit-round <stem>`.
5. **One entry is complete.** The command reads the next queue head. Tell it to stop, or continue
   until the queue is empty.

## What does it leave behind?

Before your go, it leaves only the recommendation in chat. An inline route leaves the refactored
source and its checked Git commit, then removes the matching row from
`tools/sweep/refactor-backlog.tsv`. A plan route leaves `../plan/active/<topic>.md` or
`../plan/active/<topic>-widen.md` and changes the backlog reason to name that plan. A stale-entry
route removes the row after your approval.

## What owns this page?

`../plan/home/claude/commands/refactor.md` owns this command. It has no Codex launcher.

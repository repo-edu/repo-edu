---
title: pnpm audit-round close
description: Archive a finished or aborted plan episode and write its closing records
---

Use `pnpm audit-round close` to close one active plan and remove its live sidecars.

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout.

```text
pnpm audit-round close <stem>                      close the named shipped plan
pnpm audit-round close                             use the plan printed by pnpm audit-round plan
pnpm audit-round close <stem> --aborted <reason>   archive an episode that did not ship
pnpm audit-round close <stem> -v                   show assistant tool calls
```

Quote an abort reason that contains spaces.

## When do I use it?

Use this command after implementation and its audits have finished, or when an unshipped episode is
being abandoned. Without `--aborted`, the plan must have a ready marker. The command runs only the
loop-close session; it does not run missing audits first.

## What does it read?

The runner resolves the active plan, its hosting repositories, open deferrals and stem history. The
close workflow reads the plan and plan doctrine, then checks whether a whole-plan implementation
audit is recent enough or needs your explicit confirmation. For a completed plan it also runs
`pnpm sweep done --plan <stem>` from Repo Edu after those checks.

## Where does it stop and what do I type?

1. **Close needs your authority or a deferral decision.** Read the concrete question and answer it
   in the retained close session by running the printed recovery command.
2. **A close action fails.** Correct the named external problem and use the printed recovery command
   when one is available.
3. **Close finishes.** Type nothing. The active plan is no longer in `../plan/active/`.

## What does it leave behind?

A shipped plan moves with its round data to `../plan/archive/<name>/`; an aborted plan moves under
`../plan/archive/aborted/`. The workflow writes each hosting repository's `closed` commit, rewrites
links to the archived plan and removes the topic's active sidecars. Before Repo Edu's closing
marker, it removes backlog rows whose reason names the shipped plan. A deletion present in `HEAD`
lands alone in a `chore(sweep)` commit; a matching working-only row needs no commit. Aborted plans
skip this step. The close session leaves `../plan/active/<stem>-close.<tag>.log` in `active/`.

## What owns this page?

`tools/audit-round/CLAUDE.md` owns the command route; the loop-close workflow under
`../plan/.agents/skills/close/` owns the archive and closing records.

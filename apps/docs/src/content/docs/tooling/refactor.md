---
title: /refactor
description: Work through source files that the sweep marked for refactoring
---

`/refactor` drains the refactor backlog that [`/sweep`](/repo-edu/tooling/sweep/) builds: it takes
the largest flagged file, recommends refactoring it inline or routing it to a plan, and acts only on
your go.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu checkout; there is no Codex counterpart |
| Owner | `../plan/home/claude/commands/refactor.md` |

## Usage

```text
/refactor                          take the largest flagged Repo Edu file, recommend a route, then
                                   on go refactor inline or route to a plan, walk to the next
/refactor help | -h | --help | ?   show the usage
```

`/sweep` flags files one at a time; this command works through the flagged backlog. Its place in
the loop is described on the [Sweep](/repo-edu/tooling/sweep/#the-loop) page.

## What it shows you

The command runs `pnpm sweep queue` and takes the first entry as the head. It rereads that file and
tells you why it was flagged, the recorded reason and its read of the split, then recommends a
route. It weighs whether the change preserves behaviour, whether the target shape is obvious and
whether a shared contract is involved. Those inform the recommendation; the route is your call.

1. **An earlier plan on the file's primary area never reached its `ready` marker.** It recommends a
   plan under a wide name that states the problem, not an inline refactor.
2. **The file no longer matches its reason.** It says so and recommends dropping the stale entry.

Nothing changes before your go. You can push on the route, ask how hard it is or what the seams are
first.

## Your answers

1. **Go on refactor inline.** The assistant refactors the agreed files, folds any new file whose
   surface only extends another into that one, and runs Repo Edu's checks and tests. It asks before
   committing. After an approved commit it runs `pnpm sweep done <path>`, which removes the backlog
   row. It leaves the refactored source in one Repo Edu commit.
2. **Go on route to a plan.** The assistant writes the plan's init while the file is fresh, as
   `../plan/active/<topic>-widen.md` or, when the requirement has one reasonable shape,
   `<topic>.md`. It asks before committing the `<stem>/init`. After an approved commit it runs
   `pnpm sweep flag <path> --reason "planned in <stem>"` and prints `pnpm audit-round <stem>` as the
   next command. It leaves the new plan and a backlog row that names it.
3. **Go on dropping a stale entry.** The assistant runs `pnpm sweep done <path>` and leaves no
   commit.
4. **Name the other route.** Go applies the route you name instead of the recommendation.

## Afterwards

After one entry is done the command reads the next queue head and repeats. Tell it to stop, or let
it run until the queue is empty. A refactored file changes content, so it and any new sibling files
come back in a later `/sweep` for a fresh judgement.

## Early stops

1. **The queue is empty.** `pnpm sweep queue` prints `queue: empty.`; the command says so and stops.
2. **You asked for help.** It prints the usage and stops.

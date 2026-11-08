---
title: /close
description: Archive a completed or abandoned plan and close its implementation episode
---

`/close` is your stop call on a plan: once its implementation and audits have settled, or once you
abandon it, it archives the plan and writes each repo's closing commit.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout; `$close` is the Codex counterpart and [`pnpm audit-round close`](/repo-edu/tooling/runner-close/) the runner entry |
| Owners | `../plan/.agents/skills/close/references/workflow.md` owns loop-close; `../plan/home/claude/commands/close.md` and `../plan/home/agents/skills/close/SKILL.md` launch it |

## Usage

```text
/close                     close the active plan the runner selects
/close <stem>              close that completed plan
/close aborted <stem>      archive an episode that never shipped
```

Without a stem the command closes the plan `pnpm audit-round plan` prints and names it in the
report's first line. Invoking the command grants every closing commit; it is not a preview. Give the
abort reason in the same message when you use `aborted`.

## What it shows you

Before it moves anything, a completed plan's close checks four things. An aborted plan skips the
first three.

1. **A whole-plan audit.** Either repo holds an implementation-audit record over steps 1 to the
   last step that is newer than the last step commit.
2. **Current `implemented` markers.** Each hosting repo has one newer than its last hosted step. A
   missing or stale marker is named once in the report and does not stop the close.
3. **Open deferrals.** It reads them with `pnpm audit-round deferrals <stem>`.
4. **Clean commits.** The plan file has no uncommitted changes and neither repo's index holds
   staged work, so no closing commit carries other work.

## Your answers

The close asks only when a check above needs your word.

1. **The abort reason.** Asked when `aborted` came without one. Your reason goes into the archive's
   `README.md`.
2. **Close without a whole-plan audit, or with no step landed.** A yes closes the plan in that
   state. Anything else stops before any move.
3. **Archive with open deferrals.** A yes archives the plan with the named deferrals still open.
4. **The shared folder for a split peer.** Asked when this plan is the first of its split peers to
   close. Your folder name becomes `../plan/archive/<name>/`, which later peers reuse.

## Early stops

1. **A completed plan has no `ready` marker.** Run `pnpm audit-round ready <stem>`, or rerun as
   `/close aborted <stem>` when the episode never shipped.
2. **The plan is already archived, or a path or unknown word was given.** The command says what it
   expected and stops.
3. **Uncommitted plan changes or staged work.** The command names them. Resolve the work and run
   `/close` again.

## Afterwards

1. **The plan moves.** A lone plan goes to `../plan/archive/<stem>/plan.md`, a split peer keeps its
   filename in the shared folder and an aborted plan goes to `../plan/archive/aborted/<stem>/` with
   its `README.md`. The round data files move beside it, and links outside the archive are
   rewritten to the new path. The plan repo gets one `<stem>/closed` commit.
2. **The refactor backlog is cleared.** For a completed plan the close runs
   `pnpm sweep done --plan <stem>`. When a committed backlog row named the plan, Repo Edu first
   gets a `chore(sweep)` commit holding only that deletion. An aborted plan keeps its rows. See
   [Sweep](/repo-edu/tooling/sweep/#done).
3. **Repo Edu closes its audits.** When Repo Edu hosted a landed step, it gets an empty
   `<stem>/closed` commit.
4. **Sidecars go.** The plan's handoffs, claims, audit, vet and rebuttal files, phase markers and
   yield reports are deleted from `active/`. Transcripts, logs, briefs, rulings and watches stay.

The report lists the archive path, each closing commit, the dropped backlog paths, the rewritten
links, the deleted sidecars and anything it named during the checks.

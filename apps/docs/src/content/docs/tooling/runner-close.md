---
title: pnpm audit-round close
description: Archive a finished or aborted plan episode and write its closing records
---

`pnpm audit-round close` is the runner's entry to loop-close: it runs one close session that
archives an active plan, writes each hosting repo's closing commit and removes the plan's live
sidecars.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root; the close session works in the plan checkout |
| Owners | `tools/audit-round/CLAUDE.md` owns the command; `../plan/.agents/skills/close/references/workflow.md` owns loop-close and its closing records |

## Usage

```text
pnpm audit-round close <stem>                      close the named shipped plan
pnpm audit-round close                             close the plan pnpm audit-round plan prints
pnpm audit-round close <stem> --aborted "<reason>" archive an episode that never shipped
pnpm audit-round close [stem] -v | --verbose       also show assistant tool calls
pnpm audit-round close -h | --help                 show the command's help
```

Quote an abort reason that holds spaces; it becomes the archive's `README.md` text.

## Behaviour

Run it once implementation and its audits have finished, or to abandon an episode. The command does
not run missing audits first; the close session checks for them and asks.

Before any assistant starts, the runner resolves the plan and its open deferrals, the accepted
corrections that still belong in the other repo. A close without `--aborted` needs the plan's
`ready` marker, because the plain archive form records shipped work. One session then runs the
loop-close workflow on the `close` selection in `tools/audit-round/settings.json` and receives the
deferrals in its arguments.

The session's checks, questions and closing records are those of
[`/close`](/repo-edu/tooling/close/): it confirms a whole-plan implementation audit, current
`implemented` markers and clean commits, clears the plan's refactor backlog rows through
`pnpm sweep done --plan <stem>`, moves the plan, rewrites links to it, writes each repo's
`<stem>/closed` commit and deletes the plan's sidecars. An aborted plan skips the audit checks and
keeps its backlog rows.

The round-data files are the one part the runner does itself. Once the session has moved the plan,
the runner moves `<stem>-plan-rounds.json` and `<stem>-impl-rounds.json` from `../plan/active/` into
the plan's archive folder and commits them as a second `<stem>/closed` record. While they sit in
`active/` Git ignores them, so a session that forgot the move would lose the plan's whole round
account to the next hand clean-up.

## Output

1. **The archive.** A shipped plan moves to `../plan/archive/<name>/` with its round-data files. An
   aborted plan moves under `../plan/archive/aborted/` with a `README.md` holding the reason.
2. **Closing commits.** The plan repo's `<stem>/closed` archive commit, the runner's
   `<stem>/closed` commit of the round-data files when the plan had any, Repo Edu's empty
   `<stem>/closed` commit when Repo Edu hosted a landed step and, before it, a `chore(sweep)` commit
   when a committed backlog row named the plan. The runner prints `Committed <sha>: <subject>` for
   its own commit.
3. **The close log** at `../plan/active/<stem>-close.<tag>.log`, which stays after the close.

A close session that finishes with the plan still in `../plan/active/` fails, because the move is
the close. A finished session whose plan the runner cannot find once under `../plan/archive/` fails
too, because the round data then has no folder to join.

## Refuses when

The runner prints `audit-round: <reason>` and starts no session. The empty abort reason in item 3 is
a refusal from the argument parser, which prints its own `error:` line without that prefix. An
argument refusal exits with status 2 and any other with status 1.

1. **The plan has no ready marker and no `--aborted` was given.** `<stem>.md has no ready marker.
   Run pnpm audit-round ready first, or close it with --aborted <reason>.`
2. **The plan is archived.** `No active plan named <stem> at <active folder>. An archived plan is
   already closed.`
3. **The abort reason is empty**, or the stem is a path.

## Stop and recovery

1. **The close needs your answer.** It asks, for example, to close without a whole-plan audit or to
   archive with open deferrals. The session fails with the question and the runner prints a
   `Resume:` command. Run it and answer in that session.
2. **A close action fails.** Fix the outside problem it names, such as uncommitted plan changes or
   staged work, then run the printed `Resume:` command, or the same close command when none was
   printed. See [Recover a run](/repo-edu/tooling/recover-run/).

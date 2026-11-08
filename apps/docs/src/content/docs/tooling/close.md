---
title: /close
description: Run the runner's close from chat to archive a completed or abandoned plan
---

`/close` is your stop call on a plan from chat. It runs
[`pnpm audit-round close`](/repo-edu/tooling/runner-close/) and relays its result; the chat session
does not close the plan by hand.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout; `$close` is the Codex counterpart |
| Owners | `../plan/.agents/skills/close/references/workflow.md` owns loop-close; `../plan/home/claude/commands/close.md` and `../plan/home/agents/skills/close/SKILL.md` launch the runner |

## Usage

```text
/close                     close the active plan the runner selects
/close <stem>              close that completed plan
/close aborted <stem>      archive an episode that never shipped
```

Give the abort reason in the same message when you use `aborted`; the session asks for it when none
was given. Invoking the command grants every closing commit; it is not a preview.

## What it does

1. Maps your words to the runner command: `pnpm audit-round close`, `pnpm audit-round close <stem>`
   or `pnpm audit-round close <stem> --aborted "<reason>"`.
2. Runs it in the background and waits. The close session can take several minutes.
3. Reports the archive path, each `Committed` line and the close log's path from the runner's last
   lines.

## Why chat does not close by hand

The plan's round-data files are gitignored while they sit in `../plan/active/`. A chat session that
closed by hand once forgot to move them, and the plan's whole round account went with the next hand
clean-up. The runner moves and commits those files itself after its close session, so every close
has to go through it.

## When the runner stops

1. **The close needs your answer**, for example to close without a whole-plan audit or to archive
   with open deferrals. The session relays the question and the printed `Resume:` command. Answer in
   that resumed session. Once it has moved the plan, run `pnpm audit-round close <stem>` again to
   finish the round-data move.
2. **The runner refuses or a close action fails.** The session relays the reason and any recovery
   command as printed. See [`pnpm audit-round close`](/repo-edu/tooling/runner-close/) for the
   refusals and [Recover a run](/repo-edu/tooling/recover-run/).

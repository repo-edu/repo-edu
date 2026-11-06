---
title: /yield-vet
description: Check another assistant's saved yield ratings and propose corrections
---

Use `/yield-vet` to review another assistant's yield report before relying on its ratings.

## How do I run it?

Run the command in the plan checkout. Use `$yield-vet` for the same command in Codex.

```text
/yield-vet                         select the sole eligible report
/yield-vet <yield-report.md>       review that report
/yield-vet help                    show usage
```

The report must come from the other assistant.

## When do I use it?

Use `/yield-vet` after `/yield` when you want an independent check of every decision's user benefit,
maintenance burden and computed ratio. The review proposes rating changes but does not change the
source report or plan.

## What does it read?

The command reads the yield report, the plan it names and the repository evidence needed to check
the ratings. It compares each decision with the same simplest coherent alternative used by the
initial report and notes relevant changes since that report's recorded revision.

## Where does it stop and what do I type?

1. **One eligible report exists.** The command names it, writes the review and stops for discussion.
2. **Several eligible reports exist.** Reply with the report path to review.
3. **No eligible report exists, or the named report is your own assistant's.** Supply a report from
   the other assistant.
4. **The review is complete.** Ask the original report writer to run
   `/yield-rebut <yield-vet.md>` or `$yield-rebut <yield-vet.md>` when any rating changed.

## What does it leave behind?

The command prints one Agree-or-Change table in chat and writes
`../plan/active/<stem>-yield-2-vet.<tag>.md`. The file is gitignored. An existing output at that
path is linked and left unchanged. No plan file, source rating or commit changes.

## What owns this page?

`../plan/home/agents/skills/yield/references/review.md` owns yield vetting;
`../plan/home/claude/commands/yield-vet.md` provides the Claude launcher.

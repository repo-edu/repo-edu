---
title: /yield-rebut
description: Let the original yield writer reconsider ratings disputed by the vet
---

Use `/yield-rebut` to answer another assistant's proposed changes to your assistant's yield report.

## How do I run it?

Run the command in the plan checkout and in the assistant that wrote the initial yield report. Use
`$yield-rebut` for the same command in Codex.

```text
/yield-rebut                       select the sole eligible vet
/yield-rebut <yield-vet.md>        answer that vet
/yield-rebut help                  show usage
```

The vet must come from the other assistant and point to a report from the current assistant.

## When do I use it?

Use `/yield-rebut` when a yield vet changed a rating or qualified an agreement. The original writer
rechecks the evidence and answers Adopt, Keep or Revise. It does not defend the first report merely
because it wrote it.

## What does it read?

The command reads the selected vet, the initial report linked in its opening, the plan and the
evidence needed to recheck disputed ratings. Unqualified agreements need no answer.

## Where does it stop and what do I type?

1. **One eligible vet exists.** The command names it, writes the rebuttal and stops for discussion.
2. **Several eligible vets exist.** Reply with the vet path to answer.
3. **No eligible vet exists, or the authorship is wrong.** Supply the other assistant's vet of this
   assistant's report.
4. **The rebuttal is complete.** Ask the other assistant to run
   `/yield-final <yield-rebut.md>` or `$yield-final <yield-rebut.md>`.

## What does it leave behind?

The command prints its Adopt, Keep or Revise table in chat and writes
`../plan/active/<stem>-yield-3-rebut.<tag>.md`. The file is gitignored. An existing output at that
path stays unchanged. The initial report and plan are not changed, and no commit is authorised.

## What owns this page?

`../plan/home/agents/skills/yield/references/review.md` owns yield rebuttals;
`../plan/home/claude/commands/yield-rebut.md` provides the Claude launcher.

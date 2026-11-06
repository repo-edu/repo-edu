---
title: /yield-final
description: Reconcile a yield report, vet and rebuttal into complete final ratings
---

Use `/yield-final` to produce the current complete rating set after the other assistant's rebuttal.

## How do I run it?

Run the command in the plan checkout and in the assistant that did not write the rebuttal. Use
`$yield-final` for the same command in Codex.

```text
/yield-final                         select the sole eligible rebuttal
/yield-final <yield-rebut.md>        reconcile that rebuttal
/yield-final help                    show usage
```

The rebuttal must come from the other assistant.

## When do I use it?

Use `/yield-final` after yield vetting and rebuttal. It reconciles the initial ratings, review,
reply and later evidence into one complete recommendation. Run it again when later evidence changes
that recommendation.

## What does it read?

The command reads the rebuttal, its linked vet and initial report, the current plan and the evidence
needed to settle disputed ratings. When updating, it also reads this writer's existing final report
so supported later conclusions are not lost.

## Where does it stop and what do I type?

1. **One eligible rebuttal exists.** The command names it, writes the final report and stops for
   discussion.
2. **Several eligible rebuttals exist.** Reply with the rebuttal path to use.
3. **No eligible rebuttal exists, or the named rebuttal is this assistant's.** Supply the other
   assistant's rebuttal.
4. **The final report is complete.** Discuss the recommendation. Applying any plan change remains a
   separate instruction.

## What does it leave behind?

The command prints the complete grouped ratings in chat and writes
`../plan/active/<stem>-yield-4-final.<tag>.md`. It may replace only this writer's exact final path.
Initial reports, vets, rebuttals and other writers' final reports stay unchanged. The command makes
no plan edit and authorises no commit.

## What owns this page?

`../plan/home/agents/skills/yield/references/final.md` owns the final report;
`../plan/home/claude/commands/yield-final.md` provides the Claude launcher.

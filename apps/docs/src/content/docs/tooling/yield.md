---
title: /yield
description: Grade each plan decision by user benefit, maintenance burden and their ratio
---

Use `/yield` to judge whether each numbered plan decision earns the maintenance burden it adds.

## How do I run it?

Run the command in the plan checkout. Use `$yield` for the same command in Codex.

```text
/yield <plan.md>      grade every numbered decision in that plan
/yield help           show usage
```

Pass the plan file you want graded.

## When do I use it?

Use `/yield` when a plan is complete enough to compare each decision with the simplest coherent
version that leaves it out. The report grades practical benefit, net maintenance burden and the
ratio between them. It does not edit the plan.

## What does it read?

The command reads the complete plan and the repository evidence needed to check what each decision
gives the user and what future work must preserve. It grades every numbered decision and keeps
dependent decisions coherent in the comparison.

It may use `BOUNDARIES.md` or a dated user ruling as an anchor, but an anchor does not change the
rating by itself.

## Where does it stop and what do I type?

1. **You requested help.** The command prints usage and stops.
2. **The tagged report already exists.** The command links to it without replacing it. Run an
   optional `/yield-vet` or continue the discussion.
3. **The report is new.** The command prints the grouped ratings, links to the saved report and
   waits. Discuss the ratings, run `/yield-vet <report-file>` or say which proposed cuts to apply.

## What does it leave behind?

The command writes the complete ratings to chat and to
`../plan/active/<stem>-yield-1-report.<tag>.md`. The report is gitignored and allocates no audit
round. It stays unchanged after writing. Applying a cut is separate work that changes the plan and
lands a plan-round commit.

## What owns this page?

`../plan/home/agents/skills/yield/references/workflow.md` owns the ratings and report;
`../plan/home/claude/commands/yield.md` provides the Claude launcher.

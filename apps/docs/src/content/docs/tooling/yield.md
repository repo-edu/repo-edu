---
title: Yield
description: Grade plan decisions by user benefit and maintenance burden, then review the ratings across Claude, Codex and Gemini
---

The yield chain grades every numbered decision of a plan on what it gives the user against what it
costs to maintain, so you can see which decisions earn their machinery before you cut any.

| Fact | Detail |
| --- | --- |
| Chat commands | Use `/yield`, `/yield-vet`, `/yield-rebut` and `/yield-final` in Claude or Antigravity. Use the same names with `$` in Codex. Start the initial report in the plan checkout. |
| Owners | `../plan/home/agents/skills/yield/references/workflow.md` owns grading, reports and applying cuts; `review.md` beside it owns the vet and rebuttal and `final.md` the final report; the launchers live in `../plan/home/claude/commands/` and `../plan/home/agents/skills/` |

## Usage

```text
/yield <plan.md>                grade that plan's decisions and save a yield report
/yield help                     show this usage

/yield-vet [yield-report.md]    review ratings in chat and a file
/yield-vet help                 show this usage

/yield-rebut [yield-vet.md]     answer the vet in chat and a file
/yield-rebut help               show this usage

/yield-final [yield-rebut.md]   read a different vendor's rebuttal and write final ratings
/yield-final help               show this usage
```

## Why it exists

Audit rounds weigh each finding on its own, so a plan can keep machinery whose user benefit is small
while nobody prices its upkeep. The yield report asks that question once per decision, for the
whole plan, and leaves the cut to you. It is an occasional hand-run review: it allocates no audit
round, uses no severity tiers and changes no plan until you say which cuts to apply.

## How a decision is graded

Each decision is compared with the simplest coherent version of the plan that leaves it out.
Dependent decisions stay working in that comparison, and a benefit two decisions share is counted
once. Every decision gets three values:

1. **Yield**, the practical benefit to you: `none` (0), `low` (1), `medium` (2), `high` (3) or
   `very high` (4). Very high means the decision enables a required workflow that is impossible
   today or removes a failure that prevents its reliable use. Yield is graded on what you get,
   never on what the decision's own reason claims, because a round can invent the requirement a
   later round reads as justification.
2. **Complexity**, the net change in maintenance burden: `minus-high` (−3) to `high` (3), with
   `none` for no material change. This is the same scale audit findings and commit marks use, and
   it measures what future work must understand and preserve, not the effort to build.
3. **Ratio**, looked up from `yield − complexity`: 4 or more is excellent, then very good, good,
   satisfactory, marginal at 0, weak at −1 and poor at −2 or below. A zero score is marginal
   because it leaves no surplus to pay for planning and audits.

A boundary entry or a dated user ruling behind a decision is shown beside it but changes none of
the three values.

## The chain

Use the first letter of each writer's tag to choose who can do the next review.
Claude uses `a`, Codex uses `o` and Gemini in Antigravity uses `g`.

1. **`/yield`** writes the initial report in any of the three apps.
2. **`/yield-vet`** runs with a different vendor and checks every rating.
3. **`/yield-rebut`** runs with the initial report's vendor and answers the selected vet.
4. **`/yield-final`** reconciles all three reports. Either of the other two vendors can finalise
   a rebuttal. For example, if Claude rebuts a Codex vet, Codex or Gemini can write the final.

Every step after the first is optional. Each command prints its tables and explanations in chat,
links the saved report and stops for discussion. No command edits the plan or lands a commit until
you say which cuts to apply.

## Report files

All reports live in `../plan-evidence/active/` and are named
`<stem>-yield-<order>-<style>.<tag>.md`. The order is fixed per style: `1-report`, `2-vet`,
`3-rebut` and `4-final`, so a skipped step leaves a gap. Putting `yield` before the number keeps
the reports together in a sorted list, apart from numbered audit rounds. The tag is the writer's
own capability tag.

Each report opens with the plan, the plan repo's six-character HEAD, whether the plan had
uncommitted changes and the writer's model and effort. Reviews link to the report they answer. The
initial report, vet and rebuttal are saved once. When a vet or rebuttal already exists, the
command links to it and names the input in its opening. For a vet that is the initial report.
For a rebuttal it is the vet answered. From either checkout, a writer can create or revise its
own `../plan-evidence/active/<stem>-yield-4-final.<tag>.md`. Loop-close moves all reports with
the plan's other round files into `../plan-evidence/archive/<stem>/`.

## `/yield`

### What it shows you

The command reads the whole plan and the repository evidence it needs, then groups the decisions
by ratio, best group first, one table per ratio value in plan order. Under each table every
decision gets a short account of the obligations it adds and removes against the comparison. Every
`poor` decision also gets the simplest mechanism that still serves its yield, deletion included; a
mechanism that gives you more work does not count as simpler.

### Your answers

1. **Discuss a rating.** The assistant answers from its evidence and changes nothing.
2. **Run `/yield-vet <report-file>`** with a different vendor for an independent check.
3. **Say which cuts to apply.** The assistant edits the plan and lands one `<stem>/plan-audit`
   commit with one bullet per cut, naming the superseded decision and your ruling with its date.
   It then writes the handoff for the next round.

### Early stops

1. **The report already exists.** The command links to it and leaves it unchanged.

## `/yield-vet`

### What it shows you

The vet reads the yield report, the plan it names and the evidence for each rating, and notes plan
changes since the report's recorded revision. It shows one table in plan order with Decision,
Verdict, Yield, Complexity and Ratio. Each verdict is **Agree** or **Change**, the three values are
the ones it recommends, and each Change is explained below the table. A decision missing from the
report appears as a Change.

### Your answers

1. **Discuss the review.** Nothing changes.
2. **Run `/yield-rebut <yield-vet.md>`** or `$yield-rebut` with the initial report's vendor when a
   rating changed.

### Early stops

1. **Several eligible reports exist and you omitted the path.** Choose a report from the list.
2. **No eligible report was found or selected.** Supply an initial report from a different vendor.

## `/yield-rebut`

### What it shows you

The rebuttal reads the vet and the report linked in its opening, then rechecks each Change and each
qualified Agree against the evidence. It does not defend a rating because it wrote it. Its table
gives each disputed decision one response: **Adopt** takes the vet's values, **Keep** retains the
original and **Revise** gives a different correction. The resulting values and a short reason
follow below the table. When nothing needs an answer it says so and still saves the reply.

### Your answers

1. **Discuss the rebuttal.** Nothing changes.
2. **Run `/yield-final <yield-rebut.md>`** or `$yield-final` with a different vendor.

### Early stops

1. **Several eligible vets exist and you omitted the path.** Choose a vet from the list.
2. **No eligible vet was found or selected.** Supply a different vendor's vet of an initial
   report by the vendor you are using.

## `/yield-final`

### What it shows you

The final report reads the rebuttal, its linked vet and initial report, the current plan and any
later evidence or rulings. The rebuttal is evidence, not an automatic winner. Every current
decision gets one set of values in the same grouped tables as the initial report. It explains only
disputed or non-obvious ratings and changed conclusions, and adds the simplest mechanism for each
`poor` rating. A remaining disagreement is noted beside its decision.

### Your answers

1. **Discuss the recommendation.** Nothing changes.
2. **Say which cuts to apply.** Applying them follows the same route as under `/yield`.
3. **Run `/yield-final` again** when later evidence changes the recommendation. It replaces this
   writer's final report as a whole and keeps supported later conclusions.

### Early stops

1. **Several eligible rebuttals exist and you omitted the path.** Choose a rebuttal from the list.
2. **No eligible rebuttal was found or selected.** Supply a rebuttal from a different vendor.

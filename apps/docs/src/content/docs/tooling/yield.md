---
title: Yield
description: Grade each plan decision by user benefit, maintenance burden and their ratio, then review the grades across both assistants
---

The yield chain grades every numbered decision of a plan on what it gives the user against what it
costs to maintain, so you can see which decisions earn their machinery before you cut any.

| Fact | Detail |
| --- | --- |
| `/yield`, `/yield-vet`, `/yield-rebut` and `/yield-final` run in | Claude chat in the plan checkout; `$yield`, `$yield-vet`, `$yield-rebut` and `$yield-final` are the Codex counterparts |
| Owners | `../plan/home/agents/skills/yield/references/workflow.md` owns grading, reports and applying cuts; `review.md` beside it owns the vet and rebuttal and `final.md` the final report; the launchers live in `../plan/home/claude/commands/` and `../plan/home/agents/skills/` |

## Usage

```text
/yield <plan.md>                grade that plan's decisions and save a yield report
/yield help                     show this usage

/yield-vet [yield-report.md]    review ratings in chat and a file
/yield-vet help                 show this usage

/yield-rebut [yield-vet.md]     answer the vet in chat and a file
/yield-rebut help               show this usage

/yield-final [yield-rebut.md]   read the other rebuttal and write final ratings
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

The four commands alternate between the two assistants, so no assistant reviews its own grades.

1. **`/yield`** writes the initial report.
2. **`/yield-vet`**, in the other assistant, checks every rating and proposes changes.
3. **`/yield-rebut`**, in the first assistant, rechecks each disputed rating.
4. **`/yield-final`**, in the other assistant again, reconciles all three into one complete rating
   set.

Every step after the first is optional. Each command prints its tables and explanations in chat,
links the saved report and stops for discussion. No command edits the plan or lands a commit until
you say which cuts to apply.

## Report files

All reports live in `../plan/active/`, are gitignored and are named
`<stem>-yield-<order>-<style>.<tag>.md`. The order is fixed per style: `1-report`, `2-vet`,
`3-rebut` and `4-final`, so a skipped step leaves a gap. Putting `yield` before the number keeps
the reports together in a sorted list, apart from numbered audit rounds. The tag is the writer's
own capability tag; its vendor letter, `a` for Claude or `o` for Codex, decides which assistant may
run the next step.

Each report opens with the plan, the plan repo's six-character HEAD, whether the plan had
uncommitted changes and the writer's model and effort. Reviews link to the report they answer. The
initial report, vet and rebuttal never change once written; when the output already exists, the
command links to it instead. Only a writer's own final report may be rewritten. Loop-close deletes
all of them with the plan's other sidecars.

## `/yield`

### What it shows you

The command reads the whole plan and the repository evidence it needs, then groups the decisions
by ratio, best group first, one table per ratio value in plan order. Under each table every
decision gets a short account of the obligations it adds and removes against the comparison. Every
`poor` decision also gets the simplest mechanism that still serves its yield, deletion included; a
mechanism that gives you more work does not count as simpler.

### Your answers

1. **Discuss a rating.** The assistant answers from its evidence and changes nothing.
2. **Run `/yield-vet <report-file>`** in the other assistant for an independent check.
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
2. **Ask the report's writer to run `/yield-rebut <yield-vet.md>`** or `$yield-rebut` when a rating
   changed.

### Early stops

1. **Several eligible reports exist.** The vet lists them and asks which to use; it never picks by
   recency. Reply with the report path.
2. **No eligible report exists, or the named report is this assistant's.** Supply a report from the
   other assistant.

## `/yield-rebut`

### What it shows you

The rebuttal reads the vet and the report linked in its opening, then rechecks each Change and each
qualified Agree against the evidence. It does not defend a rating because it wrote it. Its table
gives each disputed decision one response: **Adopt** takes the vet's values, **Keep** retains the
original and **Revise** gives a different correction. The resulting values and a short reason
follow below the table. When nothing needs an answer it says so and still saves the reply.

### Your answers

1. **Discuss the rebuttal.** Nothing changes.
2. **Ask the other assistant to run `/yield-final <yield-rebut.md>`** or `$yield-final`.

### Early stops

1. **Several eligible vets exist.** Reply with the vet path to answer.
2. **No eligible vet exists, or the authorship is wrong.** Supply the other assistant's vet of this
   assistant's report.

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

1. **Several eligible rebuttals exist.** Reply with the rebuttal path to use.
2. **No eligible rebuttal exists, or the named rebuttal is this assistant's.** Supply the other
   assistant's rebuttal.

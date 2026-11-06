---
title: Run an audit round
description: Choose a target and carry one audit through vet, rebuttal, fix and series judgement
---

An audit round turns one bounded plan, implementation range or commit set into a checked report and
durable outcome.

## Should I run one phase or a series?

Use [`/audit`](/repo-edu/tooling/audit/) when you want one report before deciding what follows. It
runs only the audit phase. You then run [`/vet`](/repo-edu/tooling/vet/),
[`/rebut`](/repo-edu/tooling/rebut/) when needed and [`/fix`](/repo-edu/tooling/fix/) by hand.

Use `pnpm audit-round round ...` when you want the runner to carry the report through those phases
and let a fresh judge decide whether another auditor is useful. Use the bare
[`pnpm audit-round <stem>`](/repo-edu/tooling/full-plan-run/) when the plan may also proceed through
later lifecycle stages without a planned reading between them.

## What can a round target?

```text
pnpm audit-round round <stem>                 planning round before implementation
pnpm audit-round round <stem> plan            planning round after a step has landed
pnpm audit-round round <stem> <n>             one implementation step
pnpm audit-round round <stem> <a>-<b>         one implementation step range
pnpm audit-round round <stem> 2,3-5,6-7       several ranges, one series each
pnpm audit-round round <commits>               work outside a plan
```

Prefix a plan-repository commit with `plan@`. Unprefixed commit references belong to Repo Edu. An
omitted target selects the active plan whose stem commit is newest across both repositories.

## What happens inside one round?

1. **Audit.** One assistant reads the bounded target and writes a report with findings or a clean
   result.
2. **Vet.** The other assistant checks each finding for authority, evidence and fit. A clean report
   skips this phase.
3. **Rebuttal.** The auditor answers only revisions, drops and ruling items. All-Accept vets skip
   this phase.
4. **Fix.** The selected fixer reconciles both readings, asks about any real open decision, applies
   the settled corrections and lands the records.
5. **Watch and judge.** Where due, the watch checks the episode's trajectory. A fresh judge then
   chooses whether another listed auditor should read the same target.

The audit, vet and rebuttal are read-only. The fix is the phase that receives authority to change
the judged repositories.

## When does an automatic series stop?

An automatic series stops when the judge returns its lifecycle answer, the configured round maximum
is reached, a phase fails, a ruling is left unanswered, a watch grades red or a fix changes the
plan's phase. A submitted ruling reply resumes the same fix before the series continues.

For a widening plan, the judge may recommend settle. During detailing it may recommend ready. On an
implementation or commit target it may stop. These answers do not make the user's lifecycle call;
the bare full-plan run acts on settle and ready only because its invocation granted them in advance.

## How do I follow one round?

The terminal shows the target, phase selection, elapsed time and each phase's Markdown. The plan
checkout's `active/` folder keeps the transcript, tool log and retained round data. Use
[Find round outputs](/repo-edu/tooling/find-round-outputs/) when you need the report, a review twin
or the complete conversation after the terminal has scrolled.

## What owns this page?

`tools/audit-round/CLAUDE.md` owns target resolution and sequencing; the audit, vet, rebuttal and
fix workflows under `.agents/skills/` own their phases.

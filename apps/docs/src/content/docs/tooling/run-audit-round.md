---
title: Run an audit round
description: Choose a target and carry one audit through vet, rebuttal, fix and the series decision
---

An audit round turns one bounded plan, implementation range or commit set into a checked report and
a durable outcome, with a second assistant checking the first before anything lands.

| Fact | Detail |
| --- | --- |
| Owners | `tools/audit-round/CLAUDE.md` owns target resolution and sequencing; the audit, vet, rebuttal and fix workflows under `.agents/skills/` own their phases |

## Why a round has four phases

One reading by one assistant can be wrong in a confident voice. The round therefore splits the
work so no phase checks itself:

1. **Audit.** One assistant reads the bounded target and writes a report with findings or a clean
   result.
2. **Vet.** The other assistant checks each finding for authority, evidence and fit from a fresh
   context. A clean report skips this phase.
3. **Rebuttal.** The auditor answers only revisions, drops and ruling items, on the same model and
   effort as the audit, because the answer is the auditor's. A vet that accepts every finding skips
   this phase.
4. **Fix.** The fixer, the coder the plan's ready marker assigns or else the first listed coder,
   reconciles both readings, asks about any real open
   decision, applies the settled corrections and lands the records.

The audit, vet and rebuttal are read-only. The fix is the phase that receives authority to change
the judged repositories. Where due, a watch then checks the episode's trajectory. In an automatic
series the runner applies fixed rules to decide whether another assistant needs a current read.

## One phase or a series

Use [`/audit`](/repo-edu/tooling/audit/) when you want one report before deciding what follows. It
runs only the audit phase. You then run [`/vet`](/repo-edu/tooling/vet/),
[`/rebut`](/repo-edu/tooling/rebut/) when needed and [`/fix`](/repo-edu/tooling/fix/) by hand.

Use [`pnpm audit-round round ...`](/repo-edu/tooling/runner-round/) when you want the runner to
carry the report through those phases and apply the automatic-series rules. Use the bare
[`pnpm audit-round <stem>`](/repo-edu/tooling/full-plan-run/) when the plan may
also proceed through later lifecycle stages without a planned reading between them.

## Targets

```text
pnpm audit-round round <stem>                 round selected from the plan's history
pnpm audit-round round <stem> plan            planning round after a step has landed
pnpm audit-round round <stem> <n>             one implementation step
pnpm audit-round round <stem> <a>-<b>         one implementation step range
pnpm audit-round round <stem> 2,3-5,6-7       several ranges, one series each
pnpm audit-round round <commits>              work outside a plan
```

Prefix a plan-repository commit with `plan@`. Unprefixed commit references belong to Repo Edu. An
omitted target selects the active plan whose stem commit is newest across both repositories.

Before implementation, a bare stem selects the planning round its history calls for. After every
step share and implementation marker has landed, it runs the plan's listed audit ranges and then
the full implementation range.

## When a series stops

An automatic series stops when every assistant in the pool has a current read, the configured round
maximum is reached, a phase fails, a ruling is left unanswered, a watch grades red or a fix changes
the plan's phase. A submitted ruling reply resumes the same fix before the series continues.

The runner answers stop after the read floor. For a widening plan, the retained settling line may
instead answer settle. During detailing before the ready marker, the answer is ready. These answers
do not make the user's lifecycle call; the bare full-plan run acts on settle and ready only because
its invocation granted them in advance.

## Following a round

The terminal shows the target, phase selection, elapsed time and each phase's Markdown. The plan
checkout's `active/` folder keeps the transcript, tool log and retained round data. Use
[Find round outputs](/repo-edu/tooling/find-round-outputs/) when you need the report, a review twin
or the complete conversation after the terminal has scrolled.

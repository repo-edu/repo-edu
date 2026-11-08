---
title: pnpm audit-round models
description: Compare retained auditor and coder results without starting an assistant
---

`pnpm audit-round models` reads the evidence the runner has kept on every configured auditor and
coder, so you can change the `auditors` or `coders` list in `tools/audit-round/settings.json` on
recorded yield and time rather than on impressions.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/CLAUDE.md`, `tools/audit-round/src/models.ts` and its evidence and comparison modules |

## Usage

```text
pnpm audit-round models              print the auditor, coder and disproved-finding read-out
pnpm audit-round models --all        also print the plans excluded from coder evidence
pnpm audit-round models -h | --help  show the command's help
```

## Behaviour

The command reads every checked planning and implementation round-data file in the active folder
and the closed-plan archive, and joins it with the step, ready and closed records of both Git
histories. Commit-series data is not part of the read-out. It starts no assistant.

The read-out compares rather than ranks by taste:

1. **Auditors** have separate planning and implementation tables. Every complete round enters its
   auditor's class. A row is named as the winner of a class only when it has at least five rounds in
   both classes, clearly leads every eligible row in that class and no eligible row clearly leads it
   in the other. A thinner row stays visible, states its shortage and blocks nothing.
2. **Coders** are compared on closed plans whose archived step list the current grammar reads, whose
   every hosted share has a readable model record and whose whole-plan audit follows the final
   share. A step record without active time falls back to the span from the ready marker or the
   previous step to that step's later share commit.
3. **Disproved findings**, recorded with
   [`pnpm audit-round disprove`](/repo-edu/tooling/disprove/), count against the auditor that wrote
   them and remove a kept finding from coder evidence.

A recommendation appears only where the observed ranges of the admitted rows separate and yield does
not conflict with a clear time lead. A winner outside the current settings lists is labelled.

## Output

Terminal Markdown in up to five sections: planning auditors, implementation auditors, coders,
disproved findings and, under `--all`, excluded plans. Each comparison opens with its verdict line,
lists thin rows and out-of-settings winners as bullets and then prints its table, so no number
appears in prose.

1. **Auditor tables** sort by yield per round, then by time. They count complete rounds and kept,
   per-round, dropped, downgraded and later-disproved A and B findings. Wrong claims is the last
   three as a percentage of all four. Cost is audit plus rebuttal time per round.
2. **The coder table** sorts by kept A and B findings per step, fewest first, then by time. It shows
   plans, timed plans, steps, kept findings, kept per step and time per step.
3. **Disproved findings** print as a numbered table per auditor with each reason's first sentence,
   then the full reasons as a numbered list, numbered across the section.
4. **Excluded plans** group by reason with their recorded models.

The command writes no round file or round data. When `tools/audit-round/settings.json` is missing,
it creates it from the committed defaults, as every command that reads settings does.

## Refuses when

Retained round data or the settings file fails validation. The runner prints
`audit-round: <reason>` and exits with status 1, leaving an invalid settings file unchanged. Correct
a settings error in the file. Round data is machine-written and never edited by hand.

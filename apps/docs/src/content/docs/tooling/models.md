---
title: pnpm audit-round models
description: Compare retained auditor and coder results without starting an assistant
---

`pnpm audit-round models` reads the kept evidence for each auditor in every class where it has a
complete round and for each coder with an admitted plan. You can use the recorded yield and time to
change the `auditors` or `coders` list in `tools/audit-round/settings.json`.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/CLAUDE.md`, `tools/audit-round/src/models.ts` and its evidence and comparison modules |

## Usage

```text
pnpm audit-round models              print the auditor, coder and disproved-finding read-out
pnpm audit-round models --all        also print measured per-plan data and excluded plans
pnpm audit-round models -h | --help  show the command's help
```

## Behaviour

The command reads every checked planning and implementation round-data file in the active folder
and the closed-plan archive, and joins it with the step, ready and closed records of both Git
histories. Commit-series data is not part of the read-out. It starts no assistant.

The read-out compares rather than ranks by taste:

1. **Auditors** have separate planning and implementation tables. Each row compares the model with
   the other auditors only on plans they share. Each side's kept findings are divided by its rounds
   on those plans, so a model is not rewarded for auditing easier plans than the others. A model
   with fewer than five shared plans in a class is printed in a second table below the main one.
2. **Coders** are compared on closed plans whose archived step list the current grammar reads, whose
   every hosted share has a readable model record and whose whole-plan audit follows the final
   share. A step record without active time falls back to the span from the ready marker or the
   previous step to that step's later share commit. A plan whose step time cannot be read is
   excluded.
3. **Disproved findings**, recorded with
   [`pnpm audit-round disprove`](/repo-edu/tooling/disprove/), count against the auditor that wrote
   them and remove a kept finding from coder evidence.

The auditor tables carry no evaluation and no recommendation. The best model is the top row of the
main table, and the time stands in its own column. Coder recommendations keep the direct
observed-range rule.

Under `--all`, the read-out also prints the measured planning and implementation data behind the
auditor rows. Each table has one row per plan and auditor with its rounds, all four finding outcomes
and mean minutes per round. A detached disproved finding has a zero-round row when its auditor did
not audit that plan.

## Output

Terminal Markdown in four core sections: planning auditors, implementation auditors, coders and
disproved findings. Under `--all`, planning rounds by plan, implementation rounds by plan and
excluded plans follow. Each auditor class prints its main table, then a second table under
`Fewer than 5 shared plans:` when a model is below that floor.

1. **Auditor tables** sort by the gap between the model's findings per round and the other auditors'
   findings per round, then by time. Each side shows its kept A and B findings in rounds, such as
   `16 in 79`, beside the per-round figure that division gives. Wrong claims is dropped, downgraded
   and disproved as a percentage of all four finding outcomes. Cost is audit plus rebuttal time per
   complete round. Planning also reports a model whose first-round count differs from its even share
   by more than a tenth of its shared plans and by at least two. A current auditor gets a bullet
   above the main table, where `--first` can correct the count. Other models share one line below
   the last table.
2. **The coder table** sorts by kept A and B findings per step, fewest first, then by time. It shows
   plans, steps, kept findings, kept per step and time per step.
3. **Disproved findings** print as a numbered table per auditor with each reason's first sentence,
   then the full reasons as a numbered list, numbered across the section.
4. **Rounds by plan** sort by plan and then model. Their finding columns sum to the class totals
   behind wrong claims, and their kept findings and rounds on shared plans sum to both count cells.
5. **Excluded plans** group by reason with their recorded models.

The command writes no round file or round data. When `tools/audit-round/settings.json` is missing,
it creates it from the committed defaults, as every command that reads settings does.

## Refuses when

Retained round data or the settings file fails validation. The runner prints
`audit-round: <reason>` and exits with status 1, leaving an invalid settings file unchanged. Correct
a settings error in the file. Round data is machine-written and never edited by hand.

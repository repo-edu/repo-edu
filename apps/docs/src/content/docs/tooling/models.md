---
title: pnpm audit-round models
description: Compare retained auditor, vetter and coder results without starting an assistant
---

`pnpm audit-round models` reads the kept evidence for each auditor in every class where it has a
complete round, for each vetter that ran and for each coder with an admitted plan.
You can use the recorded yield, time and rulings to change `planningAudit.auditors`,
`implementationAudit.auditors`, `planningAudit.vetters`, `implementationAudit.vetters` or `coders`
in `tools/audit-round/settings.json`.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/references/model-read-out.md`, `tools/audit-round/src/models.ts` and its evidence and comparison modules |

## Usage

```text
pnpm audit-round models              print auditor, vetter and coder results and later rulings
pnpm audit-round models --from 20-12 include runs starting on or after the most recent 20 December
pnpm audit-round models --winners    also print the ruling and ruler winner tables
pnpm audit-round models --all        include the winner tables, C vetters by auditor and judge,
                                     per-plan round data and excluded plans
pnpm audit-round models -h | --help  show the command's help
```

## Behaviour

`--from DD-MM` counts back to the latest matching day, including today, and starts at local
midnight. The report shows the year it selected. You can combine the date with `--winners` or
`--all`. A ruling follows the start of its round. Rulings without a known round are omitted.
Coder results compare whole implementations, so a plan needs its ready marker and all its
implementation rounds within the period.

The command reads every checked planning and implementation round-data file in
`../plan-evidence/active/` and the closed-plan archive, and joins it with the step, ready and closed
records of both Git histories. Commit-series data is not part of the read-out. It starts no
assistant.

The read-out compares rather than ranks by taste:

1. **Auditors** have separate planning and implementation tables. Each row compares the model with
   the other auditors only on plans they share. Each side's kept findings are divided by its rounds
   on those plans, so a model is not rewarded for auditing easier plans than the others. A model
   with fewer than five shared plans in a class is printed in a second table below the main one.
2. **Vetter pairs** have separate planning and implementation tables. Each row compares two vetters
   on the findings of its range they both judged on one panel. Where the two vetters split and the
   round stored a winner, that winner says which of them was right, whether you or the ruler named
   it.
3. **Vetters by auditor** have separate planning and implementation tables. Each row takes the
   vetter that ran on the auditor's own model and effort and compares it with another vetter on the
   same findings. A row and its reverse show whether a vetter does as well on its own model's audit
   reports as on another model's.
4. **Coders** are compared on closed plans whose archived step list the current grammar reads, whose
   every hosted share has a readable model record and whose whole-plan audit follows the final
   share. A step record without active time falls back to the span from the ready marker or the
   previous step to that step's later share commit. A plan whose step time cannot be read is
   excluded.
5. **Later rulings** take precedence over the round when counting a finding or deciding which
   vetter was right. A wrong finding adds nothing to the coder's kept count. A finding that
   stood as written counts as kept at its reported tier. A winning revision supplies the final
   tier. For example, a B revised to C counts once as downgraded in A/B and adds no kept finding
   against the coder. A later implementation finding adds to the named coder's count at your
   stated tier when the plan qualifies for the coder comparison. It changes no auditor or vetter
   count. See [`pnpm audit-round disprove`](/repo-edu/tooling/disprove/).

In both planning and implementation, auditors, vetter pairs and vetters by auditor have one table
for A and B findings and another for C findings only. Coders use the same two groups. Auditor and
coder tables use the original audit tier. Vetter-pair and vetters-by-auditor tables use the highest
tier given by the auditor or any vetter.

The auditor tables carry no evaluation and no recommendation. The best model is the top row of the
main table, and the time stands in its own column. Coder recommendations keep the direct
observed-range rule.

Under `--all`, the read-out also breaks the C vetters-by-auditor rows down by who decided each
split: you or the ruler, named by its model and effort. A later ruling of yours replaces the
ruler's. The A/B tables need no such view, because you decide every A and B disagreement yourself.
It also prints the measured planning and implementation data behind the
auditor rows. Each table has one row per plan and auditor with its rounds, all four finding outcomes
and mean minutes per round. A disproval with no retained finding has no recorded tier. It counts
only in the A/B auditor figures and gets a zero-round row if its auditor has no round on that plan.

## Output

The report prints auditors, vetter pairs, vetters by auditor, vetter times and coders first,
followed by `Later rulings`. With `--winners` or `--all`, the ruling and ruler winner tables
appear between coders and later rulings. Each auditor, vetter-pair,
vetters-by-auditor and coder part has two sections, whose headings end in `A/B findings` and
`C findings`. Under `--all`, the report also shows the C vetters by auditor and judge after the
vetters by auditor, and at the end planning and implementation rounds by plan for each range,
followed by excluded plans. Each auditor section prints its main table, then a second table under
`Fewer than 5 shared plans:` when a model is below that floor.

1. **Auditor tables** sort by the gap between the model's findings per round and the other auditors'
   findings per round, then by time. Each side shows its kept findings in rounds, such as
   `16 in 79`, beside the per-round figure that division gives. Wrong claims is dropped, downgraded
   and disproved as a percentage of all four finding outcomes. A reported C finding that ends at D
   counts as downgraded. One raised to A or B counts as kept in the C table. Cost is audit plus
   rebuttal time per complete round. Planning also
   reports a model whose first-round count differs from its even share by more than a tenth of its
   shared plans and by at least two, in both planning sections. A current auditor gets a bullet
   above the main table, where `--first` can correct the count. Other models share one line below
   the last table.
2. **Vetter-pair tables** have one row per pair of vetters, where a vetter is a model and an effort.
   A row counts the findings of its range both vetters judged on one panel, the splits with a stored
   winner, yours or the ruler's, and how each such split ended: vetter 1 right, vetter 2 right, both
   right or neither. A split without a winner counts only as shared. A winner that names a vetter
   also makes right every vetter that gave the same accept, drop or referral. When you later rule
   that a finding was wrong, the vetters who dropped it get credit. When it stood as written,
   the vetters who accepted it get credit. A winning revision credits only the vetter you named.
   A round with one vetter adds no row.
3. **Vetters-by-auditor tables** name the vetter on the auditor's model and effort first and the
   other vetter second. Only an exact match of the recorded release and effort counts. A row counts
   the shared findings, how often each side challenged the audit with a revise, a drop or a
   referral to you, and the ruled splits with their four endings. A missing row means the two
   models share no such finding in that direction. Under `--all`, a table by judge splits each C
   row's ruled splits between you and each ruler, `ruler not recorded` included, and adds back to
   the row.
4. **Vetter times** show one row per model and effort in each class. After the round count comes
   the average number of vetters who ran in those rounds. The time columns compare the vetter's
   own average minutes with the average of every recorded vet run in those rounds, including its
   own. A solo round counts as one participant. A stopped round counts if it recorded vet time.
5. **Each coder table** sorts by its range's kept findings per step, fewest first, then by time. It
   shows plans, steps, kept findings, kept per step and time per step. Each coder section gives its
   own verdict from its own figures.
6. **Ruling winners** list the winners you named in planning rounds, then in implementation rounds.
   Each table starts with the newest round and numbers its findings and reasons from 1. Each row
   shows the plan and round, the finding and its tier, the auditor, every vetter's verdict, the
   winners and your reason. The `Winners` column names everyone your answer proved right, each by
   its role and model. Choosing `report` credits the auditor and every vetter who accepted the
   finding. Naming a vetter credits that vetter and any who gave the same accept, drop or
   referral. Naming a vetter who accepted also credits the auditor.
   If a later ruling changes who was right, **Disproved** introduces the round's winners
   and **Winning** introduces the corrected winners. An empty list reads `none`. If the later
   ruling confirms the winners, you see the plain list. The table keeps the round's reason,
   with its first sentence in the row and the full text below. The later reason appears under
   **Later rulings**.
7. **Ruler winners** list the planning ruler's decisions first, then the implementation ruler's.
   The tables use the same form with a column for the ruler's model and effort. You can check
   each winner and overturn it with
   [`pnpm audit-round disprove`](/repo-edu/tooling/disprove/).
8. **Later rulings** print in up to seven numbered tables. A ruling that changes who the ruler
   credited prints under ruler winners for that work class. Otherwise a finding that stood as
   written prints under vetter verdicts. The rest print under auditor findings. The `Wrong` column
   can be empty when everyone was right. The `Wrong` and `Right` columns name
   each auditor, vetter and ruler on the side your ruling put it, with a vetter's verdict or the
   ruler's winner in brackets. Every table shows each reason's first sentence, then the full
   reasons as a numbered list, numbered across the section. The last table, **Implementation
   findings**, names the date, plan, tier and coder for each implementation fault you recorded.
   Its rows group by coder, newest first within each coder. These findings have no known round
   start, so `--from` omits them.
9. **Rounds by plan** list the plan with the newest round first, and a plan's rows by model. A plan
   without a retained round comes last. Their finding columns sum to the class totals
   behind wrong claims, and their kept findings and rounds on shared plans sum to both count cells.
10. **Excluded plans** group by reason with their recorded models.

When the read-out is taller than the terminal window, the command first shows it in a full-screen
view that you scroll yourself. The view keeps three things in sight for the part under the top
edge:

1. **The section heading**, such as `Planning rounds by plan`, stays on the first line.
2. **The table's column headings** stay below the section heading.
3. **The plan name** shows in the top row. A row for a further model of the same plan leaves its
   Plan cell empty, so the view writes the name into that cell while the row is the top row.

Scroll with the trackpad, the mouse wheel, the arrow keys, Page Up, Page Down, Home and End. The
view moves line by line, inside a table too, so it follows the trackpad at its own pace. Page Up and
Page Down never skip a line under the fixed lines. When the last row of a table scrolls away, the
table's fixed lines leave with it. The fixed lines take at most half the view; any beyond that are
left out, and a plan name cut short ends in `…`.

Press `q` or Esc to leave. The command then prints the whole read-out into the terminal, as it does
when the view does not open. The view does not open when the read-out fits the window or when the
output goes to a file or a pipe.

The command writes no round file or round data. When `tools/audit-round/settings.json` is missing,
it creates it from the committed defaults, as every command that reads settings does.

## Refuses when

Retained round data or the settings file fails validation. The runner prints
`audit-round: <reason>` and exits with status 1, leaving an invalid settings file unchanged. Correct
a settings error in the file. Round data is machine-written and never edited by hand.

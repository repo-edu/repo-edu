# Model read-out

This file describes the `models` command of the audit-round runner and its full-screen view. Read
[`glossaries/audit-round.md`](../../../glossaries/audit-round.md) and the runner's
[CLAUDE.md](../CLAUDE.md) first. The [Ownership](../CLAUDE.md#ownership) table there names the
source files this file describes. It follows the runner documentation's
[Document layout](../CLAUDE.md#document-layout) rule: each fact is stated once.

## The command

`pnpm audit-round models` reads every retained round-data file and both Git histories. It reads
its retained data and `coders` before assistant startup or release resolution. It renders
Markdown, starts no assistant and writes no round file or round data. Like other commands that read
settings, it creates a missing `settings.json` from the defaults.

`--from DD-MM` includes rounds whose recorded start is at or after local midnight on the most
recent occurrence of that day and month, including today. The report prints the resolved date.
A continued round keeps its original start. A later ruling follows its round into the report.
A detached ruling has no round start, so it is omitted when filtering. An opener counts only
when the plan's actual first complete round in that class falls in the window.

The coder sample covers a whole implementation. With a date filter, its ready marker and all
its retained implementation rounds must fall in the window. This also scopes the excluded-plans
list. A plan without a ready marker has no recorded start for that whole sample.

It prints the selected sections in this order.

1. Planning auditors and implementation auditors.
2. Planning and implementation vetter pairs, then planning and implementation vetters by auditor,
   then vetter times for each class.
3. Coders.
4. Planning and implementation ruling winners, with `--winners` or `--all`.
5. Planning and implementation ruler winners, with `--winners` or `--all`.
6. Later rulings.

Under `--all` it also prints the planning and implementation vetters by auditor and judge, after
the vetters by auditor. At the end it prints the planning and implementation rounds by plan, once
per range, and then the excluded plans. These print only under `--all`, because a reader comparing
models does not need the judges, the measured rows or the plans that supplied no evidence every
time.

## Owners

- `models.ts` owns the model read-out and its core and optional detail sections.
- `model-evidence.ts` reads checked round data once, in the round folder and the closed-plan
  archives. It records each auditor sample's plan and whether it is that class's first complete
  round on the plan. It builds one sample per pair of panel vetters and shared finding, with its
  highest grade, the round's auditor, both verdicts and the ending and judge of a ruled split. It
  totals vetter times and participant counts from the recorded vet phases of each round. It collects
  the findings whose round stored a winner, split by who named it. It then joins the step, ready and
  closed records from both Git histories.
- `model-comparison.ts` owns the same-plan comparison, the floor, the opener bounds and the direct
  range comparisons that remain for coders.
- `pager.ts` owns the [full-screen view](#full-screen-view).
- `pinned-headings.ts` owns which lines stay at the top of that view and where a scroll step ends,
  under [Pinned headings](#pinned-headings).

## Ranges

Every auditor, vetter-pair, vetters-by-auditor and rounds-by-plan part prints twice in each work
class. The one coder
part prints twice without a work class. Each heading names the findings it counts. The first section
counts A and B findings. The second counts C findings only, so models can be compared on C findings
independently of their serious findings. `tierRanges` in `round-data.ts` lists the two groups.

## Rows

An auditor gets a row in each class where it has a complete round. A coder gets a row once one of
its plans is admitted. A model known only through excluded plans or the other class prints no zero
row, because the excluded-plans section or the other table already names it.

Auditor and coder counts use the tier the auditor reported. Kept, dropped, downgraded and disproved
findings are exclusive counts. A downgrade is a kept finding whose final tier fell below the
section's range. A C finding raised to A or B stays kept in the C section. Later rulings from
`disprove` move findings between the counts:

- A wrong finding counts as disproved if the round kept it and as dropped if the round dropped it.
- A finding that stood as written counts as kept at the reported tier.
- A winning revision supplies the final tier. It keeps the reported tier if the vetter gave no new
  one. A B revised to C counts once as downgraded in A/B and adds no kept finding against the coder.
- A detached disproval has no recorded tier. Only the A/B auditor figures include it.

## Auditors

Planning and implementation auditors have separate tables.

- An auditor row compares only plans where another auditor has a complete round. A plan with one
  auditor enters neither side.
- Each side's per-round figure divides its kept findings of the section's range by its rounds over
  all those plans. The count cell beside the figure shows that division with both counts.
  Averaging per plan first was rejected: a plan with one round would then weigh as much as a plan
  with nine, and the figure could no longer be checked in its row.
- Each table sorts by the gap between the two per-round figures, then by time.
- A row with fewer than five shared plans is printed in a second table below the main one, so the
  main table's top row is the best of the models with enough plans.
- No evaluation or recommendation is printed, because the sorted table and its time column already
  state the order.
- Auditor cost is the mean audit and rebuttal time over every complete round in the class, not
  only the shared plans.
- Wrong claims is the dropped, downgraded and disproved findings as a percentage of all four
  counts across every complete round in the class.

Planning also reports an opener count for a row when the count differs from its even share by more
than a tenth of the row's shared plans and by at least two. The count reads plans rather than
findings, so both planning sections print the same opener lines. A current auditor, one that
`planningAudit.auditors` can run, gets a correctable bullet above the main table. Other auditors
share one line below the last table.

## Vetter pairs

Planning and implementation each have a vetter-pair table. A vetter is a model and an effort.

- A row is one pair of vetters that both judged a finding on one panel, where the finding's highest
  grade, from the audit report or a vetter, is within the section's range. `round-data.ts` shares
  that grade with the runner's winner rule.
- A round of one vetter supplies no pair.
- The pair is ordered by model text, so two models keep one orientation across rounds.
- A row counts the shared findings, the splits under `reviewsSplit` with a stored winner and each
  ruled split's ending: vetter 1 right, vetter 2 right, both or neither.
- A winner counts whoever named it, the user or the ruler. A split without a winner counts only as
  shared until its winner is stored, so the table has no open column.
- A row needs no auditor column, because both vetters judged the same audit reports.
  [Vetters by auditor](#vetters-by-auditor) groups the same samples by auditor.

The latest ruling decides the ending. A later ruling from `disprove` outranks the round's winner:

- A wrong finding credits the vetters who dropped it. A finding that stood as written credits
  the vetters who accepted it. A winning revision credits only its vetter.
- The round's `report` winner proves right the vetters that accepted the finding, and `neither`
  proves no vetter right.
- A list of vetter tags proves those vetters right. It also proves right every other vetter that
  gave the same accept, drop or referral as a named vetter, because each of those verdicts states
  one position. A revision is the vetter's own correction, so only a named revision is right.

`winnerProof` in `model-evidence.ts` owns the two round-winner rules. Without the same-verdict
rule, a vetter that accepted beside a named accepting vetter counted as not right.

## Vetters by auditor

Planning and implementation each have a vetters-by-auditor table, so a reader can see whether a
vetter does as well on its own model's audit reports as on another model's.

- A row is an ordered pair from one [vetter-pair](#vetter-pairs) sample. The first vetter ran on
  the model and effort the round's audit reported. The second is the other vetter of the pair,
  on another model or effort.
- Only an exact match of the reported model and effort counts. A shared vendor, an alias or a
  missing effort does not, so such a pair, and a pair of two outside vetters, supplies no row here.
  A pair whose two vetters both match supplies none either.
- A panel of three can give one auditor two rows, one with each other vetter.
- Each direction gets a row as soon as it has one shared finding, so a missing reverse row means
  no such finding rather than a measured zero. An empty section says so.
- A row counts the shared findings, each side's challenges and the ruled splits with their four
  endings: only the auditor's model right, only the other right, both or neither. The endings sum
  to the ruled splits.
- A challenge is a revise, a drop or a referral to the user. An accept with a note is an accept.
- The splits, the winners and the latest ruling are the vetter-pair samples' own, so the
  vetter-pair totals hold unchanged.

Under `--all`, each class adds a C table by judge. It breaks each row's ruled splits down by who
named the latest ruling: `user`, or `ruler` with the model and effort of the round's rule phase
entry, or `ruler not recorded` without that entry. A later ruling comes from the user and replaces
the round's judge and ending. Each pair's rows add back to its default C row. The
A/B sections get no such table, because the user is their only judge.

## Vetter times

Each class has one timing table across all finding tiers. Each row covers the rounds in which
the model and effort have a recorded vet phase, including solo and stopped rounds.

- The average number of vetters is the total number of recorded vet runs in those rounds divided
  by the round count.
- The own average is the model and effort's total vet minutes divided by its recorded vet runs.
- The all-vetters average is the total vet minutes of everyone in those rounds divided by their
  total vet runs. This includes the row's own vetter.

## Rounds by plan

Under `--all`, each class gains a measured-data table per range, with one row per plan and
auditor. These tables precede the excluded plans.

- The rows contain rounds, all four finding outcomes and mean minutes per round.
- Plans run from the newest complete round of the class to the oldest, so the plans in work open
  the table. A plan's rows sort by model.
- A plan with no complete round in the class comes last, by name, because its rounds predate the
  retained data.
- In the A/B table, a detached disproved finding creates a zero-round row when its auditor has no
  round on that plan.

## Coders

Coder yield comparisons use one closed plan per example. Each coder section has its own
recommendation and table.

A plan is admitted under these rules:

- The archived plan supplies the listed steps, every hosted share must have a readable model
  record and the whole-plan audit must follow the final share.
- A missing archived plan and a step list the current grammar cannot read are separate exclusion
  reasons, because the read-out names what it found and never rewrites the archive.
- Records admit a plan without a ready assignment when they name one model and effort.
- An assignment, when present, must match on assistant and effort. Its model may be a family alias
  the implement worker resolved at run time, so the records' release is not compared with it. A
  mismatch is its own exclusion reason.
- A readable step record without active time falls back to the span from the ready marker or the
  previous step to that step's later share commit. A two-repo span counts once.
- A plan with a step time that neither source gives is excluded with its own reason. Every admitted
  plan therefore supplies both its yield and its time, and a row holds one sample list.
- Incomplete or mixed records move to the excluded-plans section.

The comparison works as follows:

- Time adds step and implementation-fix time and excludes planning fixes. Mean comes from
  `simple-statistics`.
- Direct observed-range comparisons own the clear-cut recommendation. Every row that reaches its
  minimum of three plans enters it.
- Each table shows plans, steps, kept findings of its range, kept per step and time per step. It
  sorts by its range's accepted findings per step, fewest first, then by time.
- A winning coder outside `coders` is named as such.

## Ruling winners and ruler winners

Ruling winners and ruler winners each have a planning section followed by an implementation
section. Each section lists its newest round first and keeps findings in order within a round.

The ruling winners tables list every finding whose winner the user named in a round. Each row
shows the plan and round, the finding and its tier, the auditor, the vetters, the winners and the
reason. The `Vetters` column names each vetter of the round by its model and effort, with its
verdict on the finding or `no verdict`.

The `Winners` column names everyone the round's winner proved right. The stored winner word
alone would hide some parties. For example, `report` also credits the vetters who accepted.

- The auditor is a winner when the finding stood as written: the winner is `report` or names a
  vetter that accepted.
- A vetter is a winner under the two round-winner rules of [Vetter pairs](#vetter-pairs). A vetter
  without a verdict on the finding took no part.
- Each party is its role word and its model and effort, in the order auditor, vetters in panel
  order. The model names a vetter because a tag names it only within its round. The role word
  tells a vetter from an auditor on the same model.
- A winner that proved nobody right prints `none`.
- When a later ruling changes who was right, the cell shows **Disproved** before the round's
  winners and **Winning** before the later winners. Either list can read `none`. A later ruling
  that confirms the same parties keeps the plain list. The row gives the round's reason. The
  later reason appears under [Later rulings](#later-rulings).
- Splits and contests share the list, because both end in the same ruling.

The ruler-winners tables use the same form, with a ruler column that names the model and effort
of the round's rule phase entry. Separate tables keep the user's decisions easy to find. The
user can check a ruler's winner and overturn it with `disprove`.

## Later rulings

Each later ruling prints once, in one of six numbered tables. A table is named by its work class
and by its subject, like the sections above it: `Planning auditor findings`,
`Implementation auditor findings`, `Planning vetter verdicts`, `Implementation vetter verdicts`,
`Planning ruler winners` and `Implementation ruler winners`. They print in that order, and a table
without rows is not printed.

- A ruling that changes who the ruler proved right prints under ruler winners.
- Otherwise a finding that stood as written prints under vetter verdicts. The other rulings print
  under auditor findings.
- Rows group by the auditor, or by the ruler in a ruler table, and run newest first within one.
- A detached entry prints under its work class's auditor findings and says that no retained round
  data holds the finding.

The model is no heading, because a vetter row names several vetters.

### Wrong and right

The `Wrong` and `Right` columns list who the ruling proved wrong and who right. Each party is its
role word, its model and effort and, in brackets, a vetter's verdict or the winner a ruler named.
The order is auditor, vetters in panel order, ruler. The finding shares the auditor's side.

- A wrong finding puts the auditor under `Wrong`. A vetter that dropped the finding is right, and
  one that accepted or revised it is wrong. A vetter that sent it to the user took no side and is
  in neither column.
- A finding that stood as written credits the auditor and every vetter who accepted it. When
  everyone accepted and no ruler was wrong, `Wrong` is empty.
- A winning revision puts only its vetter under `Right` among the auditor and vetters. The auditor
  and every other vetter who gave a verdict appear under `Wrong`.
- A vetter without a verdict on the finding is in neither column.
- A ruler is right when its winner and the later ruling credit exactly the same parties.
  A ruler that is right stays in the auditor or vetter table.

The vetter rule is the one the [vetter pairs](#vetter-pairs) count by.

## Reasons

These rules hold for ruling winners, ruler winners and later rulings.

- Every table shows each reason's first sentence, because a full reason wraps the terminal table
  into an unreadable grid.
- A numbered list of the full reasons follows each table. It is numbered across the section, so
  each ruling keeps one number.

## Excluded plans

The excluded-plans section groups plans by reason and names their recorded models.

## Full-screen view

At a terminal, a read-out taller than the window first opens in a full-screen view. `command.ts`
awaits the view before the ordinary terminal write. The printed read-out therefore stays the only
permanent output, and it is the same with or without the view.

- The view opens only when standard output and standard input are terminals and the rendered
  read-out is at least as tall as the window. Redirected output and a read-out that fits the window
  skip it.
- It runs on `pi-tui`'s alternate-screen renderer. One scroll view shows the lines `terminal.ts`
  renders, with one row below it for the keys and the line position. The footer is an overlay
  because the renderer reuses layout rows when only the scroll position changes.
- It stops that renderer with the screen preserved, because the renderer would otherwise print the
  document a second time.

Keys:

- The mouse wheel, the arrow keys, Page Up, Page Down, Home and End scroll the view. The up and
  down arrows are bound to one line of scrolling.
- No letter scrolls, because the library's search panel reads letters as text.
- `q` and Esc leave through the document's keyboard focus. While the reader types into the search
  panel, `q` therefore stays a letter and Esc closes the panel.
- Ctrl-C leaves through an input listener, because raw input carries it as a key.

The scroll view is a subclass that overrides the library's one step method, because the library
sends every line key, page key and wheel move through it. Each step ends at the position
`pinned-headings.ts` names. The overlay has no height limit of its own, because
`pinned-headings.ts` keeps the pinned lines within half the view.

## Pinned headings

The top lines of the view keep the section heading and the table's column headings of the part
under the top edge.

### Regions

`pinned-headings.ts` splits the Markdown with the parser `pi-tui` renders with. It renders each
top-level block alone to count its lines and walks the rendered document in order, because the
renderer draws a block the same way alone as inside the document.

Two kinds of region carry heading lines:

- A section below the document title carries its heading. The document title is no region, because
  it would stay in view for the whole document.
- A drawn table carries its lines through the first rule. Row boundaries come from the rule lines
  the renderer draws, so a table too narrow to draw as a grid pins nothing.

At each nesting level, the region that holds the first line its heading would cover is pinned. A
heading is therefore pinned from the moment its own lines reach that place until the region's last
line has passed it.

- When fewer lines of the region remain than the heading has, only the heading's last lines stay.
  A heading therefore leaves with its region and never covers the lines after it.
- A table's region ends before its bottom border, so its heading slides away into the line that
  closes it.

### Drawing

The pinned lines are drawn over the scroll view's first rows rather than above it, so the document
does not jump when their number changes. They fill at most half the view and drop the lines beyond
that, so the rest of the view always shows the document.

### Group names

A group's name is no heading line. A row with an empty first cell continues the group of the last
row that named one, which is how the rounds-by-plan tables list a plan's further auditors.

- When such a row is the first row under the headings, the view draws that row again with the name
  in its first cell. The row keeps its other cells, so it scrolls as one whole.
- A name row of its own was rejected: it would have to cover the group's first row and blank that
  row's other cells.
- Only the row's name lines are drawn again, because its later lines show as they are.
- A name with more lines than the row shows, or than the pinned lines have room for, ends in `…`.

### Scroll steps

A step moves the lines it asks for, inside a table too, so the view follows the trackpad, the
wheel and the keys at their own pace. It may end in the middle of a row or with a heading partly
shown.

A step is shortened only where it would skip a line: the lines in view under the headings before
and after the step must join. The step rule counts the same lines the pinned headings cover, so a
step of one line always moves without skipping one. This shortens a page step, because the
library's page length does not count the lines the headings cover.

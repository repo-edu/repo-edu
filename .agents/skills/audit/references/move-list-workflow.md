---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../../references/round-protocol.md
  - ../../../references/round-grammar.md
  - ../../../../../plan/GROWTH-PATTERNS.md
---

# Move-list audit workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole. Read each file once. Apply the `simple`
requirement to the whole session and skip its confirm-and-wait step.

A move-list round judges one move list before code carries it out. The list
stands where a plan stands in a planning round: a committed document that the
round's fix changes in place or withdraws. This audit reads the source file
whole and the list, answers four questions and reports what would change the
list. It is read-only, runs no checks and no tests and ends at its audit
report. An audit with findings stops there. The vet, the rebuttal and the ruler
then run on their implementation workflows, and the
[move-list fix workflow](../../fix/references/move-list-workflow.md) applies the
settled findings. An audit without findings follows
[Clean completion](#clean-completion).

The shared [round protocol](../../../references/round-protocol.md) owns
evidence rules, finding grades, rating meanings and runner result meanings. The
[round grammar](../../../references/round-grammar.md#audit-report) owns the
audit report form, and its [Move list](../../../references/round-grammar.md#move-list)
owns the form of the list. The runner's
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing) owns the
arguments, which name the audit report output and the move list.

## Sources

Read the move list whole. Its `Source:` line names the source file relative to
the Repo Edu root, and its `Hash:` line names the content the list describes.
Every range counts lines of that content, before any move. The runner tried the
list in memory on that content before this round, so every range holds complete
top-level statements and the statement move tool admits every move.

Read the source file whole, with its line numbers. Search the workspace for the
files that import it, and read them and the files it imports as far as you need
them to judge its seams. For question 4, read the entries of
`tools/architecture-check/src/area-model.json` whose member patterns could
match a target's path.

No plan stands behind a move list, so no plan decision binds the round. Its
questions come from this workflow alone.

## Questions

Judge the list by four questions, in this order. No line count, metric or other
mechanical rule answers any of them.

1. **Should the file be split at all?** Ask the design session's three
   questions again: does the file hold more than one responsibility, does it
   have natural seams and is it too large to hold in one reading? A large file
   that holds one responsibility is fine. A file whose division needs more than
   moves of complete top-level statements needs a plan. That holds when a seam
   cuts through one function, class or hook, or when the split changes
   something other files rely on, such as a statement that another package
   imports. The statement move tool repoints importers only inside the source's
   package.
2. **Does each target hold one responsibility?** Test each target's
   responsibility sentence against the statements its ranges name.
3. **Does a cut divide code that belongs together?** Read the names that cross
   each cut, in both directions. The statements that stay in the source are on
   one side of every cut.
4. **Does each statement sit in the right target, and do each target's name and
   area fit?** A target's area fits when a member pattern of the source's area
   matches the target's path and no member pattern of another partition area
   does. The list's `Area:` line names the source's area.

## What a finding asks

Report only what would change the list: its withdrawal, a target, a move or a
name. The wording of a responsibility sentence creates no finding. A correction
changes only moves of complete top-level statements, in the list's own form. A
division that needs an edit to code makes the file one that needs a plan, so its
correction is the withdrawal.

Grade each finding with the
[move-list tiers](../../../references/round-protocol.md#move-list-tiers) and
state its consequence under the shared protocol's
[Finding explanations](../../../references/round-protocol.md#finding-explanations).
An A finding's correction names the result the withdrawn list records: `fine`
or `needs-plan`, with its reason.

Each finding takes the move-list token line of the
[audit report grammar](../../../references/round-grammar.md#audit-report):

1. **Section.** `[section:move-<n>]` when the finding concerns one numbered
   move, and `[section:moves]` when it concerns several moves or the whole
   list.
2. **Reach and rarity.** No split changes what the code does, so no end user
   meets the harm, and the reach is `developer`. A poor division is an upkeep
   cost that every later change to the code pays, so the rarity is `ordinary`.
3. **Growth pattern and complexity.** Rate them under the shared protocol's
   [Growth-pattern tags](../../../references/round-protocol.md#growth-pattern-tags)
   and [Reach and complexity](../../../references/round-protocol.md#reach-and-complexity).
   The complexity compares the division with and without the correction.

## Coverage

Before drafting findings, build the coverage table that the
[audit report grammar](../../../references/round-grammar.md#audit-report) gives
a move-list audit report: one row for the file, then one row per target in move
order.

The file's row answers question 1:

1. `divides`: the file should be split between complete top-level statements.
2. `fine`: the file should stay whole.
3. `needs-plan`: the file's division needs more than such moves.

`fine` and `needs-plan` come with an A finding. A target's row states the
responsibility the target holds as you read it, the ranges that show it, the
names that cross its cut and one disposition. Where several apply, take the
first in this list:

1. `mixes`: the target holds more than one responsibility. This comes with a B
   finding.
2. `cuts`: a cut at the target divides one responsibility. This comes with a B
   finding.
3. `misplaced`: a statement sits in the wrong target. This comes with a C
   finding.
4. `misnamed`: the target's name or area does not fit. This comes with a D
   finding.
5. `holds`: none of the above.

The table is evidence and no rule: no count of crossing names decides an
answer. A session that is handed a finished list may lean towards yes, and an
audit without findings runs no vet. The table then shows what the auditor read
and judged, so an audit report without findings carries it too. Case:
[`move-list-coverage`](../../../../../plan/CASES.md#move-list-coverage).

## Audit report file

Follow the [audit report grammar](../../../references/round-grammar.md#audit-report)
for the opening and the findings, and the shared protocol's
[Audit reports](../../../references/round-protocol.md#audit-reports) for the
reporting discipline. The opening names the move list's path as the target and
the plan head as the judged repo, then holds the coverage table. Deliver the
complete audit report under the runner's
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).

## Clean completion

Follow the shared protocol's
[Direct clean completion](../../../references/round-protocol.md#direct-clean-completion).

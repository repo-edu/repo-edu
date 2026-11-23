---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../../references/round-protocol.md
  - ../../../references/round-grammar.md
  - ../../../references/subject-grammar.md
  - ruling.md
---

# Move-list fix workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole. Read each file once. Apply the `simple`
requirement to the whole session and skip its confirm-and-wait step.

This workflow is the fix phase of a move-list round. It starts from the audit
report, its vet reports, its rebuttal report and any ruler report. It applies
the settled findings to the one move list in place and commits the list in the
plan repo with the round's record, as a planning fix commits a plan. It edits
no code. An audit with no findings uses the shared protocol's
**Direct clean completion**.

The [shared round protocol](../../../references/round-protocol.md) owns rating
meanings, reconciliation, record meaning and runner result meaning. The
[round grammar](../../../references/round-grammar.md) owns the parsed reports,
the [Move list](../../../references/round-grammar.md#move-list) form and the
[commit record bullet](../../../references/round-grammar.md#commit-record-bullet).
The [subject grammar](../../../references/subject-grammar.md) owns the record's
subject. The runner owns the arguments under
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).

The runner asks the user every question the reviews leave before this fix
starts, under **Reconciliation**. When the phase arguments include a `contests`
object, its entries are the round's contests and splits, each with the `winner`
and `reason` the ruler or the user named. A `choices` object carries the user's
choice on a finding, in the user's words. Apply every winner and choice without
deciding it again, and never pick a side in a contest or split yourself. A
winner that names vetter tags applies those vetters' verdicts. Every fix
invocation is commit-blocked while any supplied contest lacks a winner, and a
fix that reports finished with an open contest fails the round.

Follow the shared
[Runner result](../../../references/round-protocol.md#runner-result) for every
ending.

## Grounding

Read the audit report end to end, then its supplied vet, rebuttal and ruler
reports when they exist. Read the move list that the audit report's target
names in the plan checkout, and the source file its `Source:` line names in the
Repo Edu checkout, whole.

Follow [Head drift](../../../references/round-protocol.md#head-drift). When a
later commit already resolved a finding, drop it and name that commit in the
record. A fix that continues a stopped round reads the commits
the round already landed and any uncommitted change in the move list before it
applies the rest.

Follow the shared **Reconciliation** rule for the outcome of every finding.
When a decision the fix meets in its own work stays open, follow
[Writing a ruling](ruling.md) at the supplied ruling path.

## Applying corrections

Apply every correction that **Reconciliation** settles to the move list and to
no other file. Keep the list in the round grammar's **Move list** form:

1. **The opening stays.** The `Source:`, `Hash:` and `Area:` lines do not
   change. Every range keeps counting lines of the content that the hash names,
   before any move, so do no arithmetic between moves.
2. **A changed list.** A correction may add, remove or reorder a move, change
   its ranges or its target path, or change its responsibility sentence. A
   finding's `[section:move-<n>]` names the move by its number in the audited
   list, so apply every correction before you number the moves again from 1
   without gaps.
3. **A withdrawn list.** An accepted A finding withdraws the list. Replace the
   `## Moves` section with the `## No split` section. Its result is `fine` or
   `needs-plan` with the reason on one line, as the settled finding says. A
   withdrawal makes every other correction moot.

Run no formatter, check or test, and run no command that changes a source file.
The runner tries the changed list in memory before the next round or the split,
so the fix does not try it.

## Records

Commit the move list in the plan repo with the round's record. Write the
subject in the subject grammar's form for a move-list round's record, which
opens with the series label. The body follows the shared protocol's
[Finding metadata](../../../references/round-protocol.md#finding-metadata) and
the commit record bullet in its plan-repo form: one graded bullet for each
applied finding, with the finding's number and its section. A bullet's tier is
the tier the settled verdicts and winners give, so the fix sets no tier of its
own.

A round whose reconciliation drops every finding lands the clean record in the
same form, with `clean` in the severity slot, and changes no file.

The record commits only the move list. A move-list round changes nothing in Repo
Edu and defers nothing. It writes no handoff: the next round reads the changed
list fresh, and the list's Git history keeps every round's record.

The invocation grants the round's record commit. Anything outside the move list
still asks.

## Completion

After the corrections and the record are complete, follow the shared protocol's
**Runner result**. The round's reports stay where they are.

# Commit-scoped round

The audit workflow at `workflow.md` routes here when the invocation names a
revision or a revision range instead of a plan. A commit-scoped round judges
work that no plan covers.

This file supplies what a plan supplies in an ordinary round: the round's
scope, the gate it passes, the baseline its findings are judged against, its
coverage table, its audit report name, its record and its settlement. It replaces
the **Ready gate**, **Round strategy**, **Coverage** and **Episode settlement**
sections of `workflow.md`, and the plan reads in its
**Evidence** section. Read the rest of `workflow.md` as written. The
[shared round protocol](../../../references/round-protocol.md) owns the tiers,
finding metadata meanings, growth-pattern tags and trade pricing. The
[round grammar](../../../references/round-grammar.md) owns audit report, vet
report, rebuttal report and record-bullet shapes.

The round's repo set is the repositories carried by the parsed commit groups.
The phase arguments keep the group boundary, repository, references, starting
HEAD, exact current commit set, original commit set and resolved short
references. The original set passed the first round's gate and owns the series
label. The current set advances with landed fixes. This workflow does not
derive the repository boundary or read HEAD again. A repo outside that set may
be read as evidence, never as a source of intent.

## Range

The user's first invocation owns each group's original scope. Follow it
exactly. Never select, propose or replace it. A group may begin as an inclusive
`<from>..<to>` range, a list or one commit. The runner has already resolved it
against the captured head and ordered its full commit IDs in
`originalCommits`. It refuses invalid references before this phase starts.

Check that each original list is contiguous in its repo's first-parent history.
A later round keeps the same original set but receives a runner-built `commits`
set containing those commits and the fixes landed by earlier rounds. Audit that
exact set. Do not turn it into a span and do not run a gap check over the
current set: unrelated commits between its members are deliberately outside the
scope.

The scope is every group's current `commits` and the state of the files they
touched, read at that group's `startingHead`. The `references` field is the
spelling the audit report's `Target:` line repeats. In a later round it is the exact
full-ID set built by the runner.

## Gate

Before any audit work, check three things.

- No file a group touched has uncommitted changes in that repo's working tree.
  The round reads touched files from the tree, so an
  uncommitted edit there would be judged as the range's work. A dirty file
  outside the touched set is never read and does not block the round. When
  the check fails, name the repo and every dirty touched path and stop.
- Every current commit in each group is reachable from that repo's HEAD.
- No commit in `originalCommits` carries a plan stem. An earlier series'
  `commit-audit` record opens with a series label, which is no plan stem, so
  the round audits it like any commit without a plan. Earlier round fixes have
  already passed the runner's subject validation and do not repeat this gate.

A commit carrying a plan stem belongs to a plan-scoped round, which judges it
against a plan this round cannot read. Name every such commit, say those
commits are out of scope and stop. Continue only when the user explicitly says
to. When the user continues, the named commits stay out of the coverage table,
and the files they touched are judged like any other code the round reads.

## Baseline

Inspect each commit's complete change against its repo requirements and the
substantive intent in its subject and body. Judge the resulting work at that
group's `startingHead`. Follow the shared
[completed-commit metadata exclusion](../../../references/round-protocol.md#completed-commit-metadata).

The standing sources replace the plan. When Repo Edu is judged, read the
`CLAUDE.md` of every package the range touched, `../plan/BOUNDARIES.md`,
`../plan/GROWTH-PATTERNS.md` and
`tools/architecture-check/src/area-model.json`.

When the plan repo is judged, read `../plan/CLAUDE.md`,
`../plan/.agents/references/planning-rules.md`,
`.agents/references/round-protocol.md`,
`.agents/references/subject-grammar.md`, `../plan/BOUNDARIES.md` and
`../plan/GROWTH-PATTERNS.md`. When the range touches files under `home/`, also
read `../plan/home/README.md`. A plan-repo target has no area model.

A boundary entry, and a user ruling recorded in the commit bodies for the work
the range touched, are settled. Correctness or quality evidence can reopen one.
Taste never does. This is the protection a plan's **Decisions** entries give an
ordinary round.

## Coverage

Before drafting findings, build one coverage table with one row per commit
across all groups, with columns for the commit, its changed code and one
disposition for the commit as a whole. Inspect every touched file whether or
not the message names it.

- `holds`: the code at HEAD delivers the commit's substantive intent.
- `overreached`: the change materially exceeds that intent's scope.
- `short`: the substantive intent is not fully delivered.
- `superseded`: a later commit in the range undid the change.

Close the table with the commit coverage line of the
[audit report grammar](../../../references/round-grammar.md#audit-report).

## What this round looks for

An ordinary round judges shipped code against a plan. This round judges shipped
code against the standing sources and the commit's substantive intent. Material
scope and code defects remain findings under the same tiers and tokens. A
behavioural claim matters when it exposes a live defect; an omitted filename
or incorrect old metadata does not create a finding. For a Repo Edu target, a
new tracked source file without a primary area remains a finding under the
source growth gate in Repo Edu's `CLAUDE.md`.

## Pre-existing code

A defect in a part of a touched file that the range did not write still lands
as a finding. Say in its prose that it is pre-existing, so the reader can tell
it apart from the range's own work.

## Report

Follow the [audit report grammar](../../../references/round-grammar.md#audit-report)
and the shared protocol's
[Audit reports](../../../references/round-protocol.md#audit-reports).
In place of plan and step evidence, supply every group's carried references,
its original commit set, its exact current commit set and the statement that no
plan covers the original work. Open `Judged repos:` with every group's
`startingHead`. Use the commit coverage table above. Naming and allocation follow the
runner's [Round files](../../../../tools/audit-round/CLAUDE.md#round-files) and
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).

## Record

Every commit a commit-scoped round lands is one of its records. In either repo it takes the subject
grammar's commit-audit form: the series label and the `commit-audit` role, then the tag, burden
mark, severity sequence and kind of an audit record. Write the subject from the tag on, as
`abx growth-none docs(claude): …`. The commit hook opens it with the round's `<label>/commit-audit`
in place of any form it opened with, so the label is never typed, and the runner collects the
round's records by that label. The label reads like the ID column of the log beside the audited
commits, so the log shows which commits a record belongs to. Case:
[`commit-audit-form`](../../../../../plan/CASES.md#commit-audit-form).

The round lands one record in each judged repo whose files took accepted findings and none in a
judged repo without findings. A round that judges both repos defers nothing between them. Every
record follows the shared protocol's **Finding metadata** and the
[record bullet grammar](../../../references/round-grammar.md#commit-record-bullet).

The fix does not apply a finding whose correction changes a listed file, as the
shared planning rules'
[Doctrine changes](../../../../../plan/.agents/references/planning-rules.md#doctrine-changes)
define it, because such a file changes only inside a plan and this round has
none. It names that finding in its handoff as work for a plan, and the record
leaves it out. A round whose every accepted finding is of that kind lands no
record.

A clean round lands one empty record in the commit-audit form with `clean` in
the severity slot, so the log shows that the audit ran and found nothing. The
shared protocol's **Shared implementation forms** places it as a plan's clean
record: in the sole judged repo, or in Repo Edu when both repos were judged.
Direct clean completion lands it for an audit with no findings, and the fix
lands it for a round whose every finding was dropped. A clean record changes no
file, so it joins no later round's audited set.

## Settlement

A commit target is a series under its bounded `commit-` label. It has no
close, no plan episode, no `implemented:` or `closed:` marker and no trajectory
watch.

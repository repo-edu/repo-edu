# Commit-scoped round

The audit workflow at `workflow.md` routes here when the invocation names a
revision or a revision range instead of a plan. A commit-scoped round judges
work that no plan covers.

This file supplies what a plan supplies in an ordinary round: the round's
scope, the gate it passes, the baseline its findings are judged against, its
coverage table, its report name, its record and its settlement. It replaces
the **Ready gate**, **Round strategy**, **Coverage** and **Episode settlement**
sections of `workflow.md`, and the plan reads in its
**Evidence** section. Read the rest of `workflow.md` as written. The
[shared round protocol](../../../references/round-protocol.md) owns the tiers,
finding metadata meanings, growth-pattern tags and trade pricing. The
[round grammar](../../../references/round-grammar.md) owns report, twin and
record-bullet shapes.

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
spelling the report's `Target:` line repeats. In a later round it is the exact
full-ID set built by the runner.

## Gate

Before any audit work, check three things.

- No file a group touched has uncommitted changes in that repo's working tree.
  The round reads touched files from the tree, so an
  uncommitted edit there would be judged as the range's work. A dirty file
  outside the touched set is never read and does not block the round. When
  the check fails, name the repo and every dirty touched path and stop.
- Every current commit in each group is reachable from that repo's HEAD.
- No commit in `originalCommits` carries a plan stem. Earlier round fixes have
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
disposition for the commit as a whole. Prefix the six-character SHA in the commit cell
with its repo, as `repo-edu@c5c651` or `plan@e8128b`. Inspect every touched
file whether or not the message names it.

- `holds`: the code at HEAD delivers the commit's substantive intent.
- `overreached`: the change materially exceeds that intent's scope.
- `short`: the substantive intent is not fully delivered.
- `superseded`: a later commit in the range undid the change.

Close the table with one line, counting commits.

```text
Commit coverage: C/T commits hold; V overreached; N short; R superseded.
```

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
`startingHead` in the grammar's order, `plan@<sha>, repo-edu@<sha>` when both
are present. Use the commit coverage table above. Naming and allocation follow the
runner's [Round files](../../../../tools/audit-round/CLAUDE.md#round-files) and
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).

## Record

A commit-scoped round has no plan stem, so its fix commits carry no
`impl-audit-` role token. It lands one record in each judged repo whose files
took accepted findings and none in a judged repo without findings. A Repo Edu
record takes Repo Edu's ordinary severity-prefixed conventional form. A
plan-repo record takes the subject grammar's O2 off-plan form, `<tag> <growth>
<sequence> <kind>: <sentence>`. Its body uses unbracketed tiers with
`[section:]` locations. A round that judges both repos defers nothing between
them. Every record follows the shared protocol's **Finding metadata** and the
[record bullet grammar](../../../references/round-grammar.md#commit-record-bullet).

Direct clean completion follows the shared protocol. It creates no record
because no stem scan reads one for a commit target.

## Settlement

A commit target is a series under its bounded `commit-` label. After each
finished round, the judge reads the label's round data, the original commits
and earlier landed fixes. It receives no watch. The judge stops the series or
chooses another listed auditor under the same A or B gate used after a ready
plan. A clean round lands no record, but its finished data entry can settle the
read. The fix follows the runner's
[Report lifecycle](../../../../tools/audit-round/CLAUDE.md#report-lifecycle).
There is no plan episode, `implemented:` or `closed:` marker and no trajectory
watch.

`pnpm audit-round round` accepts the original references as its target
arguments. Without `--auditor` it runs the automatic series. With
`--auditor`, it runs the entries in order through the editable queue. No commit
round runs a trajectory glance or watch after its fix or brief.

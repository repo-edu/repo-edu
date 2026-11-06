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

The round's repo set is the repositories carried by the parsed commit groups. The phase arguments
keep the group boundary, repository, typed references, starting HEAD and the resolved short
references the round's filename uses, so this workflow does not derive that boundary or read HEAD
again. A repo outside that set may be read as evidence, never as a source of intent.

## Range

The user names each group's range. Follow every group exactly. Never select,
propose or replace one. A group may be given as `<from>..<to>`, as a list of
commits or as one commit reference, which scopes that group to that commit
alone. The group's repository comes from its parsed `repository` field. Its
`references` field preserves the typed `plan@` prefix on the first plan
reference. Ignore prose around the commits the user names and never resolve a
range from prose alone. When the invocation names no group, ask for one and
wait.

After the optional prefix, each reference may be a sha, `HEAD` or `HEAD-<n>`.
`HEAD` names the group's `startingHead`, the short commit captured before the
round files were named. `HEAD-<n>` names its nth first-parent ancestor, with
`<n>` a non-negative integer: `HEAD-0` is `HEAD` and `HEAD-1` is the commit
before it. Translate `HEAD-<n>` to `<startingHead>~<n>` before resolving it.
These forms also work in lists and at either end of a range, including
alongside shas. For example, prefixing `HEAD-2..HEAD` with `plan@` includes the
three commits ending at the plan group's starting HEAD.

Resolve a group's references against its `startingHead` and keep the resulting
shas as that group's scope. If a reference is invalid or its ancestor does not
exist, name its repo and reference and stop for corrected input.

Every form names an inclusive set of commits. Resolve each named commit on its
own and take the span between the oldest and the newest, which are the round's
`<from>` and `<to>`. The order the user typed them in carries no meaning. Never
pass the user's text to Git as a range expression: `<from>..<to>` read
literally drops `<from>`, and `<to>..<from>` read literally resolves to no
commits at all.

A named set must be contiguous in its repo's first-parent history. When it is
not, name the repo and commits lying between the named ones, say the range has
a gap and stop. Continue only when the user explicitly says to.

The scope is every group's commits and the state of the files they touched,
read at that group's `startingHead`.

## Gate

Before any audit work, check three things.

- No file a group touched has uncommitted changes in that repo's working tree.
  The round reads touched files from the tree, so an
  uncommitted edit there would be judged as the range's work. A dirty file
  outside the touched set is never read and does not block the round. When
  the check fails, name the repo and every dirty touched path and stop.
- Every commit in each group is reachable from that repo's HEAD.
- No commit in any group carries a plan stem.

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
In place of plan and step evidence, supply every group's commit references as
typed, each resolved range with its prefixed six-character SHAs and the statement that
no plan covers the work. Open `Judged repos:` with every group's
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

A commit-scoped round is one-shot. The range is the scope, and the round ends at its report. The fix
lands its record and follows the runner's
[Report lifecycle](../../../../tools/audit-round/CLAUDE.md#report-lifecycle).
There is no episode, no
`implemented:` or `closed:` marker and no trajectory watch. A later round over later commits is a
new round, not a continuation of this one.

`pnpm audit-round round` accepts these same references as its target arguments.
It passes them to the audit phase unchanged, which resolves and fixes the
scope under **Range** above. Commit targets reject multiple auditor entries and run no
trajectory glance or watch after the fix and brief.

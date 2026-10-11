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
finding metadata tokens, growth-pattern tags, trade pricing and twins.

The round's repo set is the repo the commit target names. Bare references name
Repo Edu. A `plan@` prefix on the first reference names the plan repo for the
whole target. The other repo may be read as evidence, never as a source of
intent.

## Range

The user names the range. Follow it exactly. Never select, propose or replace
it. The range may be given as `<from>..<to>`, as a list of commits or as one
commit reference, which scopes the round to that commit alone. An optional
`plan@` prefix on the first reference selects the plan repo for every reference
in the target. A prefix on a later reference is refused. Bare references select
Repo Edu. Ignore prose around the commits the user names, and never resolve a
range from prose alone. When the invocation names no commit, ask for one and
wait.

After the optional prefix, each reference may be a sha, `HEAD` or `HEAD-<n>`.
`HEAD` names the latest commit in the named repo. `HEAD-<n>` names its nth
first-parent ancestor, with `<n>` a non-negative integer: `HEAD-0` is `HEAD`
and `HEAD-1` is the commit before it. Translate `HEAD-<n>` to Git's
`HEAD~<n>` before resolving it. These forms also work in lists and at either
end of a range, including alongside shas. For example, prefixing
`HEAD-2..HEAD` with `plan@` includes the latest three commits along the plan
repo's first-parent history.

Resolve all references against the named repo's same HEAD at the start of the
round and keep the resulting shas as its scope. If a reference is invalid or
its ancestor does not exist, name it and stop for corrected input.

Every form names an inclusive set of commits. Resolve each named commit on its
own and take the span between the oldest and the newest, which are the round's
`<from>` and `<to>`. The order the user typed them in carries no meaning. Never
pass the user's text to Git as a range expression: `<from>..<to>` read
literally drops `<from>`, and `<to>..<from>` read literally resolves to no
commits at all.

A named set must be contiguous in the first-parent history. When it is not,
name the commits lying between the named ones, say the range has a gap and
stop. Continue only when the user explicitly says to.

The scope is the commits in the range and the state of the files they touched,
read at the named repo's HEAD.

## Gate

Before any audit work, check three things.

- The named repo's working tree is clean. A dirty tree means the round would
  judge work that is not committed.
- Every commit in the range is reachable from the named repo's HEAD.
- No commit in the range carries a plan stem.

A commit carrying a plan stem belongs to a plan-scoped round, which judges it
against a plan this round cannot read. Name every such commit, say those
commits are out of scope and stop. Continue only when the user explicitly says
to. When the user continues, the named commits stay out of the coverage table,
and the files they touched are judged like any other code the round reads.

## Baseline

Inspect each commit's complete change against the repo requirements and the
substantive intent in its subject and body. Judge the resulting work at the
named repo's HEAD. Follow the shared
[completed-commit metadata exclusion](../../../references/round-protocol.md#completed-commit-metadata).

The standing sources replace the plan. For a Repo Edu target, read the
`CLAUDE.md` of every package the range touched, `../plan/BOUNDARIES.md`,
`../plan/GROWTH-PATTERNS.md` and
`tools/architecture-check/src/area-model.json`.

For a plan-repo target, read `../plan/CLAUDE.md`,
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

Before drafting findings, build a coverage table with one row per named commit,
with columns for the commit, its changed code and one disposition for the
commit as a whole. Inspect every touched file whether or not the message names
it.

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

Follow the shared protocol's **Implementation reports** and **Audit delivery**.
In place of plan and step evidence, supply the commit references as typed, the
resolved range with its short shas and the statement that no plan covers the
work. Use the commit coverage table above. Naming and allocation follow the
protocol's **File names** and **Manual phases**.

## Record

A commit-scoped round has no plan stem, so its fix commit carries no
`impl-audit-` role token. A Repo Edu record takes Repo Edu's ordinary
severity-prefixed conventional form. A plan-repo record takes the subject
grammar's O2 off-plan form, `<tag> <growth> <sequence> <kind>: <sentence>`.
Its body uses unbracketed tiers with `[section:]` locations. Every record follows
the shared protocol's **Record bullets**.

Direct clean completion follows the shared protocol. It creates no record
because no stem scan reads one for a commit target.

## Settlement

A commit-scoped round is one-shot. The range is the scope, and the round ends at its report. The fix
lands its record and follows the shared protocol's **Deleting reports**. There is no episode, no
`implemented:` or `closed:` marker and no trajectory watch. A later round over later commits is a
new round, not a continuation of this one.

`pnpm audit-round` accepts these same references as its target arguments.
It passes them to the audit phase unchanged, which resolves and fixes the
scope under **Range** above. Commit targets reject multiple auditor entries and run no
trajectory glance or watch after the fix and brief.

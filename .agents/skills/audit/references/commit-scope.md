# Commit-scoped round

The audit workflow at `workflow.md` routes here when the invocation names a
revision or a revision range instead of a plan. A commit-scoped round judges
work that no plan covers.

This file supplies what a plan supplies in an ordinary round: the round's
scope, the gate it passes, the baseline its findings are judged against, its
coverage table, its report name, its record and its settlement. It replaces
the **Ready gate**, **Round strategy**, **Coverage**, **Episode settlement**
and **Report file** sections of `workflow.md`, and the plan reads in its
**Evidence** section. Read the rest of `workflow.md` as written, including the
tiers, the finding metadata tokens, the growth tags, the trade pricing, the
round yield, the fix guard, the twins and the cleanup.

The round's repo set is the repo the round runs in. The plan repo is read as a
source of standing rules, never as a source of intent.

## Range

The user names the range. Follow it exactly. Never select, propose or replace
it. The range may be given as `<from>..<to>`, as a list of commits or as one
sha, which scopes the round to that commit alone. Ignore prose around the
commits the user names, and never resolve a range from prose alone. When the
invocation names no commit, ask for one and wait.

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
read at HEAD.

## Gate

Before any audit work, check three things.

- The working tree is clean. A dirty tree means the round would judge code that
  is not committed.
- Every commit in the range is reachable from HEAD.
- No commit in the range carries a plan stem.

A commit carrying a plan stem belongs to a plan-scoped round, which judges it
against a plan this round cannot read. Name every such commit, say those
commits are out of scope and stop. Continue only when the user explicitly says
to. When the user continues, the named commits stay out of the coverage table,
and the files they touched are judged like any other code the round reads.

## Baseline

Each commit subject and each body bullet in the range is one claim. A claim is
what the commit says it did. Judging it means asking whether the code at HEAD
matches that statement.

The standing sources replace the plan. Read this repo's root `CLAUDE.md`, the
`CLAUDE.md` of every package the range touched, `../plan/BOUNDARIES.md`,
`../plan/GROWTH-PATTERNS.md` and
`tools/architecture-check/src/area-model.json`.

A boundary entry, and a user ruling recorded in the commit bodies of the areas
the range touched, are settled. Correctness or quality evidence can reopen one.
Taste never does. This is the protection a plan's **Decisions** entries give an
ordinary round.

## Coverage

Before drafting findings, build a coverage table with one row per claim, with
columns for the claim, the commit it comes from and one disposition.

- `holds`: the code at HEAD does what the claim says.
- `overreached`: the commit changed more than its claim states.
- `short`: the claim is not fully delivered.
- `superseded`: a later commit in the range undid it.

Close the table with two lines.

```text
Commit coverage: C/T claims hold; V overreached; N short; R superseded.
Unclaimed: <paths, or none>.
```

The unclaimed line names every tracked file the range touched that no claim
covers. Such a file is either a change nobody recorded or a claim that failed
to name its own reach, so the line is evidence either way.

## What this round looks for

An ordinary round judges shipped code against a plan. This round judges shipped
code against the standing sources and against the log, which is the only
durable memory this work has. Beyond the defects any round finds, grade these
with the same tiers and tokens.

- A commit body that misdescribes what landed.
- A severity sequence whose tier counts, case, `!` mark or trailing
  `growth-<level>` or `pruning-<level>` disagrees with the commit's own diff.
- A conventional kind or scope that does not match the change, such as a `fix:`
  that reshapes ownership.
- An unclaimed change from the coverage line above.
- A new tracked source file that no primary area owns, against the source
  growth gate in this repo's `CLAUDE.md`.

## Pre-existing code

A defect in a part of a touched file that the range did not write still lands
as a finding. Say in its prose that it is pre-existing, so the reader can tell
it apart from the range's own work.

## Report

Report order follows `workflow.md` with the range in place of the plan. Open by
naming the workflow that ran, this repo, the range with its short shas and the
statement that no plan covers the work. Then the coverage table with its two
closing lines, then the run statement and pricing when one applies, then the
numbered tiered findings.

Write the report to this repo's root as
`AUDIT-<from>-<to>-all-<auditor>-<own-sha>.md`, with `<from>` and `<to>` the
range's short shas and a single-commit round repeating its sha in both places.
The scope token is `all`, because the range is the whole of the round's scope.
The vet, rebuttal and fix workflows read this name under their existing rules.

## Record

A commit-scoped round has no plan stem, so its fix commit takes this repo's
ordinary severity-prefixed conventional subject, the form `CLAUDE.md` gives a
commit unattached to a plan. It carries no `impl-audit-` role token, so the
repeated-fix gate counts it like any other fix. The body keeps the fix
workflow's finding bullets with their metadata tokens and the round's two yield
lines.

A clean round lands no commit. No stem scan reads a record here, so a clean
record would have no reader.

## Settlement

A commit-scoped round is one-shot. The range is the scope, and the round ends at
its report, which the fix phase lands and deletes. There is no episode, no
`implemented:` or `closed:` marker and no trajectory watch. A later round over
later commits is a new round, not a continuation of this one.

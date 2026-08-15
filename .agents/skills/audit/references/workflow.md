# Implementation audit workflow

Interpret the invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `plan-<topic>.md` or `../plan/plan-<topic>.md`. Interpret `3-5`
as a range and `4` as one step, counted against the plan's **Implementation
plan** numbering. A range makes the round scoped. No range makes it complete.
When no plan is named, ask which plan to audit and wait.

Follow this repo's `CLAUDE.md` throughout the audit. This workflow audits
implementation code. Planning artifact audits belong to the sibling plan
repo's own audit workflow.

## Ready gate

Before any audit work, run the stem scan in `../plan`: `git log --oneline`
filtered to subjects starting with `<file-stem>/`. The gate passes while the
plan's newest standing marker is `<file-stem>/ready:` or
`<file-stem>/implemented:`, read by the plan repo's recognition rule: empty
stem commits, the markers and the `clean:` records never void a marker, while
any file-changing stem commit after a marker voids it. When the gate fails,
name the newest stem commit, state that the plan is not in a ready or
implemented state and stop. Continue only when the user explicitly says to.

## Round strategy

Audit a plan by complete rounds alone, or by scoped rounds over step ranges
followed by one complete closing round. On a plan's first round, invoked
without a range and with no audit commit, fix or record for this plan in the
log, do not start inspecting. Size the work from cheap evidence only: the
plan's step count, the episode's commit count and the files and packages it
touches. Recommend one strategy: complete rounds only for a small plan, or
scoped rounds plus the closing round for a large one. Propose the ranges. Cut
ranges where the plan's step groups fall. Keep steps that share a package or
an invariant in one range. Never cut ranges into equal arithmetic parts. Then
wait for the user's choice. The advice fires only on that first round. A given
range or an existing audit commit skips it.

## Round

Run one read-only implementation-audit round. Judge whether this repo correctly
implemented the plan. Report in the order prescribed below, then stop for
discussion. Edit only after the user accepts or revises the findings and asks
for them to be applied.

Close every round with exactly one commit after the user settles its outcome.
A round whose accepted findings changed files lands the fix commit:
severity-prefixed per this repo's convention, with its body opening with the
`Plan: <name>` line followed by `Audit: complete` or `Audit: steps <a>-<b>`
naming the round's scope. Any other outcome, a clean round or findings the user
declined, lands an empty record commit: `chore(audit): <plan-name> <scope>
clean` or `... declined`, carrying the same `Plan:` and `Audit:` body lines.
One round, one commit: the log alone shows every round that ran, its scope and
its outcome, including the clean rounds that would otherwise exist only in
chat.

## Evidence

Scope the implementation episode the way the watch does. Anchor on the
earliest commit whose `Plan: <name>` first body line names this plan, where
`<name>` is the file stem with the `plan-` prefix dropped. Walk from that
anchor to HEAD, including every commit that carries the same `Plan:` line or
touches the same files.

When the plan is under `../plan/archive/<name>/`, first read `README.md` in the
same folder when it exists. It records later outcomes that the frozen plan
cannot carry. Treat a recorded correct departure under the deviation rules
below, not as a strict conformance failure.

Read the plan end to end. Read the final state of the code the episode touched.

A round is read-only until the user accepts its findings, so its evidence
commands must be read-only too. `pnpm check` is not one. It expands to
`pnpm fix && pnpm typecheck && pnpm build:types && ...`, where `fix` writes
Biome and rumdl corrections across the tree and `build:types` writes `dist/`
and the `tsc -b` build info. Run `pnpm lint`, `pnpm fmt:check` and
`pnpm typecheck` instead. They report the same state and touch nothing.

Scope the tests to the packages the round's range touches, with
`pnpm --filter <package> test`. The whole suite belongs to the closing round.

The writing commands belong to the fix phase alone, after the user accepts the
findings. Run them only while no other round is running in this working tree.
Two runs of `pnpm check` at once corrupt each other's tree and each other's
result, because both auto-fix the same files and both drive `tsc -b` over the
same build info.

## Fix phase

After the user accepts the round's findings, apply them, then verify. Run
`pnpm check`, then `pnpm --filter <package> test` for every package the fixes
touched. The read-only rule above defers `pnpm check` to this phase; it does
not exempt the round from it. What the closing round reserves is the whole
test suite, not the check.

## Coverage

Before drafting findings, build a coverage table, one row per item in scope,
with columns for the item, the implementing commits or code and one
disposition: implemented, deviated, incomplete or dropped. A complete round's
scope is every **Implementation plan** step and every **Decisions** entry.
Steps the episode has visibly not reached yet land as incomplete rows, not as
graded findings. A scoped round's table carries only the named steps, because
classification is the inspection the range exists to skip. The round still
checks the in-range code against every **Decisions** entry, since decisions
bind the whole plan, and violations land as findings.

Close the table with one line in the form `Implementation coverage: I/T
implemented; V deviated; N incomplete; R dropped.` The table proves the round
inspected its whole scope rather than only the areas where findings cluster. A
clean report still includes the table and the coverage line before it says
there are no findings.

## Judging deviations

This is not a strict conformance audit. Where the implementation departed from
the plan, judge the shipped code first. It must be correct and of the best
quality the repo's standards allow. A departure that responds to a real error
or imperfection in the plan is correct behaviour. Record it as deviated in the
table, not as a finding, when the code is right. A deviation whose reason no
commit body records is itself a finding. Grade it by the cost of a later reader
mistaking intent for drift. Code that faithfully followed a defective plan
into a defect is still a finding. The standard is the shipped code, never
fidelity for its own sake. Do not reopen decisions the plan settled. Question
one only on correctness or quality evidence, never on taste.

## Findings

Grade each finding with the [A]-[D] implementation tiers in this repo's
`CLAUDE.md`, sorted A through D. Findings land on the implementation. When a
finding's root cause is the plan itself, say so in the finding and repeat the
plan-side correction as a plan feedback entry.

## Plan feedback

After the tiered list, report every error or imperfection the audit found in the
plan itself, one line each, for the user to take back to `../plan`. This audit
never edits plan files.

## Closing round

Scoped rounds never close the plan, even when their ranges tile every step.
Each scoped verdict describes the HEAD it ran on, and later steps age it. The
proof that the plan is implemented is complete rounds on the finished code
whose severity has stabilised at C or below with no new A, each round's table
classifying every row. A round that finds nothing is not required. Prior audit
commits inform those rounds, ranking their reports and naming the fixes to
re-verify. They never excuse a row from inspection.

The closing round expects `<file-stem>/implemented:` as the newest stem commit.
When it is missing, name that once and continue on the user's word. The round
closes with its own single commit under the one-round-one-commit rule above: a
fix commit when its accepted findings changed files, the empty record commit
otherwise. It lands no further status commit here. The status is recorded once,
in `../plan`, by the `<file-stem>/implementation-audited:` marker this session
writes there on the user's word. The marker is severity-free. Its body names
the HEAD the closing round inspected and compiles the audit round history from
this repo's audit commits.
The closing round runs `pnpm check` and the whole `pnpm test` suite, once.
Run them after the fixes when the round lands fixes, so the single run
verifies the state the commit records. Run them up front as evidence when the
round comes back clean.

The closing round is advice, not a gate. When asked to treat the implementation
as done without one, name the missing round once and continue on the user's
word.

## Report order

Open by naming the plan file, its ready commit, the episode's commit range and
the round's scope: complete, or the audited step range. Then report the
coverage table with its coverage line, the tiered findings and the plan
feedback. Stop there.

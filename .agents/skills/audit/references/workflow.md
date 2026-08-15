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

Before any audit work, read the named file for the plan-repo artifacts this
workflow cannot audit: a `topology-<topic>.md`, a `topology-<topic>-detail.md`,
a `draft-<topic>.md` or a `carry-<topic>.md`. Each is a planning artifact, so
naming one means the round was meant for the plan repo's own audit. Name the
file, say the round belongs there and stop. Continue only when the user
explicitly says to.

## Ready gate

Before any audit work, run the stem scan in `../plan`: `git log --oneline`
filtered to subjects starting with `<file-stem>/`. The gate passes when the
scan holds a `<file-stem>/implemented:` marker, or a standing
`<file-stem>/ready:` one, read by the plan repo's recognition rule: a
file-changing stem commit voids a standing `ready:`, while the
`implemented:` marker records what held at the sibling commit its body names
and no later plan commit withdraws it. A plan correction this audit wrote
therefore never blocks the next round. When the gate fails,
name the newest stem commit, state that the plan reached neither a ready nor
an implemented state and stop. Continue only when the user explicitly says
to.

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
One round, one commit per repo the round changes: exactly one commit here, plus
the single `../plan` commit described under [Plan corrections](#plan-corrections)
when the round corrected the plan. The log alone shows every round that ran, its
scope and its outcome, including the clean rounds that would otherwise exist only
in chat.

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
commands must not change tracked files. Build the verification set from every
package whose code or behaviour the round audits. Include a repo tool only
when the audit concerns the rule that tool enforces.

Read each affected package's `CLAUDE.md` and `package.json`. Run its `check`
and `test` scripts when they exist, plus the relevant validation named by the
package guidance or plan. Use `pnpm --filter <package> <script>` for package
scripts. If a required command can change tracked files, defer it to the fix
phase and use its read-only form for evidence.

Do not run a root whole-workspace script only because an implementation audit
is running. The round's scope decides the checks and tests.

## Fix phase

After the user accepts the round's findings, apply them. One acceptance covers
the whole round: the code fixes here and the plan corrections in `../plan`. Then
rebuild the verification set from the packages the round audited and the packages
the fixes touched. Format only the fixed files. Run each affected package's
required `check`, `test` and validation scripts. Include a repo tool only when
the audit or fix concerns the rule it enforces.

For implementation-audit fixes, this package-scoped rule replaces the root
verification default. Do not run root `pnpm check` or the whole `pnpm test`
suite unless affected package guidance or the plan requires that exact root
command. Run writing commands only while no other audit fix is running in the
working tree.

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
finding's root cause is the plan itself, say so in the finding and carry the
plan-side correction into the plan corrections below.

## Finding shape

State the required correction first, even when the evidence behind it is
subtle. The reader should see what to do before they have to decode anything.
Each finding then gives its evidence and, at tiers A to C, its failure trace. A
D-tier finding derives the trace to grade itself and leaves it out of the
report, because D is the floor and there is nothing below to check against.

The trace starts on its own line prefixed `Failure trace:`, never run into the
end of the finding's prose, so the correction and the trace read as separate
parts. It carries up to two short sentences.

- What goes wrong. The wrong behaviour the shipped code produces. Always
  written.
- How rare. The condition that has to hold before that behaviour appears.
  Written only when the situation is rare.

Silence on the second sentence means the situation arises in ordinary use. So a
fault the user meets normally carries the first sentence alone, and the reader
may take a one-sentence trace as a common fault rather than a forgotten rating.

Do not restate how serious the fault is. Severity is the tier itself, graded by
the [A]-[D] rubric in this repo's `CLAUDE.md`, so a severity clause in the trace
says the same thing twice. Rarity is the part no other piece of the finding
carries: it is why a rare fault may still be worth leaving, while a fault met in
ordinary use is fixed whatever its tier.

A finding whose whole cost is rework, re-derivation or a later reader mistaking
intent for drift has no runtime situation to rate. Its trace states that cost
and stops. It carries no rarity sentence and none is implied.

The trace is the tier's evidence, so a tier claim without one does not stand.
Rarity is evidence for the user's accept-or-challenge ruling on the finding and
on any guard behind it. It never moves the tier: a rare A-tier fault is still
A-tier. A trace that ends with the same behaviour shipping is not a finding, so
drop it rather than report it.

## Plan corrections

The plan is a live document while its steps are still being implemented, so an
error the audit finds in it is fixed by the round that found it. This audit
writes the plan file. It never writes a topology, a detail topology, a draft or
a carry: those belong to the plan repo's own rounds.

Split each correction by whether the fix needs a choice.

- No choice needed. The plan states something the shipped code shows is false,
  and one fix is plainly right: a step naming a function that no longer exists,
  a broken cross-reference, a step the code proved impossible, a **Decisions**
  entry the shipped code contradicts where the code is right. Write the fix and
  show it in the report. The user strikes or revises it during the discussion.
- A choice is needed. More than one sensible fix exists, usually because an
  earlier step changed what a later step should do. Put the options to the user
  during the discussion, take the answer and write it into the plan together
  with the reason the user gave. A decision written without its reason is
  re-derived and reversed by a later plan round, which is the failure this rule
  exists to prevent.

Before rewriting a **Decisions** entry, read the topology the plan came from,
in `../plan` root while the transfer phase is open and under
`../plan/archive/<name>/` after loop-close. The user should not choose against a
reason the plan never carried forward. Absence of a topology is normal, not an
error.

Every correction traces to the shipped code this round inspected or to a choice
the user made in this round's discussion. Do not author plan-tier work on any
other basis.

The corrections land as one commit in `../plan` under that repo's commit
convention, subject `<file-stem>/implementation-<severity sequence>:`, graded by
that repo's tiers. Its body follows that repo's bullet rules and names the
commit range this round inspected here. The correction commit leaves a standing
`ready:` marker in place. A round that corrects no plan file commits nothing
there.

## Closing round

Scoped rounds never close the plan, even when their ranges tile every step.
Each scoped verdict describes the HEAD it ran on, and later steps age it. The
proof that the plan is implemented is complete rounds on the finished code
whose severity has stabilised at C or below with no new A, each round's table
classifying every row. A round that finds nothing is not required. Prior audit
commits inform those rounds, ranking their reports and naming the fixes to
re-verify. They never excuse a row from inspection.

The closing round expects a `<file-stem>/implemented:` marker in the stem
scan. A later plan commit does not unseat it, so a plan correction an earlier
round wrote leaves the marker standing. When the marker is missing, name
that once and continue on the user's word. The round
closes with its own single commit under the one-round-one-commit rule above: a
fix commit when its accepted findings changed files, the empty record commit
otherwise. It lands no further status commit here. The status is recorded once,
in `../plan`, by the `<file-stem>/implementation-audited:` marker this session
writes there on the user's word. The marker is severity-free. Its body names
the HEAD the closing round inspected and compiles the audit round history from
this repo's audit commits.
The closing round uses the same package-scoped verification rule. Its set
includes every package the complete episode concerns, not every package in the
workspace. Run the required checks and tests once after accepted fixes, or as
evidence when the round comes back clean.

The closing round is advice, not a gate. When asked to treat the implementation
as done without one, name the missing round once and continue on the user's
word.

## Report order

Open by naming the workflow that ran, an implementation audit in this Repo Edu
repo, then the plan file, its ready commit, the episode's commit range and
the round's scope: complete, or the audited step range. Then report the
coverage table with its coverage line, the tiered findings and the plan
corrections. Stop there.

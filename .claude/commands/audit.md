---
description: Run a read-only implementation audit of a ready plan from ../plan against the code that implemented it, reporting tiered findings in a concise form.
argument-hint: [plan-file] [step-range]
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the audit below.

One additional requirement, this command only: report tiered findings in a
concise form. Each A, B, C or D finding carries three parts and nothing
else: the correction, the evidence, the failure trace. Write each part as
one short sentence; when a part does not fit, split it into two short
sentences rather than pack it. A long sentence is not concise. Plan
feedback entries stay one line each.

The arguments below name the work. The first is the plan to audit: a plan
file in the sibling `../plan` repo, given as `plan-<topic>.md` or
`../plan/plan-<topic>.md`. When no plan is named, ask which plan to audit
and wait. The second, optional, is a step range: `3-5`, or `4` for one
step, counted against the plan's **Implementation plan** numbering. With a
range the round is scoped; without one it is complete.

## Ready gate

Before any audit work, run the stem scan in `../plan`: `git log --oneline`
filtered to subjects starting with `<file-stem>/`. The gate passes while
the plan's newest standing marker is `<file-stem>/ready:` or
`<file-stem>/implemented:`, read by the plan repo's recognition rule:
empty stem commits, the markers and the `clean:` records, never void a
marker, while any file-changing stem commit after a marker voids it. When
the gate fails, name the newest stem commit, state that the plan is not in
a ready or implemented state and stop. Continue only when the user
explicitly says to.

## Round strategy

A plan is audited by complete rounds alone, or by scoped rounds over step
ranges followed by one complete closing round. On a plan's first round,
invoked without a range and with no audit commit, fix or record, for this
plan in the log, do not start inspecting. Size the work from cheap evidence only: the
plan's step count, the episode's commit count and the files and packages
it touches. Recommend one strategy, complete rounds only for a small plan
or scoped rounds plus the closing round for a large one, and propose the
ranges. Cut ranges where the plan's step groups fall, steps that share a
package or an invariant staying in one range, never into equal arithmetic
parts. Then wait for the user's choice. The advice fires only on that
first round; a given range or an existing audit commit skips it.

## Round

Run one read-only implementation-audit round: judge whether this repo
correctly implemented the plan. Report in the order prescribed below, then
stop for discussion. Edit only after the user accepts or revises the
findings and asks for them to be applied. Every round then closes with
exactly one commit. A round whose accepted findings changed files lands
the fix commit: severity-prefixed per this repo's convention, its body
opening with the `Plan: <name>` line followed by `Audit: complete` or
`Audit: steps <a>-<b>` naming the round's scope. Any other outcome, a
clean round or findings the user declined, lands an empty record commit:
`chore(audit): <plan-name> <scope> clean` or `... declined`, carrying the
same `Plan:` and `Audit:` body lines. One round, one commit: the log alone
shows every round that ran, its scope and its outcome, including the clean
rounds that would otherwise exist only in chat.

## Evidence

Scope the implementation episode the way the watch does. Anchor on the
earliest commit whose `Plan: <name>` first body line names this plan, where
`<name>` is the file stem with the `plan-` prefix dropped. Walk from that
anchor to HEAD, including every commit that carries the same `Plan:` line or
touches the same files. When the plan is under
`../plan/archive/<name>/`, first read `README.md` in the same folder when it
exists. It records later outcomes that the frozen plan cannot carry. Treat a
recorded correct departure under the deviation rules below, not as a strict
conformance failure. Read the plan end to end, and read the final state of the
code the episode touched. `pnpm check` and `pnpm test` may run as read-only
evidence.

## Coverage

Before drafting findings, build a coverage table, one row per item in
scope, with columns for the item, the implementing commits or code and one
disposition: implemented, deviated, incomplete or dropped. A complete
round's scope is every **Implementation plan** step and every **Decisions**
entry; steps the episode has visibly not reached yet land as incomplete
rows, not as graded findings. A scoped round's table carries only the named
steps, because classification is the inspection the range exists to skip;
the round still checks the in-range code against every **Decisions** entry,
since decisions bind the whole plan, and violations land as findings. Close
the table with one line in the form
`Implementation coverage: I/T implemented; V deviated; N incomplete; R dropped.`
The table proves the round inspected its whole scope rather than only the
areas where findings cluster. A clean report still includes the table and
the coverage line before it says there are no findings.

## Judging deviations

This is not a strict conformance audit. Where the implementation departed
from the plan, judge the shipped code first: it must be correct and of the
best quality the repo's standards allow. A departure that responds to a
real error or imperfection in the plan is correct behaviour; record it as
deviated in the table, not as a finding, when the code is right. A
deviation whose reason no commit body records is itself a finding: grade it
by the cost of a later reader mistaking intent for drift. Code that
faithfully followed a defective plan into a defect is still a finding; the
standard is the shipped code, never fidelity for its own sake. Do not
reopen decisions the plan settled: question one only on correctness or
quality evidence, never on taste.

## Findings

Grade each finding with the [A]-[D] implementation tiers in this repo's
`CLAUDE.md`, sorted A through D. Findings land on the implementation. When
a finding's root cause is the plan itself, say so in the finding and repeat
the plan-side correction as a plan feedback entry.

## Plan feedback

After the tiered list, report every error or imperfection the audit found
in the plan itself, one line each, for the user to take back to `../plan`.
This audit never edits plan files.

## Closing round

Scoped rounds never close the plan, even when their ranges tile every
step: each scoped verdict describes the HEAD it ran on, and later steps
age it. The proof that the plan is implemented is one complete round on
the finished code whose table is clean. Prior audit commits inform that
round, ranking its report and naming the fixes to re-verify; they never
excuse a row from inspection. The closing round expects
`<file-stem>/implemented:` as the newest stem commit; when it is missing,
name that once and continue on the user's word. When the closing round's
table is clean and the user accepts it, land the round's record commit
here, then the `<file-stem>/implementation-audited:` marker commit in
`../plan`: severity-free, its body naming the HEAD this round inspected
and compiling the audit round history from this repo's audit commits. The
closing round is advice, not a gate: asked to treat the implementation as
done without one, name the missing round once and continue on the user's
word.

## Report order

Open by naming the plan file, its ready commit, the episode's commit range
and the round's scope: complete, or the audited step range. Then the
coverage table with its coverage line, the tiered findings, the plan
feedback, and stop.

$ARGUMENTS

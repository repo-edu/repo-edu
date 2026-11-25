---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../../references/round-protocol.md
  - commit-scope.md
  - ../../../../../plan/GROWTH-PATTERNS.md
  - ../../../../../plan/BOUNDARIES.md
  - ../../../../tools/audit-round/src/listed-files.json
---

# Implementation audit workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole. Read each file once. Apply the `simple`
requirement to the whole session and skip its confirm-and-wait step.

The shared [round protocol](../../../references/round-protocol.md) owns
evidence rules, finding grades, rating meanings, reconciliation and runner
result meanings. The runner supplies the result schema. Its
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing) owns
target resolution and argument order. Count the supplied step scope against
the plan's **Implementation plan** numbering.

An invocation that names no plan file and names commit references, including
`HEAD` or `HEAD-<n>`, makes the round commit-scoped, judging work no plan
covers. After the audit report output path, its phase arguments contain the parsed
commit groups in command-line order, with the fields the runner's
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing) names.
The runner has resolved every original reference and validated any typed
inclusive range. It builds each later exact commit set from the original
commits and earlier landed fixes. Use `commit-scope.md`
beside this file for that round's scope, gate, baseline, coverage, audit report name,
record and settlement. Its workflow checks only these facts:

1. No file a group touched has uncommitted changes.
2. Each original list is contiguous in first-parent history.
3. Every current commit is reachable from HEAD.
4. No commit in the original set carries a plan stem.

Follow the rest of this workflow unchanged.

This procedure also serves implementation-audit rounds on changes hosted by the plan repo. Follow
the `CLAUDE.md` of every repo the round judges. Use the shared protocol's **Finding metadata** for
each repo's findings.

An audit with findings ends at its audit report file. An audit without findings follows
[Clean completion](#clean-completion). The rebuttal phase answers the vetters on the auditor's
model. The fix phase reads the audit report and its available vet and rebuttal reports, applies
settled corrections and lands the records. It writes a ruling document when the user must decide an
open item.

## Ready gate

Before any audit work, run the stem scan in `../plan`: `git log --oneline` filtered to the topic's
`<stem>/` subjects. The gate passes when that scan contains a `<stem>/ready` marker, which stands
until loop-close. When the gate fails, name the newest stem commit, state that the plan is not ready
and stop. Continue only when the user explicitly says to.

## Round strategy

The user sets the step range, or gives the plan alone or no target so the
command resolves one under the runner's
[Plan targets](../../../../tools/audit-round/CLAUDE.md#plan-targets). The
audit workflow follows each supplied resolved range exactly. Never select, propose or replace
it.

The runner supplies the judged repos and their heads in the audit scope. It
takes the hosts from the selected implementation steps.

For a plan-scoped implementation audit, the runner adds one final object with
the plan's open deferrals into Repo Edu. Those deferrals add Repo Edu to the
repo set for their named corrections, even when the selected steps are hosted
only in the plan repo. This does not replace or widen the selected step range.

## Round

Run one read-only implementation-audit round. Judge only the repos in the
round's repo set. Report in the order prescribed below under [Audit report file](#audit-report-file)
and complete a clean outcome under [Clean completion](#clean-completion), or
stop when there are findings.

Use the shared round protocol's **Finding metadata** for the location and rating
tokens on each finding, including cross-repo deferrals.

## Evidence

Assess the implementation and draft findings against the supplied growth
patterns.

In every judged repo, locate the implementation commits for the user-named
steps through the joined topic stems. Follow later corrections and the history
of the files those steps changed, including off-plan corrections, to find the
evidence needed to judge their current behaviour and recorded departures.
Read both repos for a both-repo round. This discovers scope evidence; it does
not compute the watch episode or classify its trajectory.

Read the plan end to end. Read the current files that implement every in-scope step
in every judged repo, including files added or moved by later corrections.

Check the supplied boundaries beside the plan: boundaries change only by user
decision, so the current file can be newer than the plan. This is a check, not
a source of findings. A boundary is not a minimum the round may raise, and the
round never edits the file. The check covers three things. Shipped code that
crosses a current boundary lands as a finding. A plan step that conflicts with
a current boundary becomes a cross-repo finding under
[Cross-repo findings](#cross-repo-findings). And the round's own outputs are
held to the same line: a proposed correction or deviation ruling that would
cross a boundary does not land.

A round is read-only and runs no checks and no tests. Its evidence is what it
reads. For Repo Edu files, read
each affected package's `CLAUDE.md` and `package.json` for its rules; do not
run its scripts. For plan-repo files, read that repo's `CLAUDE.md` for its rules.

## Coverage

Before drafting findings, build a coverage table from the parsed
**Implementation plan**, with one row per step in the concrete range. Give each
row its implementing commits or code and one disposition: implemented,
deviated, incomplete or dropped. A range from step 1 through the plan's last
listed step is whole-plan. It expects an `implemented` marker in every repo
that hosts a listed step, newer than that repo's latest hosted step. Apply the
shared protocol's settlement rule when a marker is missing or stale. Steps the
episode has visibly not reached yet stay incomplete rows, not graded findings.
Every round inspects the complete in-range implementation and checks every
binding **Decisions** entry without adding decision rows. Violations land as
findings.

Close the table with the counts in this line.

`Implementation coverage: I/T implemented; V deviated; N incomplete; R dropped.`

The table shows the scope the round inspected. A clean audit report includes the
table and its counts before it says there are no findings.

## Listed files

Compare the files the in-scope steps changed, in each judged repo, with that
repo's paths in the supplied list of files. Apply the implementation-audit
duties of the shared planning rules'
[Doctrine changes](../../../../../plan/.agents/references/planning-rules.md#doctrine-changes),
which own the failure-record check, the finding for a plan without one and the call on
a finding whose correction goes beyond the failure-record check. When a step changed a
listed file, read `../plan/FAILURES.md` whole, and the audit report's opening
says so and cites that section and the failure record.

A commit-scoped round makes no comparison, because no plan covers its work.
Its fix applies no listed-file finding, and `commit-scope.md`'s **Record** says
where that finding goes.

## Findings

Grade each finding with the
[implementation tiers](../../../references/round-protocol.md#implementation-tiers).
When a finding's root cause is the plan itself, say so and carry the plan
correction under [Cross-repo findings](#cross-repo-findings). Apply the shared
protocol's **Finding metadata**.

## Cross-repo findings

Use the shared protocol's
[Shared implementation forms](../../../references/round-protocol.md#shared-implementation-forms)
for directed fixes and deferrals, and the shared protocol's **Finding metadata**
for their location tokens. State the required correction, the inspected-code
evidence and any user ruling with its reason.

Split each plan-bound cross-repo finding into these cases. The shared
protocol's **Finding metadata** decides which of them is a deferral.

- Stale text, under the stale-text rule of the shared protocol's
  [Finding metadata](../../../references/round-protocol.md#finding-metadata).
- No choice needed. The correction changes the plan's substantive reference,
  but one correction stands. When it changes a plan decision's meaning or
  reason, the finding carries the comparison of the shared planning rules'
  [Changes to what a plan holds](../../../../../plan/.agents/references/planning-rules.md#changes-to-what-a-plan-holds),
  and that section decides who settles it. A missing rule or row is new work:
  show its correction in the audit report for the user to accept or revise.
- A choice is needed. More than one sensible correction exists. Put the options
  in the audit report. The fix phase puts them to the user and carries the answer and
  its reason in the deferral, or keeps the choice open when the user does not
  rule, instead of choosing for them.

Before proposing a change to a **Decisions** entry, read the archived source the
plan came from when one exists. The user should not choose against a reason the
plan never carried forward. Absence of an older source is normal, not an error.

Every deferral traces to the files this round inspected or to a choice the user
made in the round's fix phase. A later round applies it with a citation in the
[commit record bullet](../../../references/round-grammar.md#commit-record-bullet)
form. A graded bullet in the destination repo carries the citation when it
changes the destination. When a deferral into Repo Edu is satisfied or dropped
without a Repo Edu file change, the untiered citation bullet sits in whichever judged repo already
gets the round record. Deferrals into the plan repo still close only from plan
commits. The citation closes the deferral without a text comparison.

Judge every supplied deferral into Repo Edu against current code. A missing
correction becomes a finding that names the deferring full commit ID and
position. Its fix record cites that item. When current code already holds the
correction, the audit reports no finding for that item. Instead, its audit report
opening adds one line in the form `Satisfied deferral: <full-sha>/<position> <title>.`.
The audit report opening carries that judgement into the fix, and the runner
passes the fix the same object. The audit report must account for every supplied
item through either a satisfied-deferral line or a finding. Every completed
route cites every supplied deferral.

## Episode settlement

Follow the shared protocol's
[Implementation settlement](../../../references/round-protocol.md#implementation-settlement).

## Audit report order

Follow the shared protocol's
[Audit reports](../../../references/round-protocol.md#audit-reports) for the
reporting discipline. Supply the plan, ready commit, implementation commits
and resolved range from this audit's evidence. Deliver the complete audit
report under [Audit report file](#audit-report-file).

## Audit report file

Follow the shared protocol's
[Audit reports](../../../references/round-protocol.md#audit-reports) and the
runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).

## Clean completion

Follow the shared protocol's
[Direct clean completion](../../../references/round-protocol.md#direct-clean-completion).

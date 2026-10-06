---
reads:
  - ../../../references/round-protocol.md
  - ../../../../../plan/CLAUDE.md
  - commit-scope.md
  - ../../../../../plan/GROWTH-PATTERNS.md
  - ../../../../../plan/BOUNDARIES.md
  - ../../../../../plan/STOP-CONDITIONS.md
---

# Implementation audit workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole; in a hand-run session, read them whole, following
any listed workflow's header too. Read each file once.

The shared launchers live in the plan checkout under
`home/claude/commands/audit.md` and `home/agents/skills/audit/SKILL.md`.
The runner selects this workflow and its working checkout for both entry routes.
Where a launcher and this file disagree, this file is right.

The shared [round protocol](../../../references/round-protocol.md) owns
file names, writer tags, evidence rules, finding shape, yield, rating tokens and runner results.
Follow its **Manual phases** and **Later files** for target resolution and
argument order. Count the supplied step scope against the plan's
**Implementation plan** numbering.

An invocation that names no plan file and names commit references, including
`HEAD` or `HEAD-<n>`, makes the round commit-scoped, judging work no plan covers.
Resolve the references under **Range** in `commit-scope.md` before asking Git
to resolve them; `HEAD-<n>` is workflow shorthand. Use
`commit-scope.md` beside this file for that round's scope, gate, baseline,
coverage, report name, record and settlement, and follow the rest of this
workflow unchanged.

This procedure also serves implementation-audit rounds on changes hosted by the plan repo. Follow
the `CLAUDE.md` of every repo the round judges. Use the shared protocol's **Finding metadata** for
each repo's findings.

An audit with findings ends at its report file. An audit without findings follows
[Clean completion](#clean-completion). The auditor answers the vet in the rebuttal
phase. The fix phase reads the report and its available review twins, applies
settled corrections and lands the records. It writes a ruling document when
the user must decide an open item.

## Ready gate

Before any audit work, run the stem scan in `../plan`: `git log --oneline`
filtered to the topic's joined bare, `plan-<topic>` and `topology-<topic>`
subject stems. The gate passes when that scan contains a `ready:` marker, which
stands until loop-close. When the gate fails, name the newest joined-stem
commit, state that the plan is not ready and stop. Continue only when the user
explicitly says to.

## Round strategy

The user sets the step range, or gives the plan alone or no target so the
command resolves one under the shared protocol's
[Plan targets](../../../references/round-protocol.md#plan-targets).
Follow the resolved range exactly. Never select, propose or replace it. The
plan's **Execution and audits** subsection is guidance for the user, not
instructions for the workflow.

The step range decides the repo set. Derive each in-range step's hosting repo
from the files its plan text says to change. A step may be hosted by Repo Edu,
the plan repo or both. The round's repo set is the union of those hosts; a
whole-plan round derives it from every step. When a host is unclear, stop for a
plan correction.

## Round

Run one read-only implementation-audit round. Judge only the repos in the
round's repo set. Report in the order prescribed below under [Report file](#report-file)
and complete a clean outcome under [Clean completion](#clean-completion), or
stop when there are findings.

Use the shared round protocol's **Finding metadata** for the location and rating
tokens on each finding, including cross-repo deferrals.

## Evidence

Assess the implementation and draft findings against the supplied growth
patterns. Judge the report's stop-or-continue recommendation against the
supplied stop conditions.

In every judged repo, locate the implementation commits for the user-named
steps through the joined topic stems. Follow later corrections and the history
of the files those steps changed, including off-plan corrections, to find the
evidence needed to judge their current behaviour and recorded departures.
Read both repos for a both-repo round. This discovers scope evidence; it does
not compute the watch episode or classify its trajectory. For the stop
recommendation only, read the subjects and **Round yield** lines of earlier
implementation-audit records for the same step scope across the joined topic
stems. Use them with this round's findings to judge whether the next round on
this scope is likely to find something worth its cost. Do not extend that
judgement into an episode grade or a targeted response; those remain the
watch's work.

When the plan is under `../plan/archive/<name>/`, first read `README.md` in the
same folder when it exists. It records later outcomes that the frozen plan
cannot carry. Treat a recorded correct departure under the shared protocol's
deviation rules, not as a strict conformance failure.

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

Before drafting findings, build a coverage table with one row per in-scope
**Implementation plan** step, its implementing commits or code and one
disposition: implemented, deviated, incomplete or dropped. A whole-plan round
covers every step; a scoped round covers only the user-named steps. Steps the
episode has visibly not reached yet stay incomplete rows, not graded findings.
Both routes inspect the complete in-scope implementation and check every
binding **Decisions** entry without adding decision rows. Violations land as
findings.

Close the table with one line in the form `Implementation coverage: I/T
implemented; V deviated; N incomplete; R dropped.` The table proves the round
inspected its whole scope rather than only the areas where findings cluster. A
clean report still includes the table and the coverage line before it says
there are no findings.

## Findings

Grade each finding with the
[implementation tiers](../../../references/round-protocol.md#implementation-tiers).
When a finding's root cause is the plan itself, say so and carry the plan
correction under [Cross-repo findings](#cross-repo-findings). Apply the shared
protocol's **Finding metadata**.

## Cross-repo findings

Use the plan doctrine's
[Shared implementation forms](../../../../../plan/CLAUDE.md#shared-implementation-forms)
for directed fixes and deferrals, and the shared protocol's **Finding metadata**
for their location tokens. State the required correction, the inspected-code
evidence and any user ruling with its reason.

Split each deferral by whether the correction needs a choice.

- No choice needed. The plan states something the shipped code shows is false,
  and one correction is plainly right: a broken cross-reference, a step naming
  a function that cannot exist or a decision the correct shipped code
  contradicts. Show the correction in the report for the user to accept or
  revise.
- A choice is needed. More than one sensible correction exists. Put the options
  in the report. The fix phase puts them to the user and carries the answer
  and its reason in the deferral, or keeps the choice open when the user does
  not rule, instead of choosing for them.

Before proposing a change to a **Decisions** entry, read the archived source the
plan came from when one exists. The user should not choose against a reason the
plan never carried forward. Absence of an older source is normal, not an error.

Every deferral traces to the files this round inspected or to a choice the user
made in the round's fix phase. The round tells the user that follow-up in the
undirected repo rests with them. A later user-directed round in that repo
collects open deferrals from the other repo's joined-stem scan, cites the
commits it applies and leaves already-corrected text alone.

## Episode settlement

Follow the shared protocol's
[Implementation settlement](../../../references/round-protocol.md#implementation-settlement).

## Report order

Follow the shared round protocol's
[Report format](../../../references/round-protocol.md#report-format) for the opening, coverage and
findings. Supply the plan, ready commit, implementation commits and user-set
scope from this audit's evidence. Open the report with the one stop-or-continue
recommendation and its reason in the protocol's exact form. Give one answer,
not a menu. Deliver the complete report under [Report file](#report-file).

## Report file

Follow the shared protocol's
[Audit delivery](../../../references/round-protocol.md#audit-delivery) and
[Audit notes](../../../references/round-protocol.md#audit-notes).

## Clean completion

Follow the shared protocol's
[Direct clean completion](../../../references/round-protocol.md#direct-clean-completion).

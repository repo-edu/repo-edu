---
reads:
  - ../../../references/round-protocol.md
  - commit-scope.md
  - ../../../../../plan/GROWTH-PATTERNS.md
  - ../../../../../plan/BOUNDARIES.md
---

# Implementation audit workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole; in a hand-run session, read them whole, following
any listed workflow's header too. Read each file once.

One shared workflow behind two launchers: the Claude command
`.claude/commands/audit.md` and the Codex skill
`.agents/skills/audit/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

The shared [round protocol](../../../references/round-protocol.md) owns
file names, writer tags, evidence rules, finding shape, yield, rating tokens and runner results.
In a runner-started audit, the first argument is
the absolute path where the runner saves the report. Deliver the report under
[Report file](#report-file) and read the remaining arguments as the audit scope.
Do not allocate or claim again. A hand-run audit follows
[Round allocation](#round-allocation).

Interpret the remaining invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `<topic>.md` or `../plan/<topic>.md`. Interpret `3-5` as a
range and `4` as one step, counted against the plan's **Implementation plan**
numbering. A range makes the round scoped. No range makes the scope `all`, the
whole plan. When neither a plan nor a commit reference is named, ask which to
audit and wait.

An invocation that names no plan file and names commit references, including
`HEAD` or `HEAD-<n>`, makes the round commit-scoped, judging work no plan covers.
Resolve the references under **Range** in `commit-scope.md` before asking Git
to resolve them; `HEAD-<n>` is workflow shorthand. Use
`commit-scope.md` beside this file for that round's scope, gate, baseline,
coverage, report name, record and settlement, and follow the rest of this
workflow unchanged.

This procedure also serves implementation-audit rounds on changes hosted by
the plan repo. Its audit workflow routes those rounds here and supplies the
local substitutions: that repo's report root and finding metadata.
Follow the `CLAUDE.md` of every repo the round judges. Planning-artifact
audits still belong to the plan repo's own audit workflow. The runner selects
that workflow when invoked from the plan root with an artifact alone. Its
sessions and round files belong to the invoking root. The shared brief launcher
stays in Repo Edu and writes beside the supplied transcript at either root.
Its launcher location never changes the session's working directory.

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

The user sets the step range. Follow it exactly. Never select, propose or
replace it. The plan's **Execution and audits** subsection is guidance for the
user, not instructions for the workflow.

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

The fix lands one record in each repo whose files took an accepted finding.
A clean round lands one record in the sole judged repo or at the invoking
root when both repos were judged, as named in the report opening.

Use the shared round protocol's **Finding metadata** for the location and rating
tokens on each finding, including cross-repo deferrals.

## Evidence

Assess the implementation and draft findings against the supplied growth patterns.

In every judged repo, locate the implementation commits for the user-named
steps through the joined topic stems. Follow later corrections and the history
of the files those steps changed, including off-plan corrections, to find the
evidence needed to judge their current behaviour and recorded departures.
Read both repos for a both-repo round. This discovers scope evidence; it does
not compute the watch episode or classify its trajectory.

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
run its scripts. For plan-repo files, use the local substitutions in that
repo's audit workflow the same way.

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
[implementation tiers](../../../references/round-protocol.md#implementation-tiers). Present the
findings as one numbered list sorted A through D. Start at 1 and keep the numbers increasing across
tier changes. The fix workflow lands findings as corrections in their hosting repo when that repo is
directed, or as deferrals in the current repo's round commit when it is not. When a finding's root
cause is the plan itself, say so in the finding and carry the plan correction into the cross-repo
findings below. Every finding also carries a growth tag, per
[Growth tags](../../../references/round-protocol.md#growth-tags).

## Cross-repo findings

Deferral covers only work nobody directed. A defect whose fix belongs to a
repo outside the round's repo set is graded and carried in the current
repo's round commit body. A plan defect deferred from a Repo Edu-only round
uses the plan-deferral form in this repo's `CLAUDE.md` and states the required
plan correction, its shipped-code evidence and any user ruling with its
reason. A Repo Edu defect deferred from a plan-repo-only round names its Repo
Edu location, required correction and plan-repo evidence in that round's
plan-repo commit body.

A specific cross-repo fix the user directs is applied in the fix phase, in the
same run as the round's other corrections, and committed independently in its
hosting repo under the fix workflow's rules.

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

Scoped rounds never settle the episode, even when their ranges tile every
step. Each scoped verdict describes the HEAD it ran on, and later steps age it.
The proof that the implementation is settled is whole-plan rounds on the
finished code whose severity has stabilised at C or below with no new A, each
round's table classifying every row. A round that finds nothing is not required.
Prior audit commits inform those rounds, ranking their reports and naming the
fixes to re-verify. They never excuse a row from inspection.

The watch judges convergence and repeated structural growth across these
rounds. The audit supplies current coverage and findings; it does not price
runs or classify the trajectory. The user owns the settlement decision.

The final whole-plan round expects the shared `implemented:` marker in every
repo
it judges. Each marker means every implementation step that repo hosts has
landed. When one is missing, name it once and continue on the user's word. The
round's records and, once the implementation audit settles, each repo's
closing form land through the fix workflow.

The final whole-plan round follows the same rule: no checks or tests as
evidence.

The final whole-plan round is advice, not a gate. When asked to treat the
implementation as done without one, name the missing round once and continue
on the user's word.

## Report order

Follow the shared round protocol's
[Report format](../../../references/round-protocol.md#report-format) for the opening, coverage and
findings. Supply the plan, ready commit, implementation commits and user-set scope from this audit's
evidence. Deliver the complete report under [Report file](#report-file).

## Report file

An unattended audit returns the complete report under
[Runner result](../../../references/round-protocol.md#runner-result); the runner saves it. A
hand-run audit presents the report, writes the same text to its supplied path and says so. Without
one, use the path printed by `pnpm audit-round name`. Its chat and file must not differ. The opening
identifies the judged repos and their heads, without a writer tag.

Anything the audit has to say about the judged code goes into the report or
the round's handoff. Chat carries nothing about it that the file does not. A
planned edit that no graded finding asks for, such as user-directed work, goes
in the report opening so the vet can check it. Material for the next round
goes in the handoff. A finding dropped under the admission test or the C
admission rule stays out of both, as those rules already say. Setup and
tooling problems are not about the judged code and stay in chat. A note only
in chat reaches neither the vet nor the fix.

The report and a hand-run audit's claim are gitignored, so writing them keeps the source files
unchanged. When there are no findings, follow [Clean completion](#clean-completion); otherwise stop.
The runner closes the report set after a finished fix. Hand-run completion uses
the shared `pnpm audit-round close` command under the round protocol.

## Clean completion

An unattended audit returns its completed report under
[Runner result](../../../references/round-protocol.md#runner-result). The runner completes the clean
outcome. A hand-run audit completes it here, immediately after writing its report. Neither route
starts a fix session, changes or consumes an existing handoff, or writes a new handoff. A
commit-scoped audit lands no record and retains its report, under `commit-scope.md`.

For a hand-run plan target, land one empty clean record in the sole judged repo
or at the invoking root when both repos were judged. Use the shared clean form
from `../plan/CLAUDE.md`: `<stem>/impl-audit-<scope> <tag> clean: <subject>`.
The scope is `<n>`, `<a>-<b>` or `all` from the audit. The tag and the body's
opening model line name this auditing session. Name the judged repo set in the
subject's sentence when both repos were judged. A Repo Edu record closes with
both **Round yield** lines at zero; a plan-repo record carries neither. The
standing clean-record rule grants this empty commit without separate permission.
After the record lands, run `pnpm audit-round close <target>-<round>` at the
report's root with the target and round from its filename, then stop. A clean
record reached after vetting or discussion stays with the fix workflow and its
ordinary completion rules.

## Round allocation

Use the supplied report path. Without one, resolve your full writer tag under
the shared round protocol and pass it unchanged to
`pnpm audit-round name <target> [scope-or-commits...] --auditor <full tag>` at
the invoking root before auditing. Use its printed audit report path. Do not
pass only the vendor letter.

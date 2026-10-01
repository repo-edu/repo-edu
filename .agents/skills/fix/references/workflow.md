---
reads:
  - ../../../references/round-protocol.md
  - ruling.md
---

# Implementation fix workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole; in a hand-run session, read them whole, following
any listed workflow's header too. Read each file once.

The shared launchers live in the plan checkout under
`home/claude/commands/fix.md` and `home/agents/skills/fix/SKILL.md`.
The runner selects this workflow and its working checkout for both entry routes.
Where a launcher and this file disagree, this file is right.

This workflow is the fix phase of an implementation-audit round. The audit is read-only and writes
its report to the plan repo root. An audit with findings stops there. This workflow starts from
that report: it reads the report, its vet twin and its rebuttal twin, presents the outcome for the
user's ruling, applies the accepted corrections, lands the round's records.

An audit with no findings
completes directly under the audit workflow and never enters this workflow.
After a vet that accepted every finding without a
condition the runner skips the rebuttal, so the fix reads the report and its
vet twin alone.

The [shared round protocol](../../../references/round-protocol.md)
owns paths, rating tokens, reconciliation, records and runner results.
Follow its **Reconciliation** rule after grounding the findings below.

When unattended, follow the shared
[Runner result](../../../references/round-protocol.md#runner-result) for every
ending.
When the fix needs a ruling, it writes the final document in this session under
[Writing a ruling](ruling.md). The runner displays that document directly
and collects the user's reply. It resumes the same fix session in the background
with that reply. Questions may leave a decision open; return `needs-ruling`
again until the user resolves it. The runner keeps the internal prompt out of
the terminal. It writes and displays the brief only after the full fix has completed.

Follow the `CLAUDE.md` of every repo a fix touches.

## Report discovery

A hand-run invocation may omit the audit report. Resolve it and its existing review files through
`paths fix` under the
[shared round protocol](../../../references/round-protocol.md#manual-phases).
Automated invocations use their supplied paths unchanged.

Read the supplied report path followed by the vet and rebuttal paths that exist; the judged-repos
opening selects the repo set and audited heads, and the report filename's writer tag identifies the
auditor.

## Grounding

Read the report end to end, then its supplied vet and rebuttal twins when
they exist. Read the plan in `../plan` for the steps the report's scope names
and for every **Decisions** entry a finding cites. When the plan is archived, read the
`README.md` beside it first.

Follow [Head drift](../../../references/round-protocol.md#head-drift). When the
moved tree already resolved the defect, drop the finding and name the
resolving commit in the presentation.

For every finding that stays, read the files it names at HEAD, the test that
covers them when it is code, and the `CLAUDE.md` of each package a fix would
touch. The report's evidence is the round's; this session verifies what it
is about to change.

In an unattended phase, write the final ruling under [Writing a ruling](ruling.md)
at the runner's supplied output path before returning `needs-ruling`. Review it for clarity
in this session. Reuse established evidence and verify only claims that remain uncertain.
Keep the explanation proportional to the choice. This also applies when a rule
in the repo's `CLAUDE.md` stops a correction for a ruling. A permission refusal or another error
that leaves required work blocked returns `failed`, not `needs-ruling`, under the shared result
rule.

## Applying corrections

After the user accepts the outcome, apply every directed correction. One
acceptance covers the whole round: fixes in each judged repo and findings
deferred only to repos outside the round's repo set. Every fix is a
root-cause fix under the repo's `CLAUDE.md`, including its complexity
escalation and repeated-fix rules. A correction those rules turn into a
structural change is applied as that structural change, never narrowed to
fit.

When the user directs a specific cross-repo fix during the discussion, apply
the correction in the same run and commit it independently in its hosting
repo. A plan-file correction uses the ordinary plan-round form and cites the
finding it applies. Do not repeat it as a deferral or an implementation
record. No write in one repo triggers or waits on the other.

Then format only the fixed files, typecheck only the packages a fix touched
and run only the test files that exercise the fixed behaviour. Run a
validation tool only when the fix concerns the rule it enforces, and the
plan repo's Markdown format only on the files a fix changed. This replaces
the root verification default of `pnpm fix`, `pnpm check` and `pnpm test`.
Run writing commands only while no other fix is running in either directed
working tree.

## Records

Land records under the plan doctrine's
[Shared implementation forms](../../../../../plan/CLAUDE.md#shared-implementation-forms),
which owns placement and its reasons. Land at most one record per judged repo
whose files took an accepted finding, or one clean record when none remain.
A Repo Edu round that accepts only
findings deferred to a repo outside the round's repo set uses the shared empty severity form.
Use the shared round protocol's
[worked record forms](../../../references/round-protocol.md#worked-record-forms).

Use the shared round protocol's **Finding metadata** and **Record bullets**
for each accepted finding's title, tier, location and rating tokens.

Close the record's body with the round's two yield lines, in the form
the shared round protocol defines under **Round yield**.
The shared worked forms show their placement.

The report is removed after completion, so the record is the only durable home for the
round's yield. A clean record carries both lines with zeroes, in either repo.

For a finding deferred from a Repo Edu-only round to the plan repo, follow this
repo's `CLAUDE.md` for record placement. A clean record's subject
carries the auditor and the step scope, and its sentence names the repo set when the round judged
both. This clean record follows reconciliation of an audit that reported findings. Audits that
report no findings complete directly under the audit workflow and create no fix session.
When the user declines the outcome in full, no commit lands
because disagreement is not a state. The logs show every confirmed round that ran, including clean
rounds that would otherwise exist only in chat.

The invocation grants the round's record commits and any directed plan-repo
correction commit once the checks above pass. Anything outside the landed
round's file set still asks.

## Completion

An unattended fix deletes no round files. The runner closes the report set
when the fix returns `finished`. After a hand-run fix lands its records, run
`pnpm audit-round close <target>-<round>` under
[Closing reports](../../../references/round-protocol.md#closing-reports). Use the exact
target and round from the report filename. A fix resumed by the runner after a
ruling remains unattended; the runner closes its report set after `finished`.

An unattended fix reports `finished` only after all required corrections,
checks and records are complete. It reports completion under the shared
[Runner result](../../../references/round-protocol.md#runner-result). The runner
reads the landed commits in both repos to derive the grade for chaining.
Remaining required work means the phase has not finished, even when some
records have already landed.

## Closing the episode

The audit workflow's episode settlement says when the implementation is
settled: whole-plan rounds on the finished code whose severity has
stabilised at C or below with no new A. On the user's word after that
point, use each repo's shared closing form: the Repo Edu `closed:` marker or
the plan repo's loop-close move. The stem scans already show every round, so
no compiled history belongs in either closing body.

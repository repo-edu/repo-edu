---
reads:
  - ../../../references/round-protocol.md
  - ../../../references/round-grammar.md
  - ../../../references/subject-grammar.md
  - ../../../../../plan/CLAUDE.md
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
its report to the plan checkout's `active/` folder. An audit with findings stops there. This
workflow starts from that report: it reads the report, its vet twins and its rebuttal twin, presents
the outcome for the user's ruling, applies the accepted corrections, lands the round's records.

An audit with no findings
uses the shared protocol's **Direct clean completion**.

The [shared round protocol](../../../references/round-protocol.md)
owns rating meanings, reconciliation, record meaning and runner result
meaning. The [round grammar](../../../references/round-grammar.md) owns parsed
report, twin, record-bullet and result forms. The runner owns paths under
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).
Follow its **Reconciliation** rule after grounding the findings below.

When the phase arguments include a `contests` object, its entries are the
serious contests and splits the user owns under **Reconciliation**. An entry
first names only its finding number. A resumed fix also receives any recorded
`winner` and `reason`. Present each vet's position and the auditor's answers
with their evidence in the ruling, then apply recorded answers without deciding
them again. A winner that names vet tags applies those vets' verdicts.
Every fix invocation is commit-blocked while any supplied contest lacks a
winner. `Not yet` keeps that block in place. Do not land settled corrections
before the runner has recorded every required winner; a fix that reports
finished with an open contest fails the round. If the round stops, use the
printed `pnpm audit-round resume-fix ...` command. It reloads the stored round,
collects missing winners and resumes this session with the same block. A bare
assistant resume is only for work without an open serious contest or split.

When unattended, follow the shared
[Runner result](../../../references/round-protocol.md#runner-result) for every
ending.

Follow the `CLAUDE.md` of every repo a fix touches.

## Report discovery

A hand-run invocation may omit the audit report. Resolve it and its existing review files through
`paths fix` under the runner's
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing).
Automated invocations use their supplied paths unchanged.

Use that section for arguments and the
[audit report grammar](../../../references/round-grammar.md#audit-report) for
the judged repo set and audited heads.

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

When a decision stays open in an unattended fix, follow
[Writing a ruling](ruling.md) at the supplied ruling path, including when a
repo's `CLAUDE.md` requires a ruling before a correction.
For blocked work, follow the shared
[Runner result](../../../references/round-protocol.md#runner-result).

## Applying corrections

Apply every correction settled under the shared **Reconciliation** rule.
Use the plan doctrine's **Shared implementation forms** for directed fixes
and deferrals. Every fix is a
root-cause fix under the repo's `CLAUDE.md` and the home policy's complexity
escalation rule. A correction those rules turn into a
structural change is applied as that structural change, never narrowed to
fit.

When the phase arguments end with an open-deferral object, settle every item in
the round's records. Check that the report accounts for every object item
through either a `Satisfied deferral:` line in its opening or a finding. A
hand-run fix has no object, so those opening lines and findings are its complete
deferral scope. A changed destination uses a graded bullet with the item's
`[applies:<full-sha>/<position>]` token. A satisfied item, or an item the review
drops, uses the untiered citation. Direct clean completion adds the untiered
citations itself when no fix runs. When a deferral into Repo Edu is satisfied
or dropped without a Repo Edu file change, put that citation in whichever
judged repo already receives the round record. Do not create a citation-only
Repo Edu record. Deferrals into the plan repo still close only from plan
commits.

Then format only the fixed files, and typecheck and run
`pnpm test <package path>` for each workspace package whose source a fix
changed. A fix that changes only documents runs no suite. A failing test in
such a package blocks the record. A failure the fix believes unrelated becomes
a finding in its own right and is never left out of the round's scope. Run a
validation tool only when the fix concerns the rule it enforces, and the
plan repo's Markdown format only on the files a fix changed. This replaces
the root verification default of `pnpm fix`, `pnpm check` and `pnpm test`
with the same checks on the packages a fix touched.
Run writing commands only while no other fix is running in either directed
working tree.

A correction may ask for a proof only a CI run can give, such as a passing
live-provider job on `main`. That proof is never required work of this phase:
CI runs only on pushed commits, pushing is the user's, and the next audit reads
the run as evidence. Apply the code part, land the record and name the owed run
in the handoff. The phase finishes; it does not fail over a run that cannot
exist yet.

## Records

Land records under the plan doctrine's
[Shared implementation forms](../../../../../plan/CLAUDE.md#shared-implementation-forms),
which owns placement and its reasons. Use the shared protocol's
[Finding metadata](../../../references/round-protocol.md#finding-metadata) and
the [record bullet grammar](../../../references/round-grammar.md#commit-record-bullet)
for their contents, including a clean record reached through reconciliation. A
plan-repo commit round's record takes the plan repo's off-plan form rather than
an implementation-audit form.

The invocation grants the round's record commits, any directed plan-repo
correction commit and any stale-text plan-repo correction admitted by the
implementation audit once the checks above pass. Anything outside the landed
round's file set still asks.

## Completion

After all required corrections, checks and records are complete, follow the
plan doctrine's [Handoff](../../../../../plan/CLAUDE.md#handoff), then the
runner's [Report lifecycle](../../../../tools/audit-round/CLAUDE.md#report-lifecycle)
and the shared protocol's **Runner result**.

## Closing the episode

Follow the shared protocol's
[Implementation settlement](../../../references/round-protocol.md#implementation-settlement).

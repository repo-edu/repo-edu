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
uses the shared protocol's **Direct clean completion**.

The [shared round protocol](../../../references/round-protocol.md)
owns paths, rating tokens, reconciliation, records and runner results.
Follow its **Reconciliation** rule after grounding the findings below.

When unattended, follow the shared
[Runner result](../../../references/round-protocol.md#runner-result) for every
ending.

Follow the `CLAUDE.md` of every repo a fix touches.

## Report discovery

A hand-run invocation may omit the audit report. Resolve it and its existing review files through
`paths fix` under the
[shared round protocol](../../../references/round-protocol.md#manual-phases).
Automated invocations use their supplied paths unchanged.

Use the shared protocol's **Later files** for arguments and **Report format**
for the judged repo set and audited heads.

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
which owns placement and its reasons. Use the shared protocol's
**Worked record forms**, **Record bullets** and **Round yield** for their
contents, including a clean record reached through reconciliation.

The invocation grants the round's record commits and any directed plan-repo
correction commit once the checks above pass. Anything outside the landed
round's file set still asks.

## Completion

After all required corrections, checks and records are complete, follow the
plan doctrine's [Handoff](../../../../../plan/CLAUDE.md#handoff), then the
shared protocol's **Closing reports** and **Runner result**.

## Closing the episode

Follow the shared protocol's
[Implementation settlement](../../../references/round-protocol.md#implementation-settlement).

# Implementation fix workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/fix.md` and the Codex skill
`.agents/skills/fix/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

This workflow is the fix phase of an implementation-audit round. The audit is read-only and writes
its report to the invoking repo root. An audit with findings stops there. This workflow starts from
that report: it reads the report, its vet twin and its rebuttal twin, presents the outcome for the
user's ruling, applies the accepted corrections, lands the round's records.

An audit with no findings
completes directly under the audit workflow and never enters this workflow.
After a vet that accepted every finding without a
condition the runner skips the rebuttal, so the fix reads the report and its
vet twin alone.

Read the whole [shared round protocol](../../../references/round-protocol.md)
for paths, rating tokens, reconciliation, records and runner results.
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

This procedure also serves the fix phase of rounds whose report is stored at
the plan repo root. The plan repo's fix workflow routes those here and
supplies the local substitutions: that repo's report root, Markdown format
and finding metadata. Follow the `CLAUDE.md` of every repo a fix touches.

## Report discovery

A hand-run invocation may omit the audit report. Resolve it and its existing review files through
`paths fix` under the
[shared round protocol](../../../references/round-protocol.md#manual-phases).
Automated invocations use their supplied paths unchanged.

Read the supplied report path followed by the vet and rebuttal paths that exist; the judged-repos
opening selects the repo set and audited heads, and the report filename's writer tag identifies the
auditor.

When the invocation names a report stored at the plan repo root, say the fix
phase belongs in `../plan` and stop. Continue only when the user explicitly
says to.

## Grounding

Read the report end to end, then its supplied vet and rebuttal twins when
they exist. Read the plan in `../plan` for the steps the report's scope names
and for every **Decisions** entry a finding cites. When the plan is archived, read the
`README.md` beside it first.

Check each sha in the report opening against its repo's
`git rev-parse --short HEAD`. When one differs, the tree has moved since the
audit, so list what moved with `git diff --name-only <sha>..HEAD` in that
repo. For a both-repo report run the check independently for Repo Edu and
the plan repo. Land against HEAD either way. When a file a finding rests on
has moved, read that file at HEAD and re-ground the finding against it. When
the moved tree already resolved the defect, drop the finding and name the
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

Land at most one implementation-audit record per repo judged, and only in a repo whose files took an
accepted finding. A both-repo round whose findings all concern one repo lands one record there and
nothing in the other: a record without findings would say nothing the record with them does not, and
the watch would read it as convergence evidence for files the round did not re-test. A clean round
lands one clean record where the paragraph on clean rounds below says. Repo Edu records use the
shared implementation-audit forms from `../plan/CLAUDE.md`. A Repo Edu round that accepts only
findings deferred to a repo outside the round's repo set uses the shared empty severity form. The
subject's `impl-audit-<step scope>` form carries the round's scope, `<n>`, `<a>-<b>` or `all`; no
`Audit:` body line repeats it. The capability tag follows that form and names the assistant that ran
the audit step, never the one that vets, rebuts or fixes, and it reads on the clean record too.
Write the report filename's full auditor tag in the subject and this fixing session's own model
and effort in the body's opening line. The commit hook replaces them with `COMMIT_AUDITOR` and
`COMMIT_PHASES` when supplied. Writing the record needs no runner check. Files this phase writes
use its own writer tag. Use the shared round protocol's
[worked record forms](../../../references/round-protocol.md#worked-record-forms).

Use the shared round protocol's **Finding metadata** and **Record bullets**
for each accepted finding's title, tier, location and rating tokens.

Close a Repo Edu record's body with the round's two yield lines, in the form
the shared round protocol defines under **Round yield**. Recount the accepted findings
in that record after vetting and discussion, using their final reach and
complexity values. Earlier report totals may no longer match what lands.
The shared worked forms show their placement.

The report is removed after completion, so the record is the only durable home for the
round's yield. A clean record carries both lines with zeroes. A plan-repo
record carries neither.

The hook derives the severity sequence, its case and its `!` from the graded
bullets; the growth mark stays authored under this repo's `CLAUDE.md`.

A finding deferred from a Repo Edu-only round to the plan repo uses the body form in this repo's
`CLAUDE.md`; it keeps its tier, plan location and metadata in the same round commit. A plan-repo
round uses `[area:]` only for a finding deferred to Repo Edu. A clean round lands one shared clean
record, in the sole judged repo or at the invoking root when both repos were judged. Its subject
carries the auditor and the step scope, and its sentence names the repo set when the round judged
both. This clean record follows reconciliation of an audit that reported findings. Audits that
report no findings complete directly under the audit workflow and create no fix session. The user
directed the single placement on 2026-09-21, after three plan-repo clean records stood for rounds
whose fixes touched only Repo Edu. When the user declines the outcome in full, no commit lands
because disagreement is not a state. The logs show every confirmed round that ran, including clean
rounds that would otherwise exist only in chat.

The invocation grants the round's record commits and any directed plan-repo
correction commit once the checks above pass. Anything outside the landed
round's file set still asks.

## Completion

An unattended fix deletes no round files. The runner closes the report set
when the fix returns `finished`. After a hand-run fix lands its records, run
`pnpm audit-round close <target>-<round>` at the report's root. Use the exact
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

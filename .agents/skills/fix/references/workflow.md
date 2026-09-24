# Implementation fix workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/fix.md` and the Codex skill
`.agents/skills/fix/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

This workflow is the fix phase of an implementation-audit round. The round
itself runs under `.agents/skills/audit/references/workflow.md`, reads only,
writes its report to the repo root and stops. This workflow starts from that
report: it reads the report, its vet twin and its rebuttal twin, presents
the outcome for the user's ruling, applies the accepted corrections, lands
the round's records. The split exists
because a round that reads a whole step range and then fixes in the same
context grows past the point where the fixes are made well. The user directed
it on 2026-09-09.

The fix phase always starts in a fresh session. After a rebuttal Codex runs
it, using the audit report and both twins as its brief. An automated audit with
no findings completes directly in the runner and never enters this workflow.
A hand-run clean report may still be closed here. After a vet that accepted every finding without a
condition the runner skips the rebuttal, so the fix reads the report and its
vet twin alone.
The user directed this on 2026-09-11 after a fix resumed a vet session at 64%
context usage and compacted during implementation. Starting fresh gives the
fix its own context and removes the capacity judgement and restart path.

When unattended, follow the audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. The runner starts one fresh fix session in Codex.
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

## Reconciliation

When the report has a rebuttal twin, the auditor has already answered the
vet and the twin closes with the reconciled outcome in three groups: verdicts
both assistants agree on, verdicts the rebuttal contests, and the items for
the user's ruling. Present those groups. For each contested verdict, read the
quoted evidence yourself and say whether you concede, so the rebuttal's
correction stands, or maintain, so the item moves to the user's ruling with
both positions in one or two sentences each. Never re-argue an agreed
verdict.

When the report has a vet twin and no rebuttal, and every verdict is an
unconditional accept, the runner skipped the rebuttal because the auditor had
nothing to answer. Present the findings as agreed by both assistants, say
that the vet accepted every finding, and do not re-answer the verdicts. When
the vet twin holds any other verdict and no rebuttal exists, answer each
verdict here: agreement carries it into the outcome, disagreement names the
evidence the vet misread. Present the same three groups. Without a twin,
present the report's findings in their numbered order with any drift
corrections from [Grounding](#grounding).

The user reads along and rules by exception: a go on the presented outcome
is the acceptance, and a reservation on any item reopens it, including a
reservation the report never raised. Ground a reopened item the same way
before answering it.

One kind of finding is not covered by accepting the round as a whole, in a
vetted round and an unvetted one alike: a real unresolved choice about cost
needs its own answer, whether the report explains it in the finding's prose or
a separate trade block. List these apart in the presentation.
When the user picks the simpler mechanism, that mechanism becomes the
finding's required correction, revised in the discussion like any other
revision. When that ruling overturns a reason the plan records, the round
carries the correction and the user's reason as a cross-repo finding, so the
plan correction is applied or deferred without re-derivation. When the user
keeps the machinery, the same record carries the ruling and its reason. The
code finding then follows the normal path: a correction the ruling leaves
standing is applied, and a finding the ruling dissolves is omitted from the
record.

A cross-repo finding the report left as an open choice is put to the user
here. When the user rules, carry the answer and its reason in the deferral.
When the user does not rule, keep the choice open in the deferral instead of
choosing for them.

The invocation is the acceptance of everything the files already settle. Stop for a ruling only on
open items: an item sent to the user's ruling, a contested verdict this session maintains, a drift
correction that changes a finding, or this session's own answers to a vet with no rebuttal. When
nothing is open, state the outcome in one line per finding and apply. A cross-repo
open choice awaiting the user's ruling is not an open item here. Its outcome lands through the
deferral above or a later plan round, never through this session, so it holds no settled correction
back. Keep it open in the deferral and apply the settled findings.

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
Under the runner, write its first letter alone, `a` or `o`, from the report filename's writer tag,
read under [Report discovery](#report-discovery). The runner holds the strength and effort behind it
and the commit-msg hook widens the letter into the whole tag. Without the runner, use the report's
full auditor tag. Use your own selection under the shared round protocol for your phase's model
record and any file you write. Repo Edu's `CLAUDE.md` owns both rules under
**Commit Capability Tag** and **Commit Model Record**.

The body carries one bullet per accepted finding. Each bullet opens with its
uppercase tier, then its metadata and prose:

```text
- [B] [area:pkg-integrations-llm] [growth:hardening,unpriced-complexity] [reach:rare] [complexity:low] Cleanup failure no longer displaces the login guidance.
```

For a Repo Edu finding, `[area:<primary-id>]` is the finding's primary partition area from
`tools/architecture-check/src/area-model.json`, followed by `[cover:<cover-id>]` for each cover area
that applies. `[growth:...]`, `[reach:...]` and `[complexity:...]` are the tokens the audit workflow
defines, in the same form the report used. Repo Edu finding bullets require all four token kinds.
Plan-repo implementation and off-plan finding bullets use
`- B [section:<heading>] [growth:...] [reach:...] [complexity:...] <title and prose>`. Only a
planning `audit` record adds exactly one `[field:<excess|missing>]` token before the location. Other
plan-repo records refuse `[field:]`, because their findings have no search direction. Both forms use
a heading in kebab case and replace `[section:]` with `[area:]` only for a deferred Repo Edu
finding. The glance counts A–C corrections by these locations, once per commit in each area or
section. D findings never advance its count. The commit body is the only place a later round can
read them: chat is gone, the report is removed after completion and the finding list lives nowhere
else. A bullet that records something other than a finding, such as a carried decision or a trade
ruling with its reason, takes no metadata.

Close a Repo Edu record's body with the round's two yield lines, in the form
the audit workflow defines under **Round yield** and carrying the same counts
the report gave:

```text
Round yield: 0 ordinary; 5 rare; 3 developer.
Structure: 3 removing, 2 adding, 3 flat.
```

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
both. Direct automated clean completion retains the report with its repo set instead and creates no
fix session, under the audit workflow's **Runner result** rule. The user directed the single
placement on 2026-09-21, after three plan-repo clean records stood for rounds whose fixes touched
only Repo Edu. When the user declines the outcome in full, no commit lands because disagreement is
not a state. The logs show every confirmed round that ran, including clean rounds that would
otherwise exist only in chat.

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
checks and records are complete. It reports completion under the audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result). The runner
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

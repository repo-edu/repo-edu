# Implementation fix workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/fix.md` and the Codex skill
`.agents/skills/fix/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

This workflow is the fix phase of an implementation-audit round. The round
itself runs under `.agents/skills/audit/references/workflow.md`, reads only,
writes its report to the repo root and stops. This workflow starts from that
report: it reads the report, its `VET-` twin and its `REBUT-` twin, presents
the outcome for the user's ruling, applies the accepted corrections, lands
the round's records and deletes the report with its twins. The split exists
because a round that reads a whole step range and then fixes in the same
context grows past the point where the fixes are made well. The user directed
it on 2026-09-09.

The fix phase always starts in a fresh session. After a rebuttal the vetter's
assistant normally runs it, using the audit report and both twins as its brief.
The user directed this on 2026-09-11 after a fix resumed a vet session at 64%
context usage and compacted during implementation. Starting fresh gives the
fix its own context and removes the capacity judgement and restart path.

When unattended, follow the audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. The runner starts one fresh fix session in the vetter's assistant.
When the fix needs a ruling, the runner opens that fix session interactively.

This procedure also serves the fix phase of rounds whose report is stored at
the plan repo root. The plan repo's fix workflow routes those here and
supplies the local substitutions: that repo's report name, Markdown format
and finding metadata. Follow the `CLAUDE.md` of every repo a fix touches.

## Report discovery

The report file's name carries its metadata. At the Repo Edu root a
single-repo report is `AUDIT-<plan-name>-<scope>-<auditor>-<own-sha>.md` and
a both-repo report appends the plan repo's sha:
`AUDIT-<plan-name>-<scope>-<auditor>-<own-sha>-<other-sha>.md`. Parse it
from the right: one or two short hexadecimal shas, then the auditor token,
`claude` or `codex`, then the scope, `all`, `step-<n>` or `steps-<a>-<b>`,
with the rest as the plan name. In a report stored here `<own-sha>` names
Repo Edu and `<other-sha>` names the plan repo.

When the invocation names a report file, land that file. When it names
nothing, list `AUDIT-*.md` at this repo's root. One file means land it. More
than one means name them, each with the twins it has, and ask which to land.
None means ask for the report and wait. Either assistant may land a report:
the auditor's token in the name says who wrote it, not who fixes it.

The round's file set is the report and its `VET-` and `REBUT-` twins, when
they exist. This workflow reads that set, lands it and deletes it under
[Closing the report](#closing-the-report). It never deletes or rewrites a
file outside the set it lands. The user directed this after a session on
2026-08-21 deleted the other assistant's still-open report; this origin note
stands in place of a case.

When the invocation names a report stored at the plan repo root, say the fix
phase belongs in `../plan` and stop. Continue only when the user explicitly
says to.

## Grounding

Read the report end to end, then its `VET-` twin and its `REBUT-` twin when
they exist. Read the plan in `../plan` for the steps the report's scope names
and for every **Decisions** entry a finding cites. When the plan is archived, read the
`README.md` beside it first.

Check each sha in the report name against its repo's
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

When the report has a `REBUT-` twin, the auditor has already answered the
vet and the twin closes with the reconciled outcome in three groups: verdicts
both assistants agree on, verdicts the rebuttal contests, and the items for
the user's ruling. Present those groups. For each contested verdict, read the
quoted evidence yourself and say whether you concede, so the rebuttal's
correction stands, or maintain, so the item moves to the user's ruling with
both positions in one or two sentences each. Never re-argue an agreed
verdict.

When the report has a `VET-` twin and no rebuttal, answer each verdict here:
agreement carries it into the outcome, disagreement names the evidence the
vet misread. Present the same three groups. Without a twin, present the
report's findings in their numbered order with any drift corrections from
[Grounding](#grounding).

The user reads along and rules by exception: a go on the presented outcome
is the acceptance, and a reservation on any item reopens it, including a
reservation the report never raised. Ground a reopened item the same way
before answering it.

One kind of finding is not covered by accepting the round as a whole, in a
vetted round and an unvetted one alike: a real unresolved choice about cost
needs its own answer, whether the report explains it in the finding's prose,
a separate trade block or a run pricing above the findings. List these apart in the presentation.
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

The invocation is the acceptance of everything the files already settle.
Stop for a ruling only on open items: an item sent to the user's ruling, a
contested verdict this session maintains, a drift correction that changes a
finding, or this session's own answers to a vet with no rebuttal. When
nothing is open, state the outcome in one line per finding and apply.

In an unattended phase, present any open items and return `needs-ruling`
instead of waiting for input. This also applies when the correction rules
below require a structural-change ruling. A permission refusal or another
error that leaves required work blocked returns `failed`, not `needs-ruling`,
under the shared result rule.

## Applying corrections

After the user accepts the outcome, apply every directed correction. One
acceptance covers the whole round: fixes in each judged repo and findings
deferred only to repos outside the round's repo set. Every fix is a
root-cause fix under the repo's `CLAUDE.md`, including its complexity
escalation and repeated-fix rules; a finding whose correction those rules
turn into a structural change is raised with the user before it is applied,
not narrowed to fit.

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

Land at most one implementation-audit record per repo judged. A record
lands in the repo whose files its findings concern. A both-repo round
therefore lands independent records in each repo. Repo Edu records use the
shared implementation-audit forms from `../plan/CLAUDE.md`. A Repo Edu round
that accepts only findings deferred to a repo outside the round's repo set
uses the shared empty severity form. The subject's `impl-audit-<step scope>`
form carries the round's scope, `<n>`, `<a>-<b>` or `all`; no `Audit:` body
line repeats it.

The body carries one bullet per accepted finding, and each bullet opens with
that finding's metadata before its prose:

```text
- [area:pkg-integrations-llm] [growth:hardening,unpriced-complexity] [reach:rare] [complexity:low] Cleanup failure no longer displaces the login guidance.
```

For a Repo Edu finding, `[area:<primary-id>]` is the finding's primary
partition area from `tools/architecture-check/src/area-model.json`, followed
by `[cover:<cover-id>]` for each cover area that applies. `[growth:...]`,
`[reach:...]` and `[complexity:...]` are the tokens the audit workflow
defines, in the same form the report used. Repo Edu finding bullets require
all four token kinds. Plan-repo finding bullets omit only `[area:]` under the
plan repo's local substitution. The commit body is the only place a later
round can read them: chat is gone, the report is deleted below and the
finding list lives nowhere else. A bullet that records something other than
a finding, such as a carried decision or a trade ruling with its reason,
takes no metadata.

A finding deferred from a Repo Edu-only round to the plan repo uses the body
form in this repo's `CLAUDE.md`; it keeps its tier, plan location and
metadata in the same round commit. A plan-repo round carries no `[area:]`
token, because the area model belongs to Repo Edu. A clean round lands the
shared clean record in each repo judged, its subject carrying the step
scope. When the user declines the outcome in full, no commit lands because
disagreement is not a state. The logs show every confirmed round that ran,
including clean rounds that would otherwise exist only in chat.

The invocation grants the round's record commits and any directed plan-repo
correction commit once the checks above pass. Anything outside the landed
round's file set still asks.

## Closing the report

The turn that lands the round's records deletes the landed report and its
`VET-` and `REBUT-` twins: the commit bodies carry the accepted findings
durably, and a report left behind goes stale against the moved HEAD. The
twins are the two assistants' exchange on this report and are consumed with
it. No other report or twin at the root is touched, under
[Report discovery](#report-discovery).

An unattended fix reports `finished` only after all required corrections,
checks, records and report cleanup are complete. Its result has `file: null`.
Remaining required work means the phase has not finished, even when some
records have already landed.

## Closing the episode

The audit workflow's episode settlement says when the implementation is
settled: whole-plan rounds on the finished code whose severity has
stabilised at C or below with no new A. On the user's word after that
point, use each repo's shared closing form: the Repo Edu `closed:` marker or
the plan repo's loop-close move. The stem scans already show every round, so
no compiled history belongs in either closing body.

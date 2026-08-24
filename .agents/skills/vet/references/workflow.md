# Implementation-finding vet workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/vet.md` and the Codex skill
`.agents/skills/vet/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

The vet's input is another AI assistant's implementation-audit report, an
`AUDIT-*.md` file at the root of the repo where the audit was invoked. A report
at this repo's root may judge Repo Edu alone or both repos.
[Report discovery](#report-discovery) says how the file is found. Vet its
graded findings. Do not run an audit round of your own. Whether a finding is a
good idea is not an axis: a finding can be appealing and still unauthorised.

The vet is read-only and lands nothing. It runs no command that changes a
tracked file, so no `pnpm fix` and no formatter. Its verdicts inform the
user's ruling on the findings; any edit or commit stays with the round that
produced the report.

Planning-artifact audit reports belong to the sibling plan repo. An
implementation-audit report on plan-repo-hosted changes also lives there when
that round was invoked there, and its local vet workflow routes to this owned
procedure. When the invocation here names any report stored at the plan repo
root, name the file, say the vet belongs in `../plan` and stop. Continue only
when the user explicitly says to.

## Report discovery

The report file's name carries its metadata. A single-repo report is
`AUDIT-<plan-name>-<scope>-<auditor>-<own-sha>.md`. A both-repo report appends
the other repo's sha:
`AUDIT-<plan-name>-<scope>-<auditor>-<own-sha>-<other-sha>.md`. Parse it from
the right: recognise one or two short hexadecimal shas, then the auditor token,
`claude` or `codex`, then the scope, `complete`, `step-<n>` or
`steps-<a>-<b>`, with the rest as the plan name. In a report stored here,
`<own-sha>` names Repo Edu and `<other-sha>` names the plan repo.

When the invocation names a report file, vet that file. When it names
nothing, list `AUDIT-*.md` at this repo's root and drop each file whose
auditor token is your own. One file left means vet it. More than one means
name them and ask which to vet. None means ask for the report and wait.

Never vet a report whose auditor token is your own assistant. The vet exists
to check findings from a fresh context in the other assistant. Continue only
when the user explicitly says to.

Check two mismatches before vetting:

- A sha in the name differs from its repo's `git rev-parse --short HEAD`. The
  tree has moved since the audit, so check what moved with
  `git diff --name-only <sha>..HEAD` in that repo. For a both-repo report, run
  this check independently for Repo Edu and the plan repo. When no file the
  report names in the moved repo is touched, proceed and note the drift in the
  verdicts. When one is, the findings describe files that no longer exist in
  the reported state, so refuse and ask.
- The plan or scope in the name differs from the one the report names
  inside. One of the two is wrong, so refuse and ask. A report that names
  neither inside cannot pass this check, so ask before vetting.

## Axes

Check each finding on three axes, in this order.

### 1. Authorised

Classify the finding as one of five kinds.

- A defect in the shipped code. The code is wrong, or below the bar this
  repo's standards set. This is the ordinary kind and it needs no further
  authority.
- A defect in the plan text that the shipped code exposes. It stays a graded
  finding. When the plan repo is outside the plan-selected repo set, defer it
  in the Repo Edu commit body. When the plan selected that repo or the user
  directs the fix during discussion, the same run applies it as its own
  plan-repo round commit.
- A departure from the plan where the shipped code is right. The audit
  workflow records this as a deviated row in the coverage table, never as a
  finding. Drop it.
- Work the episode has not reached yet. That is an incomplete row in the
  coverage table, not a finding. Drop it.
- A reopening of a decision the plan settled. Quote the decision from the
  plan, name the finding's evidence and judge how serious that evidence is.
  Correctness or quality evidence can reopen a settled decision. Taste never
  does. Whether the vet may accept the reopening or must hand it to the
  user is decided under the verdict rules.
- New machinery no boundary asks for. Read `../plan/BOUNDARIES.md` and
  `../plan/GROWTH-PATTERNS.md`. When no boundary asks for the machinery, do
  not settle the trade. State the simplest mechanism the boundaries do ask
  for, state what the finding's version gives the user over that, and send it
  to the user's ruling. When the finding already carries a `Trade:` block, do
  not author a competing pricing: check that block under the trade-block
  check in axis 3 instead.

### 2. Grounded

Verify every load-bearing claim against its source yourself. Do not trust the
report's quotes or paraphrases.

- Read the file path the finding names, end to end, and the test that covers it
  when it is code.
- Read the plan in `../plan` for the decision the finding rests on, and the
  governing `CLAUDE.md` in every repo the finding invokes.
- Read the episode's commit bodies before calling a departure unrecorded. The
  reason is often there.
- Run a check or a test only in its read-only form, and only when a claim
  rests on it, as in `pnpm --filter <package> test`. Never run a command that
  writes.

A claim about behaviour is grounded when you can point at the code that
produces it. A claim you cannot reach that way is not grounded, whatever the
report says about it.

### 3. Fix follows

The correction has to fit the defect. It can miss in two directions, and both
are common here.

- Too wide. The correction goes past what the defect needs, so the tier is
  read off the ask rather than off the defect. Return revise and state the
  smaller correction that resolves it.
- Too narrow. The correction patches one site of a defect that lives at
  several, or it patches an area that is already unstable. This check runs
  only when the correction is local to Repo Edu. Read the finding's primary
  area ID from `tools/architecture-check/src/area-model.json`, then walk that
  area's last ten touched commits. Read the conventional kind from a
  stem-marked commit's postfix or after an ordinary commit's severity sequence.
  Two or more `fix:` commits there mean the area may not take another patch.
  Return revise and say the finding has to name the structural change instead.
  Plan-repo findings carry no area ID and do not use this Repo Edu history
  gate.

Then check the trace. It holds at the claimed tier under the `[A]`-`[D]`
rubric in this repo's `CLAUDE.md`, and it carries the shape the audit
workflow fixes: the wrong behaviour the shipped code produces, a rarity
sentence only when the situation is rare, and no rarity sentence at all when
the whole cost is rework or re-derivation. A trace that ends with the same
behaviour shipping is not a finding, so the verdict is drop.

Then check the trade block. At tiers A to C, a finding whose growth tag is
not `none`, whose reach is not `ordinary` and whose complexity is not
`none` carries a `Trade:` block after its trace, unless the report prices
that machinery in a run pricing above the tiered findings. A finding that
should carry one and does not gets revise. The block has two valid forms.
When the correction is itself the simplest mechanism, the block is one
sentence naming that fact and what settles it; verify both against the
code and the named boundary or decision yourself. Otherwise the block
gives four answers: check each against its source yourself: the offered
mechanism satisfies `../plan/BOUNDARIES.md`, the build and ownership cost
matches the standing structure the correction plants, the claimed user
benefit follows from the finding's trace and its sources, and a claim
that the choice is settled points at a boundary entry or a recorded user
decision. A claim that no simpler mechanism exists rests on a
plan-recorded reason that holds against the code. A four-answer block
whose offered mechanism is the correction itself gets revise: state the
one-sentence form. When run pricing replaces the block, check its
mechanism, cost and benefit with the same tests, and check its rarity
against the round evidence. An unsettled block or run price goes to the
user's ruling, never to a verdict of the vet's own.

## Verdicts

Return one verdict per finding, in the report's order: accept, revise, drop or
needs the user's ruling. A revise verdict states the revision. A drop verdict
states why. Keep each verdict to a few short sentences.

A reopening of a settled decision takes one of two forms:

- A narrowing keeps the decision's reason and shrinks what the decision
  covers. When the grounded check verified the new evidence first-hand and
  the correction keeps the recorded reason intact, the verdict is accept,
  marked "accept, noted as a narrowing". It still quotes the superseded
  sentence and the new evidence, so the change lands as ruled, not slipped
  in. The user's ruling on the round covers it; the vet asks for no
  separate ruling.
- A full reversal drops the decision or its reason. The verdict is needs
  the user's ruling: state the superseded decision, the new evidence, how
  serious it is and what the grounded and fix-follows checks found. Never
  settle a full reversal on the vet's own authority.

A reversal bundled onto a defect that a smaller correction resolves is cut
back under axis 3 instead, and the verdict is revise. The user directed
adopting this split from the plan repo's vet on 2026-08-21; this origin
note stands in place of a case.

The user's ruling is needed for three things: a full reversal of a decision
the plan settled, machinery with no boundary behind it, and an unsettled
trade block. Name what axis 1 classified, state what the grounded and
fix-follows checks found, and stop there. Never settle one of these on the
vet's own authority.

Before returning the verdicts, look for the sibling report: the same plan name,
scope and ordered sha set with the other auditor token. When it exists, read it
and mark every verdict `corroborated` when the sibling reports the same defect,
the same file path producing the same wrong behaviour whatever its tier or
wording, and `unique` when it does not. Corroboration is a signal for the
user's reading order, never a verdict change. Without a sibling report the
verdicts carry no marker.

Write the verdicts to the report's twin file, the same name with `VET-` in
place of `AUDIT-`, as well as into the chat. The twin is untracked and
gitignored, so writing it keeps the vet's read-only rule intact; it is the
one file the vet writes.

## Cross-repo findings

Cross-repo findings are graded findings, so vet all three axes. Also verify that
each one traces to files this round inspected or to an answer the user gave in
this round's own discussion. A deferral resting on any other evidence is work
the round may not author, so the verdict is drop. Deferral is the required
outcome only when the repo hosting the fix is outside the plan-selected repo
set. When the user directs the specific fix, the same run applies it and lands
an independent commit there; a plan-file fix uses the ordinary plan-round form.

## Coverage table

The report opens with a coverage table. Do not re-audit it. Check a row only
where a finding depends on it, which is when a finding should have been a row,
or a row should have been a finding.

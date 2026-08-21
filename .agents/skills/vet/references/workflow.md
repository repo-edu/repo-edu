# Implementation-finding vet workflow

The vet's input is another AI assistant's implementation-audit report on this
repo's code, an `AUDIT-*.md` file at this repo's root written by the audit
workflow. [Report discovery](#report-discovery) says how the file is found.
Vet its graded findings. Do not run an audit round of your own. Whether a
finding is a good idea is not an axis: a finding can be appealing and still
unauthorised.

The vet is read-only and lands nothing. It runs no command that changes a
tracked file, so no `pnpm fix` and no formatter. Its verdicts inform the
user's ruling on the findings; any edit or commit stays with the round that
produced the report.

Planning artifacts belong to the sibling plan repo. Their reports live at
that repo's root, so discovery here never finds one. When the invocation
names a report on a `plan-`, `topology-`, `draft-` or `carry-` file rather
than this repo's code, name the file, say the vet belongs in `../plan` and
stop. Continue only when the user explicitly says to.

## Report discovery

The report file's name carries its metadata:
`AUDIT-<plan-name>-<scope>-<auditor>-<sha>.md`. Parse it from the right: the
last part is the short commit sha the audit inspected, before it the auditor
token, `claude` or `codex`, before that the scope, `complete`, `step-<n>` or
`steps-<a>-<b>`, and the rest is the plan name.

When the invocation names a report file, vet that file. When it names
nothing, list `AUDIT-*.md` at this repo's root and drop each file whose
auditor token is your own. One file left means vet it. More than one means
name them and ask which to vet. None means ask for the report and wait.

Never vet a report whose auditor token is your own assistant. The vet exists
to check findings from a fresh context in the other assistant. Continue only
when the user explicitly says to.

Check two mismatches before vetting:

- The sha in the name differs from `git rev-parse --short HEAD`. The tree
  has moved since the audit, so check what moved: run
  `git diff --name-only <sha>..HEAD`. When no file the report names is
  touched, proceed and note the drift in the verdicts. When one is, the
  findings describe code that no longer exists, so refuse and ask.
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
- A departure from the plan where the shipped code is right. The audit
  workflow records this as a deviated row in the coverage table, never as a
  finding. Drop it.
- Work the episode has not reached yet. That is an incomplete row in the
  coverage table, not a finding. Drop it.
- A reopening of a decision the plan settled. Quote the decision from the
  plan, name the finding's evidence and judge how serious that evidence is.
  Correctness or quality evidence can reopen a settled decision. Taste never
  does. Every reopening goes to the user's ruling.
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

- Read the code path the finding names, end to end, and the test that covers
  it.
- Read the plan in `../plan` for the decision the finding rests on, and the
  affected package's `CLAUDE.md` for the rule it invokes.
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
  only when the correction is local. Read the finding's primary area ID from
  `tools/architecture-check/src/area-model.json`, then walk that area's last
  ten touched commits with the severity prefix stripped. Two or more `fix:`
  commits there mean the area may not take another patch. Return revise and
  say the finding has to name the structural change instead.

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
gives three answers: check each against its source yourself: the offered
mechanism satisfies `../plan/BOUNDARIES.md`, a claim that no simpler
mechanism exists rests on a plan-recorded reason that holds against the
code, and a claim that the choice is settled points at a boundary entry or
a recorded user decision. A three-answer block whose offered mechanism is
the correction itself gets revise: state the one-sentence form. An
unsettled block goes to the user's ruling, never to a verdict of the
vet's own.

## Verdicts

Return one verdict per finding, in the report's order: accept, revise, drop or
needs the user's ruling. A revise verdict states the revision. A drop verdict
states why. Keep each verdict to a few short sentences.

The user's ruling is needed for three things: a reopening of a decision the
plan settled, machinery with no boundary behind it, and an unsettled trade
block. Name what axis 1 classified, state what the grounded and fix-follows
checks found, and stop there. Never settle one of these on the vet's own
authority.

Before returning the verdicts, look for the sibling report: the same plan
name, scope and sha with the other auditor token. When it exists, read it and
mark every verdict `corroborated` when the sibling reports the same defect,
the same code path producing the same wrong behaviour whatever its tier or
wording, and `unique` when it does not. Corroboration is a signal for the
user's reading order, never a verdict change. Without a sibling report the
verdicts carry no marker.

Write the verdicts to the report's twin file, the same name with `VET-` in
place of `AUDIT-`, as well as into the chat. The twin is untracked and
gitignored, so writing it keeps the vet's read-only rule intact; it is the
one file the vet writes.

## Plan corrections

The report ends with the plan corrections the round wrote. Vet each one on the
first two axes alone. The third does not apply, because a correction carries
no tier and no trace.

One extra test covers all of them. Every correction traces to shipped code
this round inspected, or to an answer the user gave in this round's own
discussion. A correction resting on any other evidence is plan-tier work the
round may not author, so the verdict is drop.

## Coverage table

The report opens with a coverage table. Do not re-audit it. Check a row only
where a finding depends on it, which is when a finding should have been a row,
or a row should have been a finding.

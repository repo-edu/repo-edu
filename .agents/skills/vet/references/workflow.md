# Implementation-finding vet workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/vet.md` and the Codex skill
`.agents/skills/vet/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

The vet's input is another AI assistant's implementation-audit report, an `*-1-audit.<tag>.md` file
at its owning repo root. A report at this repo's root belongs to a round that started here.
[Report discovery](#report-discovery) says how the file is found. Vet its graded findings. Do not
run an audit round of your own. Whether a finding is a good idea is not an axis: a finding can be
appealing and still unauthorised.

The vet is read-only and lands nothing. It runs no command that changes a
tracked file, so no `pnpm fix` and no formatter. Its verdicts inform the
user's ruling on the findings; any edit or commit stays with the fix workflow
that lands the round from its report. The auditor answers the verdicts through
the rebuttal workflow at `.agents/skills/rebut/references/workflow.md`,
writing a `-3-rebut.<tag>.md` twin the fix workflow reads beside this one.

When unattended, follow the audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. Report `finished` only after completing the required checks and
writing every verdict to the `-2-vet.<tag>.md` twin; report completion. A verdict
that needs the user's ruling still completes the vet: the fix phase presents
that open item. The runner reads the twin to decide whether to skip the rebuttal.

Planning-artifact audit reports belong to the sibling plan repo. An implementation-audit report
lives there when its round started there. Its local vet workflow routes to this owned procedure.
When the invocation here names any report stored at the plan repo root, name the file, say the vet
belongs in `../plan` and stop. Continue only when the user explicitly says to.

## Report discovery

Read the [shared round protocol](../../../references/round-protocol.md#manual-phases) for path
resolution. Read the supplied report path and write the supplied vet path, in that argument order;
use the report's judged-repos opening for repo and head checks and its filename for the auditor's
vendor letter.

A hand-run invocation may omit the audit report. Resolve its input and output
under the shared round protocol's **Manual phases** with `paths vet` and your
current writer tag. Automated invocations use their supplied paths unchanged.

Never vet a report whose tag's vendor letter is your own assistant. The vet exists
to check findings from a fresh context in the other assistant. Continue only
when the user explicitly says to.

Check two mismatches before vetting:

- An audited sha in the opening differs from its repo's `git rev-parse --short HEAD`. The
  tree has moved since the audit, so check what moved with
  `git diff --name-only <sha>..HEAD` in that repo. For a both-repo report, run
  this check independently for Repo Edu and the plan repo. Vet against HEAD
  either way: verdicts about a tree nobody uses help nobody. Note the drift in
  the verdicts. When a file a finding rests on has moved, ground the finding
  against that file at HEAD. When the moved tree already resolved the defect,
  the verdict is drop, naming the resolving commit.
- The target in the name differs from the plan and scope or typed commit
  references the report names inside. Apply the shared target rule, using
  the audited head for `HEAD`. One of the two is wrong, so refuse and ask.
  A report that names no scope inside cannot pass this check, so ask before
  vetting.

## Axes

Check each finding on three axes, in this order.

### 1. Authorised

Classify the finding as one of five kinds.

- A defect in the shipped code. The code is wrong, or below the bar this
  repo's standards set. This is the ordinary kind and it needs no further
  authority.
- A defect in the plan text that the shipped code exposes. It stays a graded
  finding. When the plan repo is outside the round's repo set, defer it in the
  Repo Edu commit body. When that repo is in the set or the user directs the
  fix during discussion, the same run applies it as its own plan-repo round
  commit.
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
  `../plan/GROWTH-PATTERNS.md`. Check its trade under axis 3 instead of
  authoring a competing pricing. A real unresolved choice about cost goes to
  the user's ruling.

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
  several. Return revise and state the correction that resolves the cause
  across the affected sites. Recommend a structural change when the reported
  defect has a structural cause.

Read history when needed to verify a finding's cause or a prior ruling.
Cross-round scans belong to glance and watch.

Then check that the finding's consequence holds at the claimed tier under the
`[A]`-`[D]` rubric in this repo's `CLAUDE.md`. Verify the wrong behaviour and,
when reach is `rare` or `very-rare`, the condition that produces it. When the
cost is only rework or re-derivation, verify that cost. These facts may share the
finding's prose; no separate trace is required. A trace that ends with the same
behaviour shipping is not a finding, so the verdict is drop.

Check the trade under the audit workflow's finding-shape rules. The explanation may
be part of the finding's prose. Verify the simpler mechanism, cost, benefit and any claim that the
choice is settled against their sources; return revise for missing substance, not for missing labels
or separate parts. When the correction is the simplest mechanism, verify that claim and the cited
boundary or decision against the code. When that claim cites a plan decision, reopen it only with
evidence that the decision is wrong; otherwise accept it. The user directed this on 2026-09-09.

Check the finding's rarity against its cited evidence. A real unresolved
choice about cost goes to the user's ruling; the vet never settles it.

## Verdicts

Return one verdict per finding, in the report's order: accept, revise, drop or
needs the user's ruling. A revise verdict states the revision. A drop verdict
states why. Keep each verdict to a few short sentences.

Every verdict starts with exactly `<finding number>. [<tier>] <verdict>`. Use the report's finding
number and A/B/C/D tier. The verdict is exactly one of `Accept`, `Revise`, `Drop` or
`Needs user's ruling`. The first line contains nothing else, for example `1. [B] Accept`.
Conditions, notes and required explanations follow on separate lines. Prose before the first verdict
is free; put drift notes there. After the first verdict, every non-empty line is a verdict or a
condition. Any other line counts as a condition, including a narrowing note. The verdict numbers
must match the report exactly. An unconditional Accept with no additional notes ends after the first
line; do not repeat the finding title, evidence or reasoning. Required narrowing notes count as
additional notes. This format applies in both chat and the `-2-vet.<tag>.md` twin.

A reopening of a settled decision takes one of two forms:

- A narrowing keeps the decision's reason and shrinks what the decision
  covers. When the grounded check verified the new evidence first-hand and
  the correction keeps the recorded reason intact, the verdict is Accept,
  with "Noted as a narrowing" on a separate line. It still quotes the superseded
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

The user's ruling is needed for a full reversal of a decision the plan settled
or a real unresolved choice about machinery's cost. Name what axis 1 classified
and what the grounded and fix-follows checks found, then stop. Never settle either
on the vet's own authority.

Write the verdicts to the supplied vet path and into chat.
The twin is untracked and
gitignored, so writing it keeps the vet's read-only rule intact; it is the
one file the vet writes.

## Cross-repo findings

Cross-repo findings are graded findings, so vet all three axes. Also verify that
each one traces to files this round inspected or to an answer the user gave in
this round's own discussion. A deferral resting on any other evidence is work
the round may not author, so the verdict is drop. Deferral is the required
outcome only when the repo hosting the fix is outside the round's repo set.
When that repo is in the set or the user directs the specific fix, the same
run applies it and lands an independent commit there; a plan-file fix uses the
ordinary plan-round form.

## Coverage table

The coverage table follows the report's opening metadata. Do not re-audit it. Check a row only
where a finding depends on it, which is when a finding should have been a row,
or a row should have been a finding.

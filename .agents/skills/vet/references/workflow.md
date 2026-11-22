---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../../references/round-protocol.md
  - ../../../references/round-grammar.md
  - ../../../../../plan/.agents/references/planning-rules.md
  - ../../../../../plan/BOUNDARIES.md
  - ../../../../../plan/GROWTH-PATTERNS.md
---

# Implementation-finding vet workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole. Read each file once. Apply the `simple`
requirement to the whole session and skip its confirm-and-wait step.

The vet's input is an implementation-audit report by any assistant.
[Audit report discovery](#audit-report-discovery) says how the file is found. Vet its graded
findings. Do not run an audit round of your own.

Apply the shared protocol's **Vet checks** for read-only authority,
independence from the panel's other vetters and the axes a vetter does not
judge.

Follow the shared protocol's **Runner result** for every ending.

## Audit report discovery

The [shared round protocol](../../../references/round-protocol.md) owns evidence
rules, tiers, rating meanings, verdict meanings and runner result meanings. Use
the runner's [Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing)
for argument order and the [audit report grammar](../../../references/round-grammar.md#audit-report)
for the judged repos and heads.

When an audited head differs from its repo's current head, follow
[Head drift](../../../references/round-protocol.md#head-drift) before vetting
and say in the verdicts what moved. When the moved tree already resolved the
defect, drop the finding and name the resolving commit.

## Axes

Check each finding on three axes, in this order.

### 1. Authorised

Apply the shared
[completed-commit metadata exclusion](../../../references/round-protocol.md#completed-commit-metadata).
Drop findings on that excluded metadata. Classify the remaining findings.

- A defect in the shipped code. The code is wrong, or below the bar this
  repo's standards set. This is the ordinary kind and it needs no further
  authority.
- A defect in the plan text that the shipped code exposes. It stays a graded
  finding under the shared protocol's **Shared implementation forms**.
- A departure from the plan where the shipped code is right. The audit
  workflow records this as a deviated row in the coverage table. Drop a finding
  on the departure itself. A missing reason must pass
  [Judging deviations](../../../references/round-protocol.md#judging-deviations):
  verify the concrete maintenance problem and that the correction repairs its
  live owner.
- Work the episode has not reached yet. That is an incomplete row in the
  coverage table, not a finding. Drop it.
- A reopening of a decision the plan settled. Quote the decision from the
  plan, name the finding's evidence and judge how serious that evidence is.
  Correctness or quality evidence can reopen a settled decision. Taste never
  does. Whether the vetter may accept the reopening or must hand it to the
  user is decided under the verdict rules.
- New machinery no boundary asks for. Check the supplied boundaries and growth
  patterns. Check its trade under axis 3 instead of
  authoring a competing pricing. A choice about cost goes to the user's
  ruling only when it is real under the shared
  [Real choices](../../../references/round-protocol.md#real-choices).

### 2. Grounded

Verify every load-bearing claim against its source yourself. Do not trust the
audit report's quotes or paraphrases.

- Read the file path the finding names, end to end, and the test that covers it
  when it is code.
- Read the plan in `../plan` for the decision the finding rests on, and the
  governing `CLAUDE.md` in every repo the finding invokes.
- Read targeted commit bodies when a finding depends on a missing departure
  reason. Absence alone does not establish a defect.
- Run a check or a test only in its read-only form, and only when a claim
  rests on it, as in `pnpm --filter <package> test`. Never run a command that
  writes.

A claim about behaviour is grounded when you can point at the code that
produces it. A claim you cannot reach that way is not grounded, whatever the
audit report says about it. A claim about how recorded work behaves follows the
shared protocol's premise kinds under
[Finding explanations](../../../references/round-protocol.md#finding-explanations):
check it against the records or code the finding names, and when it names none,
name the conjecture in the verdict and strip it before grading. When the
correction removes or contradicts evidence the plan or code holds, check that
the finding answers that evidence.

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

Follow the shared protocol's **History reads**.

Then check that the finding's consequence holds at the claimed tier under the
[implementation tiers](../../../references/round-protocol.md#implementation-tiers). Verify the wrong
behaviour. When the cost is only rework or re-derivation, verify that cost. These facts may share
the finding's prose; no separate trace is required. A trace that ends with the same behaviour
shipping is not a finding, so the verdict is drop.

Check the ratings with one question: does the evidence put the finding in a raised cell of the
shared [What a round raises](../../../references/round-protocol.md#what-a-round-raises)? To answer
it, verify whether an end user can meet the wrong behaviour, which sets the reach. When the rarity
is not `ordinary`, verify every condition the finding names, that the conditions are independent
and that their count gives the rarity under the shared
[Reach and complexity](../../../references/round-protocol.md#reach-and-complexity). Then verify the
harm level from what the finding says puts the person back. A value you read differently takes the
verdict that the shared [Vet verdicts](../../../references/round-protocol.md#vet-verdicts) gives it.

Apply the shared [Vet checks](../../../references/round-protocol.md#vet-checks)
to the finding's trade and ratings.

## Verdicts

Use the shared round protocol's [Vet verdicts](../../../references/round-protocol.md#vet-verdicts)
for verdict meanings and delivery and the
[vet report grammar](../../../references/round-grammar.md#vet-report) for values,
numbering and response shape.

Use the shared planning rules'
[Changes to what a plan holds](../../../../../plan/.agents/references/planning-rules.md#changes-to-what-a-plan-holds)
for a finding that reopens a plan decision. That section owns the comparison
each vetter checks against its sources and when the user must rule.

## Cross-repo findings

Cross-repo findings are graded findings, so vet all three axes. Also verify that each one traces to
files this round inspected or to an answer the user gave in this round's own discussion. A deferral
resting on any other evidence is work the round may not author, so the verdict is drop. Check its
disposition against the shared protocol's
[Shared implementation forms](../../../references/round-protocol.md#shared-implementation-forms).

## Coverage table

The coverage table follows the audit report's opening metadata. It has one row per
in-scope step or named commit, not per decision or claim. Do not re-audit it.
Check a row only where a finding depends on it, which is when a finding should
have been a row, or a row should have been a finding. Missing decision or claim
rows do not establish missing inspection.

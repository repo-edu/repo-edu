---
reads:
  - ../../../references/round-protocol.md
  - ../../../../../plan/.agents/references/planning-rules.md
  - ../../../../../plan/BOUNDARIES.md
  - ../../../../../plan/GROWTH-PATTERNS.md
---

# Implementation-finding vet workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole; in a hand-run session, read them whole, following
any listed workflow's header too. Read each file once.

The shared launchers live in the plan checkout under
`home/claude/commands/vet.md` and `home/agents/skills/vet/SKILL.md`.
The runner selects this workflow and its working checkout for both entry routes.
Where a launcher and this file disagree, this file is right.

The vet's input is another AI assistant's implementation-audit report, an `*-2-audit.<tag>.md` file
at the plan repo root.
[Report discovery](#report-discovery) says how the file is found. Vet its graded findings. Do not
run an audit round of your own. Whether a finding is a good idea is not an axis: a finding can be
appealing and still unauthorised.

The vet is read-only and lands nothing. It runs no command that changes a
tracked file, so no `pnpm fix` and no formatter. Its verdicts inform the
user's ruling on the findings; any edit or commit stays with the fix workflow
that lands the round from its report. The auditor answers the verdicts in
a `-4-rebut.<tag>.md` twin the fix phase reads beside this one.

When unattended, follow the shared
[Runner result](../../../references/round-protocol.md#runner-result) for every
ending. Report `finished` only after completing the required checks and
returning every verdict in the final response. The runner saves the twin. A verdict
that needs the user's ruling still completes the vet: the fix phase presents
that open item.

## Report discovery

The [shared round protocol](../../../references/round-protocol.md) owns path resolution,
evidence rules, tiers, rating tokens, verdict formats and runner results. The arguments name the
report to read and the vet output, in that order; use the report's judged-repos opening for repo and
head checks and its filename for the auditor's vendor letter.

Follow the shared [Vet checks](../../../references/round-protocol.md#vet-checks)
for input and output resolution and the other-assistant requirement.

Check two mismatches before vetting:

- An audited head differs from its repo's current head. Follow
  [Head drift](../../../references/round-protocol.md#head-drift) and note the
  changes in the verdicts. When the moved tree already resolved the defect,
  drop the finding and name the resolving commit.
- The target in the name differs from the plan and scope or typed commit
  references the report names inside. Apply the shared target rule, using
  the audited head for `HEAD`. One of the two is wrong, so refuse and ask.
  A report that names no scope inside cannot pass this check, so ask before
  vetting.

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
  finding. When the plan repo is outside the round's repo set, defer it in the
  Repo Edu commit body. When that repo is in the set or the user directs the
  fix during discussion, the same run applies it as its own plan-repo round
  commit.
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
  does. Whether the vet may accept the reopening or must hand it to the
  user is decided under the verdict rules.
- New machinery no boundary asks for. Check the supplied boundaries and growth
  patterns. Check its trade under axis 3 instead of
  authoring a competing pricing. A real unresolved choice about cost goes to
  the user's ruling.

### 2. Grounded

Verify every load-bearing claim against its source yourself. Do not trust the
report's quotes or paraphrases.

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
[implementation tiers](../../../references/round-protocol.md#implementation-tiers). Verify the wrong
behaviour and, when reach is `rare` or `very-rare`, the condition that produces it. When the cost is
only rework or re-derivation, verify that cost. These facts may share the finding's prose; no
separate trace is required. A trace that ends with the same behaviour shipping is not a finding, so
the verdict is drop.

Apply the shared [Vet checks](../../../references/round-protocol.md#vet-checks)
to the finding's trade and rarity.

## Verdicts

Use the shared round protocol's [Vet verdicts](../../../references/round-protocol.md#vet-verdicts)
for the verdict values, numbering, response format and delivery.

Use the [shared planning rules](../../../../../plan/.agents/references/planning-rules.md)
for changes to recorded decisions.
They own when a supported simplification can be accepted and when the user
must rule.

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

The coverage table follows the report's opening metadata. It has one row per
in-scope step or named commit, not per decision or claim. Do not re-audit it.
Check a row only where a finding depends on it, which is when a finding should
have been a row, or a row should have been a finding. Missing decision or claim
rows do not establish missing inspection.

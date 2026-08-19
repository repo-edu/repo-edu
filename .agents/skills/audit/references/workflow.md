# Implementation audit workflow

Interpret the invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `plan-<topic>.md` or `../plan/plan-<topic>.md`. Interpret `3-5`
as a range and `4` as one step, counted against the plan's **Implementation
plan** numbering. A range makes the round scoped. No range makes it complete.
When no plan is named, ask which plan to audit and wait.

Follow this repo's `CLAUDE.md` throughout the audit. This workflow audits
implementation code. Planning artifact audits belong to the sibling plan
repo's own audit workflow.

Before any audit work, read the named file for the plan-repo artifacts this
workflow cannot audit: a `topology-<topic>.md`, a `topology-<topic>-detail.md`,
a `draft-<topic>.md` or a `carry-<topic>.md`. Each is a planning artifact, so
naming one means the round was meant for the plan repo's own audit. Name the
file, say the round belongs there and stop. Continue only when the user
explicitly says to.

## Ready gate

Before any audit work, run the stem scan in `../plan`: `git log --oneline`
filtered to subjects starting with `<file-stem>/`. The gate passes when the
scan holds a `<file-stem>/implemented:` marker, or a standing
`<file-stem>/ready:` one, read by the plan repo's recognition rule: a
file-changing stem commit voids a standing `ready:`, while the
`implemented:` marker records what held at the sibling commit its body names
and no later plan commit withdraws it. A plan correction this audit wrote
therefore never blocks the next round. When the gate fails,
name the newest stem commit, state that the plan reached neither a ready nor
an implemented state and stop. Continue only when the user explicitly says
to.

## Round strategy

Audit a plan by complete rounds alone, or by scoped rounds over step ranges
followed by one complete closing round. On a plan's first round, invoked
without a range and with no audit commit, fix or record for this plan in the
log, do not start inspecting. Size the work from cheap evidence only: the
plan's step count, the episode's commit count and the files and packages it
touches. Recommend one strategy: complete rounds only for a small plan, or
scoped rounds plus the closing round for a large one. Propose the ranges. Cut
ranges where the plan's step groups fall. Keep steps that share a package or
an invariant in one range. Never cut ranges into equal arithmetic parts. Then
wait for the user's choice. The advice fires only on that first round. A given
range or an existing audit commit skips it.

## Round

Run one read-only implementation-audit round. Judge whether this repo correctly
implemented the plan. Report in the order prescribed below, then stop for
discussion. Edit only after the user accepts or revises the findings and asks
for them to be applied.

Close every round with exactly one commit after the user settles its outcome.
A round whose accepted findings changed files lands the fix commit:
severity-prefixed per this repo's convention, with its body opening with the
`Plan: <name>` line followed by `Audit: complete`, `Audit: step <n>` for one
scoped step or `Audit: steps <a>-<b>` for a scoped range.

The body then carries one bullet per accepted finding, and each bullet opens
with that finding's metadata before its prose:

```text
- [area:pkg-integrations-llm] [growth:hardening,unpriced-complexity] [reach:rare] [complexity:low] Cleanup failure no longer displaces the login guidance.
```

`[area:<primary-id>]` is the finding's primary partition area from
`tools/architecture-check/src/area-model.json`, followed by
`[cover:<cover-id>]` for each cover area that applies. `[growth:...]` is the
tag from [Growth tags](#growth-tags), in the same form the report used.
`[reach:...]` and `[complexity:...]` are the ratings from
[Reach and complexity](#reach-and-complexity). All four
are required on every finding bullet, because the commit body is the only
place a later round can read them: chat is gone, and the finding list lives
nowhere else. A bullet that records something other than a finding, such as a
carried decision, takes no metadata. Any other outcome, a clean round or findings the user
declined, lands an empty record commit: `chore(audit): <plan-name> <scope>
clean` or `... declined`, carrying the same `Plan:` and `Audit:` body lines.
One round, one commit per repo the round changes: exactly one commit here, plus
the single `../plan` commit described under [Plan corrections](#plan-corrections)
when the round corrected the plan. The log alone shows every round that ran, its
scope and its outcome, including the clean rounds that would otherwise exist only
in chat.

## Evidence

Scope the implementation episode the way the watch does. Anchor on the
earliest commit whose `Plan: <name>` first body line names this plan, where
`<name>` is the file stem with the `plan-` prefix dropped. Walk from that
anchor to HEAD, including every commit that carries the same `Plan:` line or
touches the same files.

When the plan is under `../plan/archive/<name>/`, first read `README.md` in the
same folder when it exists. It records later outcomes that the frozen plan
cannot carry. Treat a recorded correct departure under the deviation rules
below, not as a strict conformance failure.

Read the plan end to end. Read the final state of the code the episode touched.

A round is read-only until the user accepts its findings, so its evidence
commands must not change tracked files. Build the verification set from every
package whose code or behaviour the round audits. Include a repo tool only
when the audit concerns the rule that tool enforces.

Read each affected package's `CLAUDE.md` and `package.json`. Run its `check`
and `test` scripts when they exist, plus the relevant validation named by the
package guidance or plan. Use `pnpm --filter <package> <script>` for package
scripts. If a required command can change tracked files, defer it to the fix
phase and use its read-only form for evidence.

Do not run a root whole-workspace script only because an implementation audit
is running. The round's scope decides the checks and tests.

## Fix phase

After the user accepts the round's findings, apply them. One acceptance covers
the whole round: the code fixes here and the plan corrections in `../plan`. Then
rebuild the verification set from the packages the round audited and the packages
the fixes touched. Format only the fixed files. Run each affected package's
required `check`, `test` and validation scripts. Include a repo tool only when
the audit or fix concerns the rule it enforces.

For implementation-audit fixes, this package-scoped rule replaces the root
verification default. Do not run root `pnpm check` or the whole `pnpm test`
suite unless affected package guidance or the plan requires that exact root
command. Run writing commands only while no other audit fix is running in the
working tree.

## Coverage

Before drafting findings, build a coverage table, one row per item in scope,
with columns for the item, the implementing commits or code and one
disposition: implemented, deviated, incomplete or dropped. A complete round's
scope is every **Implementation plan** step and every **Decisions** entry.
Steps the episode has visibly not reached yet land as incomplete rows, not as
graded findings. A scoped round's table carries only the named steps, because
classification is the inspection the range exists to skip. The round still
checks the in-range code against every **Decisions** entry, since decisions
bind the whole plan, and violations land as findings.

Close the table with one line in the form `Implementation coverage: I/T
implemented; V deviated; N incomplete; R dropped.` The table proves the round
inspected its whole scope rather than only the areas where findings cluster. A
clean report still includes the table and the coverage line before it says
there are no findings.

## Judging deviations

This is not a strict conformance audit. Where the implementation departed from
the plan, judge the shipped code first. It must be correct and of the best
quality the repo's standards allow. A departure that responds to a real error
or imperfection in the plan is correct behaviour. Record it as deviated in the
table, not as a finding, when the code is right. A deviation whose reason no
commit body records is itself a finding. Grade it by the cost of a later reader
mistaking intent for drift. Code that faithfully followed a defective plan
into a defect is still a finding. The standard is the shipped code, never
fidelity for its own sake. Do not reopen decisions the plan settled. Question
one only on correctness or quality evidence, never on taste.

## Findings

Grade each finding with the [A]-[D] implementation tiers in this repo's
`CLAUDE.md`. Present the findings as one numbered list sorted A through D.
Start at 1 and keep the numbers increasing across tier changes. Findings land
on the implementation. When a finding's root cause is the plan itself, say so
in the finding and carry the plan-side correction into the plan corrections
below. Every finding also carries a growth tag, per
[Growth tags](#growth-tags).

## Finding shape

State the required correction first, even when the evidence behind it is
subtle. The reader should see what to do before they have to decode anything.
Each finding then gives its evidence and, at tiers A to C, its failure trace. A
D-tier finding derives the trace to grade itself and leaves it out of the
report, because D is the floor and there is nothing below to check against.

The trace starts on its own line prefixed `Failure trace:`, never run into the
end of the finding's prose, so the correction and the trace read as separate
parts. It carries up to two short sentences.

- What goes wrong. The wrong behaviour the shipped code produces. Always
  written.
- The condition. The condition that has to hold before that behaviour
  appears. Written whenever the finding's reach rating is `rare` or
  `very-rare`, so the token's claim is checkable against a named condition.

The rating itself lives in the finding's `[reach:...]` token, per
[Reach and complexity](#reach-and-complexity), so the trace's silence carries
no rating: a trace with the first sentence alone belongs to an `ordinary`
finding, and the token on the same finding says so.

Do not restate how serious the fault is. Severity is the tier itself, graded by
the [A]-[D] rubric in this repo's `CLAUDE.md`, so a severity clause in the trace
says the same thing twice. The condition is the part no other piece of the
finding carries: the token rates how far the fault reaches, and the named
condition is what makes that rating checkable rather than a guess.

A finding whose whole cost is rework, re-derivation or a later reader mistaking
intent for drift has no runtime situation to rate. It carries
`[reach:developer]`, and its trace states that cost and stops.

The trace is the tier's evidence, so a tier claim without one does not stand.
Reach is evidence for the user's accept-or-challenge ruling on the finding and
on any guard behind it. It never moves the tier: a rare A-tier fault is still
A-tier. A trace that ends with the same behaviour shipping is not a finding, so
drop it rather than report it.

## Growth tags

Every finding carries a growth tag naming the patterns in
`../plan/GROWTH-PATTERNS.md` it could violate, by their labels:
`[growth:hardening]` for one, `[growth:hardening,unpriced-complexity]` when
more than one could apply, listed in pattern order, and `[growth:none]`
when none does. The tag rides the finding in the report and
the matching bullet in this round's commit body, in the bullet form fixed
under [Round](#round), so it survives in the log after the chat is gone. A
tag that reaches only the report is lost, and the next round is back to
having no memory.

The bar is could it be, not is it. A false positive costs one bracket. A
false negative costs the loop this rule exists to break: a run of rounds each
repairing machinery that no boundary asks for, every round locally defensible
and no round able to see the run. The tag is a suspicion, never a verdict, and
it blocks nothing. A finding tagged `[growth:hardening]` still lands. So there is no
reason to suppress one, and the signal lives in the run rather than the
instance.

The tag is what gives a fresh round the memory it otherwise lacks. Before
drafting findings, read the full bodies of the episode's audit commits, found
by the walk under [Evidence](#evidence), and collect every metadata bullet
in them. Count the growth tags by pattern and the reach and complexity
values by rung. Rounds that predate a token, or that tagged growth by
number before the labels existed, carry no readable form of it; read their
bullets on their prose and say the history is partial rather than reading
absence as a clean run. When one pattern appears across several rounds, say
so in the report above the tiered findings, naming the rounds and the
pattern. That statement is the round's own output, not a diagnosis of the
user's judgment.

## Pricing a run

When a pattern runs across rounds, or the reach and complexity pair
shows the unpriced-trade run named under
[Reach and complexity](#reach-and-complexity), the round stops adding to the
run and prices it instead, before its tiered findings. Two answers, both
short:

- The simplest mechanism that still satisfies `../plan/BOUNDARIES.md`. Read
  the boundary the machinery invokes and state only what it actually asks
  for.
- What the current design buys over that mechanism, stated as what the user
  gets, not as what the code does.

Then stop for the user's ruling. Do not resolve the trade in the report. The
plan requiring the machinery is not an answer, because the plan was written by
rounds: `GROWTH-PATTERNS.md` records the anchor-rule trap where a round
invents a requirement and a later round reads that requirement as
justification. Only a written user decision or a boundary entry ends the
question.

When the answer is that no boundary asks for the machinery, say that the plan
step is the defect and stop, rather than reporting more findings against it.
Carry the plan-side correction into [Plan corrections](#plan-corrections) when
the user accepts it. When the trade is genuinely worth its cost, the user says
so, the round records the ruling in the plan with its reason and the
pattern stops being a signal for that machinery.

Pricing is expensive, so it runs on a run of tags and not on every round. A
single tagged finding is tagged and left alone.

## Reach and complexity

Every finding carries a reach and a complexity token beside its growth tag,
floor values spelled out rather than left off: `[reach:developer]` and
`[complexity:none]` are written, never implied. No absence carries meaning,
so a forgotten token can never pass as a rating, and the floor values on the
page are what make a round's values countable.

`[reach:developer|very-rare|rare|ordinary]` says how far the fault reaches a
person. `developer` means nothing the end user can see: the whole cost is
rework, re-derivation or regression risk on the development side. The other
three values rate a situation the end user does meet, by the condition that
has to hold rather than by a frequency guess. `ordinary` means no special
condition has to hold. `rare` means a condition must hold that can arise
while every component honours its contract, such as unusual timing, an
unusual user action, resource exhaustion or an outage. `very-rare` means the
condition requires the platform to break its own contract, such as an
operating-system or filesystem facility failing to do what it guarantees. The
token is the failure trace's condition sentence made durable and countable;
the sentence names the condition that makes the rating checkable.

`[complexity:none|low|medium|high]` says what standing structure the
correction leaves in the code, graded at the heaviest obligation it plants,
never at the effort of making it. Each rung is defined by a kind, not judged.
`none` leaves nothing structural, and covers wording, a recorded reason, a
deletion and a test. `low` plants a rule: a branch, a case or a check.
`medium` plants state: something that must be kept and stay true. `high`
plants an owner concern: a boundary, or moving who is responsible for an
invariant. Replication grades at the obligation the copies create: the same
rule replicated across files or packages must stay in agreement, which is
kept state, `medium`; state replicated across packages leaves that agreement
with no single keeper, which is an owner concern, `high`. Tests never raise
the rung; they follow the machinery they cover, and counting them would
charge every guarded mechanism twice.

The two tokens are one pair, and the pair is the point. Growth pattern 6 in
`../plan/GROWTH-PATTERNS.md` says a user-facing cost vetoes while a
complexity cost never does, and its test is to name the trade: what the work
gives the user against what its machinery costs. The pair fires that test on
every finding, so a cross-round run of `[reach:developer]`,
`[reach:very-rare]` or `[reach:rare]` beside non-`none` `[complexity:...]`
values on the same machinery is the unpriced trade shown in the log without
anyone having to notice it, and it prices under
[Pricing a run](#pricing-a-run) the same way a growth-number run does. Both
tokens rate facts, not worth, and like the growth tag they block nothing: a
finding tagged `[reach:rare] [complexity:high]` still lands. The vocabulary
is shared with the plan repo's finding metadata, one spelling across both
logs.

## Plan corrections

The plan is a live document while its steps are still being implemented, so an
error the audit finds in it is fixed by the round that found it. This audit
writes the plan file. It never writes a topology, a detail topology, a draft or
a carry: those belong to the plan repo's own rounds.

Split each correction by whether the fix needs a choice.

- No choice needed. The plan states something the shipped code shows is false,
  and one fix is plainly right: a step naming a function that no longer exists,
  a broken cross-reference, a step the code proved impossible, a **Decisions**
  entry the shipped code contradicts where the code is right. Write the fix and
  show it in the report. The user strikes or revises it during the discussion.
- A choice is needed. More than one sensible fix exists, usually because an
  earlier step changed what a later step should do. Put the options to the user
  during the discussion, take the answer and write it into the plan together
  with the reason the user gave. A decision written without its reason is
  re-derived and reversed by a later plan round, which is the failure this rule
  exists to prevent.

Before rewriting a **Decisions** entry, read the topology the plan came from,
in `../plan` root while the transfer phase is open and under
`../plan/archive/<name>/` after loop-close. The user should not choose against a
reason the plan never carried forward. Absence of a topology is normal, not an
error.

Every correction traces to the shipped code this round inspected or to a choice
the user made in this round's discussion. Do not author plan-tier work on any
other basis.

The corrections land as one commit in `../plan` under that repo's commit
convention, subject `<file-stem>/implementation-<severity sequence>:`, graded by
that repo's tiers. Its body follows that repo's bullet rules and names the
commit range this round inspected here. The correction commit leaves a standing
`ready:` marker in place. A round that corrects no plan file commits nothing
there.

## Closing round

Scoped rounds never close the plan, even when their ranges tile every step.
Each scoped verdict describes the HEAD it ran on, and later steps age it. The
proof that the plan is implemented is complete rounds on the finished code
whose severity has stabilised at C or below with no new A, each round's table
classifying every row. A round that finds nothing is not required. Prior audit
commits inform those rounds, ranking their reports and naming the fixes to
re-verify. They never excuse a row from inspection.

The closing round expects a `<file-stem>/implemented:` marker in the stem
scan. A later plan commit does not unseat it, so a plan correction an earlier
round wrote leaves the marker standing. When the marker is missing, name
that once and continue on the user's word. The round
closes with its own single commit under the one-round-one-commit rule above: a
fix commit when its accepted findings changed files, the empty record commit
otherwise. It lands no further status commit here. The status is recorded once,
in `../plan`, by the `<file-stem>/implementation-audited:` marker this session
writes there on the user's word. The marker is severity-free. Its body names
the HEAD the closing round inspected and compiles the audit round history from
this repo's audit commits.
The closing round uses the same package-scoped verification rule. Its set
includes every package the complete episode concerns, not every package in the
workspace. Run the required checks and tests once after accepted fixes, or as
evidence when the round comes back clean.

The closing round is advice, not a gate. When asked to treat the implementation
as done without one, name the missing round once and continue on the user's
word.

## Report order

Open by naming the workflow that ran, an implementation audit in this Repo Edu
repo, then the plan file, its ready commit, the episode's commit range and
the round's scope: complete, the audited step or the audited step range. Then report the
coverage table with its coverage line. Then, when a growth-tag number runs
across rounds, the run statement and the pricing under
[Pricing a run](#pricing-a-run). Then the numbered tiered findings, each
carrying its growth, reach and complexity tokens, and the plan corrections.
Stop there.

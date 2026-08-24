# Implementation audit workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/audit.md` and the Codex skill
`.agents/skills/audit/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

Interpret the invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `<topic>.md` or `../plan/<topic>.md`. Interpret `3-5` as a
range and `4` as one step, counted against the plan's **Implementation plan**
numbering. A range makes the round scoped. No range makes the scope
`steps-all`, the whole plan. When no plan is named, ask which plan to audit and
wait.

This procedure also serves implementation-audit rounds on changes hosted by
the plan repo. Its audit workflow routes those rounds here and supplies the
local substitutions: that repo's checks, report root and finding metadata.
Follow the `CLAUDE.md` of every repo the round judges. Planning-artifact
audits still belong to the plan repo's own audit workflow.

Before any audit work, read the named file for the plan-repo artifacts this
workflow cannot audit: a `topology-<topic>.md`, a `topology-<topic>-detail.md`,
a `draft-<topic>.md` or a `carry-<topic>.md`. Each is a planning artifact, so
naming one means the round was meant for the plan repo's own audit. Name the
file, say the round belongs there and stop. Continue only when the user
explicitly says to.

## Ready gate

Before any audit work, run the stem scan in `../plan`: `git log --oneline`
filtered to the topic's joined bare, `plan-<topic>` and `topology-<topic>`
subject stems. The gate passes when that scan contains a `ready:` marker, which
stands until loop-close. When the gate fails, name the newest joined-stem
commit, state that the plan is not ready and stop. Continue only when the user
explicitly says to.

## Round strategy

The user sets the step range. Follow it exactly. Never select, propose or
replace it. The plan's **Execution and audits** subsection is guidance for the
user, not instructions for the workflow.

The step range decides the repo set. Derive each in-range step's hosting repo
from the files its plan text says to change. A step may be hosted by Repo Edu,
the plan repo or both. The round's repo set is the union of those hosts; a
steps-all round derives it from every step. When a host is unclear, stop for a
plan correction.

## Round

Run one read-only implementation-audit round. Judge only the repos in the
round's repo set. Report in the order prescribed below, then stop for
discussion.
Edit only after the user accepts or revises the findings and asks for them to
be applied.

A single-repo round writes its report at that repo's root, even when the round
started in the other repo. A both-repo round writes one report at the root where
the round started. Report placement never changes record keying.

After the user settles the outcome, land at most one implementation-audit
record per repo judged. A record lands in the repo whose files its findings
concern. A both-repo round therefore lands independent records in each repo.
Repo Edu records use the shared implementation-audit forms from
`../plan/CLAUDE.md`. A Repo Edu round that accepts only findings deferred to a
repo outside the round's repo set uses the shared empty severity form. The
subject's `impl-audit-<step scope>` form carries the round's scope, `step-<n>`,
`steps-<a>-<b>` or `steps-all`; no `Audit:` body line repeats it.

A directed correction to the plan file is different from an implementation
record. Apply it in the same run and land it as its own plan-repo commit in the
ordinary plan-round form, citing the finding it applies. Do not repeat it as a
deferral or an implementation record.

The body then carries one bullet per accepted finding, and each bullet opens
with that finding's metadata before its prose:

```text
- [area:pkg-integrations-llm] [growth:hardening,unpriced-complexity] [reach:rare] [complexity:low] Cleanup failure no longer displaces the login guidance.
```

For a Repo Edu finding, `[area:<primary-id>]` is the finding's primary
partition area from
`tools/architecture-check/src/area-model.json`, followed by
`[cover:<cover-id>]` for each cover area that applies. `[growth:...]` is the
tag from [Growth tags](#growth-tags), in the same form the report used.
`[reach:...]` and `[complexity:...]` are the ratings from
[Reach and complexity](#reach-and-complexity). Repo Edu finding bullets require
all four token kinds. Plan-repo finding bullets omit only `[area:]` under the
local substitution above. The commit body is the only place a later round can
read them: chat is gone, and the finding list lives nowhere else. A bullet that
records something other than a finding, such as a carried decision, takes no
metadata.

A finding deferred from a Repo Edu-only round to the plan repo uses the body
form in this repo's `CLAUDE.md`; it keeps its tier, plan location and metadata
in the same round commit. A plan-repo round carries no `[area:]` token, because
the area model belongs to Repo Edu. A clean round lands the shared clean record
in each repo judged, its subject carrying the step scope. When the user declines
the finding set in full, no commit lands because disagreement is not a state.
The logs show every confirmed round that ran, including clean rounds that would
otherwise exist only in chat.

## Evidence

Scope the implementation episode in every judged repo the way the watch does.
In each repo, anchor on the earliest commit whose subject carries the topic's
bare, `plan-<topic>` or `topology-<topic>` stem. Walk from that anchor to its
HEAD, including every commit that carries a joined stem or touches the same
files. Read the judged repos' walks together for a both-repo round.

When the plan is under `../plan/archive/<name>/`, first read `README.md` in the
same folder when it exists. It records later outcomes that the frozen plan
cannot carry. Treat a recorded correct departure under the deviation rules
below, not as a strict conformance failure.

Read the plan end to end. Read the final state of the files the episode touched
in every repo the round judges.

Read `../plan/BOUNDARIES.md` beside the plan: boundaries change only by user
decision, so the current file can be newer than the plan. This is a check, not
a source of findings. A boundary is not a minimum the round may raise, and the
round never edits the file. The check covers three things. Shipped code that
crosses a current boundary lands as a finding. A plan step that conflicts with
a current boundary becomes a cross-repo finding under
[Cross-repo findings](#cross-repo-findings). And the round's own outputs are
held to the same line: a proposed correction or deviation ruling that would
cross a boundary does not land.

A round is read-only until the user accepts its findings, so its evidence
commands must not change tracked files. Build the verification set from every
package whose code or behaviour the round audits. Include a repo tool only
when the audit concerns the rule that tool enforces.

For Repo Edu files, read each affected package's `CLAUDE.md` and `package.json`.
Run its `check` and `test` scripts when they exist, plus the relevant validation
named by the package guidance or plan. Use
`pnpm --filter <package> <script>` for package scripts. For plan-repo files,
use the local substitutions in that repo's audit workflow. If a required
command can change tracked files, defer it to the fix phase and use its
read-only form for evidence.

Do not run a root whole-workspace script only because an implementation audit
is running. The round's scope decides the checks and tests.

## Fix phase

When the round's report has a `VET-` twin, read it before the discussion
resumes. Answer each verdict: agreement carries it into the round's outcome,
disagreement names the evidence the vet misread. Present the reconciled
outcome in three groups: verdicts both assistants agree on, verdicts the
round contests, and the items the vet sent to the user's ruling. The user
reads along and rules by exception: a go on the reconciled outcome is the
acceptance, and a reservation on any item reopens it, including a
reservation the report never raised.

One kind of finding is not covered by accepting the round as a whole, in a
vetted round and an unvetted one alike: a finding that carries a trade
block no ruling has settled needs its own answer. When the user picks
the simpler mechanism, that mechanism becomes the finding's required
correction, revised in the discussion like any other revision. When that
ruling overturns a reason the plan records, the round carries the correction
and the user's reason as a [cross-repo finding](#cross-repo-findings), so the
plan correction is applied or deferred without re-derivation. When the user
keeps the machinery, the same record carries the ruling and its reason. The
code finding then follows the normal path: a correction the ruling leaves
standing is applied, and a finding the ruling dissolves is omitted from the
round commit.

After the user accepts the round's findings, apply every directed correction.
One acceptance covers the whole round: fixes in each judged repo and findings
deferred only to repos outside the repo set. Then rebuild the verification set
from the packages and plan-repo files the round audited and the fixes touched.
Format only the fixed files. Run each affected package's required `check`,
`test` and validation scripts, and the plan repo's local checks when that repo
changed. Include a repo tool only when the audit or fix concerns the rule it
enforces.

For Repo Edu implementation-audit fixes, this package-scoped rule replaces the
root verification default. Do not run root `pnpm check` or the whole
`pnpm test` suite unless affected package guidance or the plan requires that
exact root command. Run writing commands only while no other audit fix is
running in either directed working tree.

## Coverage

Before drafting findings, build a coverage table, one row per item in scope,
with columns for the item, the implementing commits or code and one
disposition: implemented, deviated, incomplete or dropped. A steps-all round's
scope is every **Implementation plan** step and every **Decisions** entry.
Steps the episode has visibly not reached yet land as incomplete rows, not as
graded findings. A scoped round's table carries only the user-named steps. The
round still checks that code against every **Decisions** entry, since decisions
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
as corrections in their hosting repo when that repo is directed, or as
deferrals in the current repo's round commit when it is not. When a finding's
root cause is the plan itself, say so in the finding and either apply the
directed plan correction or carry it into the deferrals below. Every finding
also carries a growth tag, per
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

At tiers A to C, a finding whose three tokens all show risk also carries a
trade block: its growth tag is not `none`, its reach is not `ordinary` and
its complexity is not `none`. Such a finding suspects machinery, covers a
situation the user rarely or never meets and plants standing structure. The round
prices that trade in the finding itself, instead of leaving it for a later
run of rounds. A D-tier finding carries no trade block: pricing costs more
than the tier is worth. A finding on machinery this round already prices
under [Pricing a run](#pricing-a-run) carries none either; the run's
pricing is the one pricing, and its ruling covers the finding.

The block starts on its own line prefixed `Trade:`, after the trace, and
gives four short answers:

- The simplest mechanism that works and satisfies `../plan/BOUNDARIES.md`.
  Deletion or doing nothing counts when either is enough.
- What the machinery costs to build and own. Name the rule, state or owner
  concern it leaves behind, not only its complexity token.
- What the machinery gives the user over that mechanism.
- Whether a boundary entry or a recorded user decision already settles the
  choice.

When the correction is itself that simplest mechanism, there is no trade
to price, and writing the four answers restates the correction as if a
simpler rival existed. Collapse the block to one sentence naming that
fact and what settles it:
`Trade: the correction is the simplest mechanism; boundary 4 settles it.`
A full four-answer block then always marks a real choice for the user's
ruling, and the one-sentence form says there is nothing to weigh.

Check the first answer against the plan before offering it. When the plan
records a reason that mechanism fails, and the reason holds against the
code, say that no simpler mechanism exists instead of offering one. When
the recorded reason looks wrong, offer the mechanism and quote the plan's
objection beside it, so the user rules with both in view. The plan can
settle whether a mechanism works. It never settles whether machinery is
worth its cost, because a round may have invented the plan's requirement:
that is the anchor-rule trap `../plan/GROWTH-PATTERNS.md` records. Only a
boundary entry or a recorded user decision settles worth. Ground the cost
answer in the standing structure the correction plants. The complexity
token names its heaviest kind; the cost answer names the actual burden.

The block changes nothing about where the finding lives. The finding stays
in the numbered list with its number, its tier and its metadata bullet.

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

The bar is could it be, not is it. A false positive costs one bracket, or
one trade block and its ruling when the other two tokens also show risk. A
false negative costs the loop this rule exists to break: a run of rounds each
repairing machinery that no boundary asks for, every round locally defensible
and no round able to see the run. The tag is a suspicion, never a verdict, and
it blocks nothing. A finding tagged `[growth:hardening]` still lands. So
there is no reason to suppress one. The tag's cross-round signal lives in
the run; a single risky finding prices its own trade inside its trade
block, per [Finding shape](#finding-shape), and still lands.

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
run and prices it instead, before its tiered findings. Four answers, all
short:

- How rare the defended event is. Ground this in the reach tokens and the
  conditions named by the rounds in the run.
- The simplest mechanism that works and still satisfies
  `../plan/BOUNDARIES.md`. Read the boundary the machinery invokes and state
  only what it actually asks for. Check the mechanism against the plan's
  recorded reasons, the same check the trade block under
  [Finding shape](#finding-shape) runs.
- What the current design costs to build and own. Name the standing rule,
  state or owner concern.
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
Carry the correction into [Cross-repo findings](#cross-repo-findings) when the
user accepts it. When the trade is genuinely worth its cost, the user says so
and the cross-repo record carries the ruling with its reason. A directed plan
fix applies it in this run; otherwise a later plan round applies it. Either
route stops the pattern from remaining an open signal for that machinery.

Pricing a run is expensive, so it runs only on a cross-round run of a
growth pattern or of the reach and complexity pair. A single tagged finding
is not priced here; when its three tokens all show risk, its own trade
block under [Finding shape](#finding-shape) prices it.

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

## Cross-repo findings

Deferral covers only work nobody directed. A defect whose fix belongs to a
repo outside the round's repo set is graded and carried in the current
repo's round commit body. A plan defect deferred from a Repo Edu-only round
uses the plan-deferral form in this repo's `CLAUDE.md` and states the required
plan correction, its shipped-code evidence and any user ruling with its
reason. A Repo Edu defect deferred from a plan-repo-only round names its Repo
Edu location, required correction and plan-repo evidence in that round's
plan-repo commit body.

When the user directs a specific cross-repo fix during discussion, apply the
correction in the same run and commit it independently in its hosting repo. A
plan-file correction uses the ordinary plan-round form. No write in one repo
triggers or waits on the other.

Split each deferral by whether the correction needs a choice.

- No choice needed. The plan states something the shipped code shows is false,
  and one correction is plainly right: a broken cross-reference, a step naming
  a function that cannot exist or a decision the correct shipped code
  contradicts. Show the correction in the report for the user to accept or
  revise.
- A choice is needed. More than one sensible correction exists. Put the options
  to the user during the discussion. When the user rules, carry the answer and
  its reason in the deferral. When the user does not rule, keep the choice open
  in the deferral instead of choosing for them.

Before proposing a change to a **Decisions** entry, read the archived source the
plan came from when one exists. The user should not choose against a reason the
plan never carried forward. Absence of an older source is normal, not an error.

Every deferral traces to the files this round inspected or to a choice the user
made in this round's discussion. The round tells the user that follow-up in the
undirected repo rests with them. A later user-directed round in that repo
collects open deferrals from the other repo's joined-stem scan, cites the
commits it applies and leaves already-corrected text alone.

## Episode settlement

Scoped rounds never settle the episode, even when their ranges tile every
step. Each scoped verdict describes the HEAD it ran on, and later steps age it.
The proof that the implementation is settled is steps-all rounds on the
finished code whose severity has stabilised at C or below with no new A, each
round's table classifying every row. A round that finds nothing is not required.
Prior audit commits inform those rounds, ranking their reports and naming the
fixes to re-verify. They never excuse a row from inspection.

The final steps-all round expects the shared `implemented:` marker in every repo
it judges. Each marker means every implementation step that repo hosts has
landed. When one is missing, name it once and continue on the user's word. The
round lands its fix, deferral or clean records under the repo-keying rule above.
On the user's word after the implementation audit settles, use each repo's
shared closing form: the Repo Edu `closed:` marker or the plan repo's loop-close
move. The stem scans already show every round, so no compiled history belongs
in either closing body.

The final steps-all round uses the same package-scoped verification rule. Its
set includes every package the whole episode concerns, not every package in
the workspace. Run the required checks and tests once after accepted fixes, or
as evidence when the round comes back clean.

The final steps-all round is advice, not a gate. When asked to treat the
implementation as done without one, name the missing round once and continue
on the user's word.

## Report order

Open by naming the workflow that ran, the repo or repos the implementation
audit judges, then the plan file, its ready commit, the episode's commit range
and the round's user-set scope: steps-all, one step or one step range.
Then report the coverage table with its coverage line. Then, when a growth
pattern or the reach and complexity pair runs across rounds, the run statement
and the pricing under [Pricing a run](#pricing-a-run). Then the numbered tiered
findings, each carrying its growth, reach and complexity tokens, and any
cross-repo findings. Then write the report to its file under
[Report file](#report-file) and stop there.

## Report file

After presenting the report, write the same report to its repo root and say so,
then stop for the user's ruling. A single-repo round uses the root of the repo it
judged. A both-repo round uses the root where the round started. The file is the
copy the vet workflow reads, so the chat and the file must not differ.

Use the report repo's established single-repo base name. At the Repo Edu root
that is `AUDIT-<plan-name>-<scope>-<auditor>-<own-sha>.md`; at the plan repo
root its local workflow supplies its artifact-based base name. A both-repo
report appends `-<other-sha>` before `.md`:

- `<plan-name>` is the topic stem used by the shared subject grammar. For an
  archived `plan.md`, use the archive folder's name.
- At the Repo Edu root, `<scope>` is `steps-all`, `step-<n>` or
  `steps-<a>-<b>`, the round's scope with its spaces turned into hyphens.
- `<auditor>` is the launcher's auditor token, `claude` or `codex`.
- `<own-sha>` is the report repo's `git rev-parse --short HEAD` at audit time.
- `<other-sha>` is the other repo's short HEAD for a both-repo round. The
  repo where the round started holds the report and stays first.

The file is gitignored, so writing it keeps the round read-only; it is the
one file the round writes before its fix phase. The session that lands the
round's records deletes that round's own report and its `VET-` twin in the same
turn: the commit bodies carry the accepted findings durably, and a report left
behind goes stale against the moved HEAD. Which round a
file belongs to is read from the auditor token in its name, never from who
wrote it: the `VET-` twin is the other assistant's commentary on this
round's report and is consumed with it. Files carrying the other auditor
token belong to the other assistant's round and are never deleted here.
They stay until that round lands its own commit, or until the user
says its findings are settled. The user directed this split on 2026-08-21
after a session deleted the other assistant's still-open report; this
origin note stands in place of a case.

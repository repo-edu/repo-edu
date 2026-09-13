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
numbering. A range makes the round scoped. No range makes the scope `all`, the
whole plan. When no plan is named, ask which plan to audit and wait.

An invocation that names no plan file and names one or more commits Git can
resolve makes the round commit-scoped, judging work no plan covers. Read
`commit-scope.md` beside this file for that round's scope, gate, baseline,
coverage, report name, record and settlement, and follow the rest of this
workflow unchanged.

This procedure also serves implementation-audit rounds on changes hosted by
the plan repo. Its audit workflow routes those rounds here and supplies the
local substitutions: that repo's report root and finding metadata.
Follow the `CLAUDE.md` of every repo the round judges. Planning-artifact
audits still belong to the plan repo's own audit workflow.

The round ends at its report file. The auditor answers a vet through the
rebuttal workflow at `.agents/skills/rebut/references/workflow.md`. Everything
from the user's ruling through applying corrections, landing records and
deleting the report belongs to the fix workflow at
`.agents/skills/fix/references/workflow.md`. The fix starts in a fresh session
from the report file. See [Fix guard](#fix-guard).

Before any audit work, read the named file for the plan-repo artifacts this
workflow cannot audit: a `topology-<topic>.md`, a `topology-<topic>-detail.md`,
a `draft-<topic>.md` or a `carry-<topic>.md`. Each is a planning artifact, so
naming one means the round was meant for the plan repo's own audit. Name the
file, say the round belongs there and stop. Continue only when the user
explicitly says to.

## Runner result

When the prompt identifies an unattended implementation-audit phase, follow
this rule for every ending, including an early stop. It is shared by audit,
vet, rebuttal, fix and brief, including when a plan-repo launcher routes the
phase here with local substitutions. Ordinary interactive invocations do not add
a result line.

Make the last line of the final response `PHASE RESULT: <JSON object>`.
Keep it outside any code fence and out of the report or twin file. The report
and its chat copy remain identical; append the result after the chat copy
only. The object has exactly these fields:

- `status`: one of the three outcomes below.
- `file`: the absolute path written by a finished audit, vet, rebuttal or
  brief. Use `null` for every other outcome, including a finished fix.
- `reason`: a short explanation for a failed phase. Use `null` otherwise.

| Status | Meaning | Runner action |
| --- | --- | --- |
| `finished` | The phase completed its required work. A fix landed its records and cleaned up its report and twins. A brief wrote its file beside the transcript. | Continue, or finish the run after the brief. |
| `needs-ruling` | The fix phase presented an open item for the user. | Run the brief, then open that fix session interactively. |
| `failed` | The phase could not complete its required work. | Show the reason and stop. |

Each phase judges its own outcome. Audit, vet, rebuttal and brief use only `finished` or `failed`;
the reports may carry open items for the fix phase to present, and the brief retells them for the
user. An audit finishes when its required evidence and report are complete and the report is
written. A clean report also finishes. Return the absolute path actually written, including when it
replaced an existing report. Reports from other rounds do not block the run.

The audit's path remains the input to every phase up to the fix. A finished
vet or rebuttal returns its own twin's path for feedback; that path does not
replace the audit path. The report's directory selects the later phase's
owning launcher and local workflow rules, even when the resumed session
started in the other repo. The brief's input is the round transcript instead,
so its launcher always belongs to the Repo Edu root, where the runner writes
every transcript.

Required work still blocked by a permission refusal or another error means
`failed`, even when the assistant can end its turn normally or a partial
report exists. A successful permitted retry counts as success when all
required work is complete. Judge what remains blocked, not whether any tool
call failed earlier. A missing input or unmet workflow gate also means
`failed`; reserve `needs-ruling` for the fix workflow's open items. This rule
grants no permission to bypass a gate or make the user's decision.

The user directed explicit results and successful permitted retries on
2026-09-10. Workflows own the phase outcome; the runner follows it without
reading reports or judging tool failures.

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
whole-plan round derives it from every step. When a host is unclear, stop for a
plan correction.

## Round

Run one read-only implementation-audit round. Judge only the repos in the
round's repo set. Report in the order prescribed below, write the report file
and stop.

A single-repo round writes its report at that repo's root, even when the round
started in the other repo. A both-repo round writes one report at the root where
the round started. Report placement never changes record keying: the fix
workflow lands one record per repo judged, in the repo whose files the
findings concern, under its Records section.

Each finding in the report carries its metadata tokens in the form the fix
workflow's record bullets use, so a finding copies from the report into the
commit body unchanged. For a Repo Edu finding, `[area:<primary-id>]` is the
finding's primary partition area from
`tools/architecture-check/src/area-model.json`, followed by
`[cover:<cover-id>]` for each cover area that applies. `[growth:...]` is the
tag from [Growth tags](#growth-tags). `[reach:...]` and `[complexity:...]`
are the ratings from [Reach and complexity](#reach-and-complexity). Repo Edu
findings require all four token kinds. Plan-repo findings omit only
`[area:]` under the local substitution above, because the area model belongs
to Repo Edu.

A finding deferred from a Repo Edu-only round to the plan repo is written in
the report with its tier and plan location before the shared tokens, the body
form in this repo's `CLAUDE.md`, so the fix workflow carries it into the round
commit as written.

## Fix guard

The round is read-only and ends at its report file. The one later phase this
session takes part in is the rebuttal: the auditor's answer to the `VET-`
twin runs here through the rebuttal launcher, `/rebut` for Claude and
`$rebut` for Codex, because this session already holds the evidence the
findings rest on and the rebuttal fixes nothing. When this session is asked
to answer the twin without that launcher, discuss the findings for a ruling,
apply a correction, land a record or delete the report, do not do it. Say
that the rebuttal runs through `/rebut` or `$rebut` here and that the fix
phase runs through the fix launcher, `/fix` or `$fix`, in a fresh Codex
session. Name the report file they start from and stop.
Continue only when the user explicitly says to.

The reason is context: a session that has read a whole step range and then
fixes in the same context grows past the point where the fixes are made well.
The user directed the split on 2026-09-09; this origin note stands in place
of a case.

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

A round is read-only and runs no checks and no tests. Its evidence is what it
reads. For Repo Edu files, read
each affected package's `CLAUDE.md` and `package.json` for its rules; do not
run its scripts. For plan-repo files, use the local substitutions in that
repo's audit workflow the same way.

## Coverage

Before drafting findings, build a coverage table, one row per item in scope,
with columns for the item, the implementing commits or code and one
disposition: implemented, deviated, incomplete or dropped. A whole-plan round's
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

## Round yield

After the coverage line, close the round with two more lines that tally the
findings it accepted:

```text
Round yield: <n> ordinary; <n> rare; <n> developer.
Structure: <n> removing, <n> adding, <n> flat.
```

The first line counts the accepted findings by their `[reach:...]` value,
treating `very-rare` as rare. The second counts them by the sign of their
`[complexity:...]` value: `minus-` levels remove, `low`, `medium` and `high` add
and `none` is flat. A clean round writes both lines with zeroes.

The tally exists because the decision to run another round needs the round's
yield, and reading it out of per-finding tokens means re-reading the whole log
by hand. It answers what a round bought: findings an end user can meet, and
whether the corrections left the code with more standing structure or less.
Both lines are counts over the findings, unlike the commit subject's trailing
`growth-<level>` or `pruning-<level>`, which measures one commit's own code
before and after.
The two answer different questions and neither replaces the other.

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
Start at 1 and keep the numbers increasing across tier changes. The fix
workflow lands findings as corrections in their hosting repo when that repo
is directed, or as deferrals in the current repo's round commit when it is
not. When a finding's root cause is the plan itself, say so in the finding
and carry the plan correction into the cross-repo findings below. Every
finding also carries a growth tag, per [Growth tags](#growth-tags).

## Finding shape

Briefly explain the problem, its consequence and the correction, supported by
decisive evidence from sources you have read. Combine these in a short paragraph
when they fit; include useful quotes and file paths so the reader can verify the
defect. Use another paragraph when needed, without packing several ideas into
one sentence. Separate correction, evidence, failure-trace and trade parts are
not required. Expand when a real unresolved choice needs explanation.

At tiers A to C, the explanation states what wrong behaviour the code produces
without the correction. For `rare` or `very-rare` reach, name the condition that
makes the rating checkable. When the cost is only rework or re-derivation, state
that cost and use `[reach:developer]`. A D-tier finding derives its consequence
for grading but need not report it. A tier claim without a consequence does not
stand; drop a finding whose trace ends with the same behaviour shipping. Reach
supports the user's ruling on the outcome and never changes the tier.

At tiers A to C, explain the trade when a finding's growth tag is not `none`,
its reach is not `ordinary` and its complexity is `low`, `medium` or `high`.
State the simplest
mechanism that works within `../plan/BOUNDARIES.md`, what the proposed machinery
costs to build and own, what it gives the user over that mechanism and whether a
boundary entry or recorded user decision settles the choice. Deletion or doing
nothing counts when either is enough. Name the standing rule, state or owner
concern rather than repeating the complexity token.

Keep this in the finding's explanation; a separate `Trade:` block is optional.
When the correction is itself the simplest mechanism, one sentence saying so
and naming the boundary or decision that settles it is enough. Expand only for
a real unresolved choice. Do not repeat pricing already given under
[Pricing a run](#pricing-a-run). D-tier findings need no trade explanation.
The user directed this shorter form on 2026-09-09.

Check the simpler mechanism against the plan's recorded reasons and the code.
When a reason still rules it out, say no simpler mechanism works. When the reason
looks wrong, quote it and give the evidence against it. The plan can settle
whether a mechanism works; only a boundary entry or recorded user decision
settles a real choice about whether machinery is worth its cost. This preserves
the anchor-rule protection in `../plan/GROWTH-PATTERNS.md`. An unresolved choice
goes to the user under the fix workflow's reconciliation rules.

## Growth tags

Every finding carries a growth tag naming the patterns in
`../plan/GROWTH-PATTERNS.md` it could violate, by their labels:
`[growth:hardening]` for one, `[growth:hardening,unpriced-complexity]` when
more than one could apply, listed in pattern order, and `[growth:none]`
when none does. What is tagged is the code the finding flags, never the
correction it asks for; the complexity token rates the correction. A finding
that flags a guard added control by control tags `growing-lists` even when
its correction removes the copies. The tag rides the finding in the report and the matching
bullet in the round's commit body, in the record bullet form the fix workflow
fixes, so it survives in the log after the chat is gone. A tag that reaches
only the report is lost, and the next round is back to having no memory.

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
values by level. Rounds that predate a token, or that tagged growth by
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
fix applies it in the fix phase; otherwise a later plan round applies it.
Either route stops the pattern from remaining an open signal for that
machinery.

Pricing a run is expensive, so it runs only on a cross-round run of a
growth pattern or of the reach and complexity pair. A single tagged finding
is not priced here; when its three tokens all show risk, its own trade
block under [Finding shape](#finding-shape) prices it.

A run is on one piece of machinery only when its bullets name the same standing rule, state or owner
concern. A shared area, file or panel is not the same machinery. The pricing quotes those bullets
and prices only what they name. Bullets that each carry one existing rule to one more surface are
consistency, not a run, and are not priced. The `desktop-application-architecture` step 7 audit at
`5c321b66` priced a listing counter that none of its three run bullets named; each bullet had
carried the session admission rule to one more clone-all surface.

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
token makes the rating durable and countable; the finding's explanation names
the condition that makes it checkable.

`[complexity:minus-high|minus-medium|minus-low|none|low|medium|high]` says
how the correction changes the standing structure of the code as a whole:
the code after the fix compared with the code before it, never the effort
of making it. Three kinds of obligation count, each defined by a kind, not
judged. A rule is a branch, a case or a check. State is something that must
be kept and stay true. An owner concern is a boundary, or who is
responsible for an invariant. Compare the count of each kind before and
after. The token names the highest kind whose count changed. It reads
`low`, `medium` or `high` when rules, state or owner concerns grew, and
`minus-low`, `minus-medium` or `minus-high` when that kind shrank. `none`
means no kind changed, and covers wording, a recorded reason and a test. A
fix that removes a split owner and adds a branch reads `minus-high`: the
owner kind is the highest that changed. Replication grades at the
obligation the copies create: the same rule replicated across files or
packages must stay in agreement, which is state; state replicated across
packages leaves that agreement with no single keeper, which is an owner
concern. Tests never move the token; they follow the machinery they cover,
and counting them would charge every guarded mechanism twice. The commit
subject's trailing mark runs this same measurement over a whole commit
instead of one correction, and its level is this token's level: `growth-low`
is `low` and `pruning-high` is `minus-high`. **Commit Severity Prefix** in
this repo's `CLAUDE.md` owns that mark's form.

The two tokens are one pair, and the pair is the point. Growth pattern 6 in
`../plan/GROWTH-PATTERNS.md` says a user-facing cost vetoes while a
complexity cost never does, and its test is to name the trade: what the work
gives the user against what its machinery costs. The pair fires that test on
every finding, so a cross-round run of `[reach:developer]`,
`[reach:very-rare]` or `[reach:rare]` beside `low`, `medium` or `high`
`[complexity:...]` values on the same machinery is the unpriced trade shown
in the log without anyone having to notice it, and it prices under
[Pricing a run](#pricing-a-run) the same way a growth-number run does. A
`minus-` value is the opposite signal: the correction removed more structure
than it added, which counts in its favour and never joins a priced run. Both
tokens rate facts, not worth, and like the growth tag they block nothing: a
finding tagged `[reach:rare] [complexity:high]` still lands. The vocabulary
is shared with the plan repo's finding metadata, one spelling across both
logs. Bullets from before 2026-09-11 graded only what a correction added, so
a bare level there says nothing about what the fix removed.

## Cross-repo findings

Deferral covers only work nobody directed. A defect whose fix belongs to a
repo outside the round's repo set is graded and carried in the current
repo's round commit body. A plan defect deferred from a Repo Edu-only round
uses the plan-deferral form in this repo's `CLAUDE.md` and states the required
plan correction, its shipped-code evidence and any user ruling with its
reason. A Repo Edu defect deferred from a plan-repo-only round names its Repo
Edu location, required correction and plan-repo evidence in that round's
plan-repo commit body.

A specific cross-repo fix the user directs is applied in the fix phase, in the
same run as the round's other corrections, and committed independently in its
hosting repo under the fix workflow's rules.

Split each deferral by whether the correction needs a choice.

- No choice needed. The plan states something the shipped code shows is false,
  and one correction is plainly right: a broken cross-reference, a step naming
  a function that cannot exist or a decision the correct shipped code
  contradicts. Show the correction in the report for the user to accept or
  revise.
- A choice is needed. More than one sensible correction exists. Put the options
  in the report. The fix phase puts them to the user and carries the answer
  and its reason in the deferral, or keeps the choice open when the user does
  not rule, instead of choosing for them.

Before proposing a change to a **Decisions** entry, read the archived source the
plan came from when one exists. The user should not choose against a reason the
plan never carried forward. Absence of an older source is normal, not an error.

Every deferral traces to the files this round inspected or to a choice the user
made in the round's fix phase. The round tells the user that follow-up in the
undirected repo rests with them. A later user-directed round in that repo
collects open deferrals from the other repo's joined-stem scan, cites the
commits it applies and leaves already-corrected text alone.

## Episode settlement

Scoped rounds never settle the episode, even when their ranges tile every
step. Each scoped verdict describes the HEAD it ran on, and later steps age it.
The proof that the implementation is settled is whole-plan rounds on the
finished code whose severity has stabilised at C or below with no new A, each
round's table classifying every row. A round that finds nothing is not required.
Prior audit commits inform those rounds, ranking their reports and naming the
fixes to re-verify. They never excuse a row from inspection.

Structure joins that proof. A `growth-medium` or `growth-high` run across those
rounds that no later round repaid says the code is still ratcheting where
severity has already settled, the failure `../plan/GROWTH-PATTERNS.md` records.
The round names the run and the machinery under it, and the user prices that
machinery under growth pattern 6. A single high mark is not a bar, because
closing an A-tier finding can require adding an owner.

The final whole-plan round expects the shared `implemented:` marker in every
repo
it judges. Each marker means every implementation step that repo hosts has
landed. When one is missing, name it once and continue on the user's word. The
round's records and, once the implementation audit settles, each repo's
closing form land through the fix workflow.

The final whole-plan round follows the same rule: no checks or tests as
evidence.

The final whole-plan round is advice, not a gate. When asked to treat the
implementation as done without one, name the missing round once and continue
on the user's word.

## Report order

Open by naming the workflow that ran, the repo or repos the implementation
audit judges, then the plan file, its ready commit, the episode's commit range
and the round's user-set scope: the whole plan, one step or one step range.
Then report the coverage table with its coverage line. Then, when a growth
pattern or the reach and complexity pair runs across rounds, the run statement
and the pricing under [Pricing a run](#pricing-a-run). Then the numbered tiered
findings, each carrying its growth, reach and complexity tokens, and any
cross-repo findings. Then write the report to its file under
[Report file](#report-file) and stop there.

## Report file

After presenting the report, write the same report to its repo root and say so,
then stop. A single-repo round uses the root of the repo it judged. A both-repo
round uses the root where the round started. The file is the copy the vet and
fix workflows read, so the chat and the file must not differ.

Both repos use `AUDIT-<plan-name>-<scope>-<auditor>-<own-sha>.md` for a
single-repo implementation report. A both-repo report appends `-<other-sha>`
before `.md`:

- `<plan-name>` is the topic stem used by the shared subject grammar. For an
  archived `plan.md`, use the archive folder's name.
- `<scope>` is `all`, `step-<n>` or `steps-<a>-<b>`, the round's scope
  with its spaces turned into hyphens.
- `<auditor>` is the launcher's auditor token, `claude` or `codex`.
- `<own-sha>` is the report repo's `git rev-parse --short HEAD` at audit time.
- `<other-sha>` is the other repo's short HEAD for a both-repo round. The
  repo where the round started holds the report and stays first.

The file is gitignored, so writing it keeps the round read-only; it is the
only file the round writes. The round never deletes a report: the fix
workflow deletes the round's own report and its `VET-` twin in the turn that
lands the records, and never touches a file carrying the other auditor
token.

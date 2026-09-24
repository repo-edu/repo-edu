# Implementation audit workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/audit.md` and the Codex skill
`.agents/skills/audit/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

Read the shared [round protocol](../../../references/round-protocol.md) for
file names and writer tags. In a runner-started audit, the first argument is
the absolute report path to write. Read the remaining arguments as the audit
scope. Do not allocate or claim again. A hand-run audit follows
[Round allocation](#round-allocation).

Interpret the remaining invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `<topic>.md` or `../plan/<topic>.md`. Interpret `3-5` as a
range and `4` as one step, counted against the plan's **Implementation plan**
numbering. A range makes the round scoped. No range makes the scope `all`, the
whole plan. When neither a plan nor a commit reference is named, ask which to
audit and wait.

An invocation that names no plan file and names commit references, including
`HEAD` or `HEAD-<n>`, makes the round commit-scoped, judging work no plan covers.
Resolve the references under **Range** in `commit-scope.md` before asking Git
to resolve them; `HEAD-<n>` is workflow shorthand. Read
`commit-scope.md` beside this file for that round's scope, gate, baseline,
coverage, report name, record and settlement, and follow the rest of this
workflow unchanged.

This procedure also serves implementation-audit rounds on changes hosted by
the plan repo. Its audit workflow routes those rounds here and supplies the
local substitutions: that repo's report root and finding metadata.
Follow the `CLAUDE.md` of every repo the round judges. Planning-artifact
audits still belong to the plan repo's own audit workflow. The runner selects
that workflow when invoked from the plan root with an artifact alone. Its
sessions and round files belong to the invoking root. The shared brief launcher
stays in Repo Edu and writes beside the supplied transcript at either root.
Its launcher location never changes the session's working directory.

The round ends at its report file. The auditor answers a vet through the rebuttal workflow at
`.agents/skills/rebut/references/workflow.md`. Everything from the user's ruling through applying
corrections and landing records belongs to the fix workflow at
`.agents/skills/fix/references/workflow.md`. When that fix stops for a ruling, the document the user
rules from is written in that fix session under `.agents/skills/fix/references/ruling.md`. The fix
starts in a fresh session from the report file. See [Fix guard](#fix-guard).

Before any audit work, read the named file for the plan-repo artifacts this
workflow cannot audit: a `topology-<topic>.md`, a `topology-<topic>-detail.md` or
a `carry-<topic>.md`. Each is a planning artifact, so
naming one means the round was meant for the plan repo's own audit. Name the
file, say the round belongs there and stop. Continue only when the user
explicitly says to.

## Runner result

When the prompt identifies an unattended round phase, planning or implementation, follow this rule
for every ending, including an early stop. It is shared by audit, vet, rebuttal, fix, brief, the two
ruling passes and the two watch passes. Planning workflows read this section from its Repo Edu home;
their planning rules stay in the plan repo. Implementation routes may supply local substitutions.
Ordinary interactive invocations do not add a result line.

Make the last line of the final response `PHASE RESULT: <JSON object>`.
Keep it outside any code fence and out of the report or twin file. The report
and its chat copy remain identical; append the result after the chat copy
only. The object has exactly these fields:

- `status`: one of the three outcomes below.
- `reason`: a short explanation for a failed phase. Use `null` otherwise.

The runner reads whether the audit is clean from the report, whether every
finding was accepted unconditionally from the vet twin and the highest landed
tier from both repositories' commit logs.

| Status | Meaning | Runner action |
| --- | --- | --- |
| `finished` | The phase completed its required work. A fix landed its records and cleaned up its report and twins. A brief wrote its file beside the transcript. | Continue, or finish the run after the watch. |
| `needs-ruling` | The fix phase wrote the final ruling for its open decisions. | Check and display the ruling file, collect the user's reply and resume the same fix in the background. Only a completed fix proceeds through the normal checks, brief and watch; stopping without a reply retains the round files. |
| `failed` | The phase could not complete its required work. | Show the reason and stop. |

Each phase judges its own outcome. Every phase but the fix uses only `finished` or `failed`; the
reports may carry open items for the fix phase to present, and the brief retells them for the user.
An audit finishes when its required evidence and report are complete and the report is written. A
clean report also finishes. Write only the supplied report path, replacing it when it already
exists. Reports from other rounds do not block the run.

The audit's supplied path remains an input through the fix. Vet and rebuttal
receive their complete input and output paths. After a clean audit the runner
completes the round directly. For a plan target it retains the report and lands
one empty clean record in the sole judged repo or at the invoking root when
both repos were judged, using only the audit's model record and capability tag.
Commit audits retain their report without a commit. This path starts no later
session, brief, glance or watch and leaves existing handoffs untouched. The
report retains the judged repo set and audited heads. The user directed this
on 2026-09-23. An explicitly requested chain still follows its normal crossover
rule, and an explicit watch remains available.
After a vet that accepted every finding the
rebuttal does not run, so the fix reads the report with its vet twin alone.
Launcher ownership is defined by the phase table in
`tools/audit-round/src/phase.ts`, independently of report placement.
All round files live at the invoking root. The brief receives the transcript
and its output path. The fix receives the ruling output path separately from
its report arguments. It writes the final ruling and checks it for clarity
before returning `needs-ruling`. The runner checks and displays that file directly.
Only after the full fix has completed does the runner write the brief and append its saved
contents to the terminal output. No separate ruling session runs.

The two watch passes follow a round with audit findings that finished, and take neither the
report nor the transcript. The watch reads the commit record and never the
round, so the runner gives the watch pass only the file to write and the cache
root, and the watch edit only the draft as file arguments. Both prompts also
receive the same joined Git evidence for the audited plan, computed after the
fix and only when due. They run under
`.agents/skills/watch/references/workflow.md`, and only when the runner's own
glance at the commit record found the watch due; that glance is code in
`tools/audit-round/src/glance.ts`, not a session, and `--no-watch` skips it.

Required work still blocked by a permission refusal or another error means
`failed`, even when the assistant can end its turn normally or a partial
report exists. A successful permitted retry counts as success when all
required work is complete. Judge what remains blocked, not whether any tool
call failed earlier. A missing input or unmet workflow gate also means
`failed`; reserve `needs-ruling` for the fix workflow's open items. This rule
grants no permission to bypass a gate or make the user's decision.

The user directed explicit results and successful permitted retries on
2026-09-10. Workflows own the phase outcome; the runner validates the report,
vet twin and landed subjects without judging tool failures.

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

The fix lands one record in each repo whose files took an accepted finding.
A clean round lands one record in the sole judged repo or at the invoking
root when both repos were judged, as named in the report opening.

Each finding in the report carries its metadata tokens in the form the fix workflow's record bullets
use, so a finding copies from the report into the commit body unchanged. Keep the uppercase tier
before those tokens in the commit bullet, as `- [C] [area:<primary-id>] ...`. For a Repo Edu
finding, `[area:<primary-id>]` is the finding's primary partition area from
`tools/architecture-check/src/area-model.json`, followed by `[cover:<cover-id>]` for each cover area
that applies. `[growth:...]` is the tag from [Growth tags](#growth-tags). `[reach:...]` and
`[complexity:...]` are the ratings from [Reach and complexity](#reach-and-complexity). Repo Edu
findings require all four token kinds. Plan-repo findings use `- C [section:<heading>] ...` in the
commit, with the heading in kebab case. They omit `[area:]`, because the area model belongs to Repo
Edu.

A finding deferred from a Repo Edu-only round to the plan repo uses the same
report block below, with `[plan:...]` in place of `[area:...]` on its opening
token line. The fix carries that location into the round commit.

## Fix guard

The round is read-only and ends at its report file. The one later phase this
session takes part in is the rebuttal: the auditor's answer to the `-2-vet.<tag>.md`
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

Before assessing the implementation or drafting findings, read
`../plan/GROWTH-PATTERNS.md` completely.

In every judged repo, locate the implementation commits for the user-named
steps through the joined topic stems. Follow later corrections and the history
of the files those steps changed, including off-plan corrections, to find the
evidence needed to judge their current behaviour and recorded departures.
Read both repos for a both-repo round. This discovers scope evidence; it does
not compute the watch episode or classify its trajectory.

When the plan is under `../plan/archive/<name>/`, first read `README.md` in the
same folder when it exists. It records later outcomes that the frozen plan
cannot carry. Treat a recorded correct departure under the deviation rules
below, not as a strict conformance failure.

Read the plan end to end. Read the current files that implement every in-scope step
in every judged repo, including files added or moved by later corrections.

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
Both lines are counts over the findings, unlike the commit subject's leading
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

Put every finding, including cross-repo findings, in one `## Findings` field.
Use this block form, with a numbered bold tier and title on the first line and
the metadata tokens on their own line immediately after the title, before the explanation.
Separate the title, token line and explanation with blank lines:

1. **C: Conflicting report names**

   [area:tool-audit-round] [growth:none] [reach:developer] [complexity:none]

   The report rule and its example name different files. The vet cannot resolve
   the example. Align the example with the rule.

Keep numbering continuous from 1. A field with no findings contains exactly
`No findings.` instead of finding blocks. A report with only deferred findings
still has findings. Quoted evidence and code blocks belong inside their finding.

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
a real unresolved choice. D-tier findings need no trade explanation.
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

The watch alone counts these tags across rounds and judges repeated growth.
The audit may read history to establish a finding or a prior ruling, without
a mandatory episode scan. Each finding keeps its own trade assessment.

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
subject's leading mark runs this same measurement over a whole commit
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
in the log for the watch to judge. A
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

The watch judges convergence and repeated structural growth across these
rounds. The audit supplies current coverage and findings; it does not price
runs or classify the trajectory. The user owns the settlement decision.

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

Open by naming the workflow that ran and include exactly one plain line: `Judged repos: plan@<sha>`,
`Judged repos: repo-edu@<sha>` or `Judged repos: plan@<sha>, repo-edu@<sha>`. Use each judged repo's
short audited HEAD. Repos read only as evidence stay outside that line. It selects the repos for
vet, rebuttal, fix and clean completion. The filename holds the writer tag; do not repeat or look up
that tag for the opening. Then name the plan file, its ready commit and the implementation commits
inspected. State the round's user-set scope: the whole plan, one step or one step range.
Then report the coverage table with its coverage line. Then the
`## Findings` field, including cross-repo findings in the same numbered list and block form. Then
write the report to its file under [Report file](#report-file) and stop there.

## Report file

After presenting the report, write the same report to the supplied absolute
path at the invoking root and say so, then stop. A hand-run audit uses the
report path printed by `pnpm audit-round name`. The chat and file
must not differ. The opening identifies the judged repos and their heads.
Do not add an opening writer tag.

The report and a hand-run audit's claim are gitignored, so writing them keeps
the round read-only. The audit never deletes a report. The runner closes the
report set after a finished fix; a hand-run fix uses `pnpm audit-round close`.

## Round allocation

Use the supplied report path; without one, run
`pnpm audit-round name <target> [scope-or-commits...] --auditor <full tag>` at the invoking root and
use its printed audit report path.

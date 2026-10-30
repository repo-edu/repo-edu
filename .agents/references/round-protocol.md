# Shared round protocol

This reference owns the meaning and reasons shared by round phases in Repo Edu
and the sibling plan repo. It defines finding grades, evidence rules, trade
pricing, reconciliation and settlement. Rules labelled for implementation apply
only to implementation rounds.

The [round document grammar](round-grammar.md) owns every assistant-written form
the audit-round runner parses. The
[subject grammar](subject-grammar.md) owns commit subjects and model records.
The [runner documentation](../../tools/audit-round/CLAUDE.md) owns file paths,
target resolution, phase arguments, retained machine data and command effects.
Read this file from the Repo Edu checkout; plan-repo workflows reach it at
`../repo-edu/.agents/references/round-protocol.md`.

## Finding tiers

Use the rubric for the work being judged. The same letters carry different
meanings in planning and implementation rounds.

### Planning tiers

- **A**: architectural or scope-changing. Holds when the wrong shape would ship
  silently or cost a session or more of rework. In a widening round, A also
  covers a finding that would lock the wrong shape in: a real alternative that
  displaces the current shape, or a structural flaw that invalidates it.
- **B**: a real bug or missing decision in code that must exist to ship the
  user-facing task. Holds when the implementer would ship a wrong but passing
  answer. In a widening round, B is a substantive but fixable issue in the
  shape.
- **C**: detail or clarification of a decision already made. Holds when several
  plausible interpretations exist and the implementer would pick wrong,
  subject to the planning C admission rule.
- **D**: wording. Floor.

The plan repo's
[shared planning rules](../../../plan/.agents/references/planning-rules.md) own
admission and grading discipline, including the C admission rule.

### Implementation tiers

- **A**: data loss, corruption, a broken core workflow or an architectural flaw
  likely to ship silently or require broad rework.
- **B**: a real user-visible bug, reliability issue or unresolved code decision
  that must be settled before shipping.
- **C**: a narrow correctness, maintainability or test-coverage issue in a
  non-critical path.
- **D**: wording, style, formatting or low-risk polish.

## Severity sequence

The sequence is a sorted run-length count of graded concerns, with zero
categories omitted. It carries severity, reach and maintenance-burden change
into the commit graph, where a reader can see the trajectory without opening
every body. Steps and markers carry no graded concerns and no sequence.

The [subject grammar](subject-grammar.md) owns the sequence's shape, its slot and
which commit classes carry it. The commit hook derives the counts, letter case
and leading `!` from the graded body bullets, overwriting any authored value.
Write the rest of the subject and the bullets; leave the sequence slot to the
hook.

Three marks give the sequence its meaning:

- A tier letter is uppercase when the concern's reach is `ordinary`, `rare` or
  `very-rare`, which an end user can meet. It is lowercase for `developer`
  reach.
- A leading `!` means at least one concern has `ordinary` reach, where no
  special condition has to hold.
- A leading `growth-<level>` or `pruning-<level>` states the whole commit's net
  change in maintenance burden. `growth-none` means no material net change.
  Measure the commit, never add up its finding tokens. A deferral record changes
  no code and carries no burden mark.

The burden level uses [Reach and complexity](#reach-and-complexity).
`growth-high` corresponds to `[complexity:high]`, `pruning-high` to
`[complexity:minus-high]` and `growth-none` to `[complexity:none]`. The same
measurement in the subject and body keeps the short trajectory honest.

Explain a graded commit's net change in one untiered decision bullet in its
existing body. Name the obligations added and removed and why one side
outweighs the other. This is the commit-level instance of the account rule in
[Reach and complexity](#reach-and-complexity).

## Finding metadata

Every graded concern carries its finding number and metadata from its report
into the round's durable record. The
[round document grammar](round-grammar.md#audit-report) owns the report block
and location cases. Its
[commit record bullet](round-grammar.md#commit-record-bullet) production owns
the matching body form. The parsers share the rating-token definition, so the
report and record cannot give one finding two spellings.

Location says which owner the correction belongs to:

- A planning finding names its search direction and artifact section.
- A local plan-repo implementation finding names its section.
- A local Repo Edu finding names its primary area and any cross-cutting cover
  areas from `tools/architecture-check/src/area-model.json`.
- A cross-repo finding names the destination owner. It is a deferral only when
  that destination is outside the judged repo set. The grammar's
  [implementation location table](round-grammar.md#implementation-location-table)
  makes that boundary explicit.

A deferral exists so a round can record a defect it proved without writing in a
repo it was not authorised to change. It never turns a repo already in the
judged set into an outside destination. The plan doctrine's
[Shared implementation forms](../../../plan/CLAUDE.md#shared-implementation-forms)
owns record placement, directed cross-repo fixes and who follows up.

The search-direction value is `excess` for functionality the artifact can shed
or simplify and `missing` for functionality it lacks. Across rounds their
balance shows whether an artifact is still growing or has started to shed.
Commit bullets written before that value existed read as missing, because
excess was not yet a search obligation.

A record bullet that lands a report finding carries that finding's number in
its first token, `[finding:<n>]`. The round data joins bullet and finding by
that number, so the bullet's short title may differ from the report's. Keep
titles distinct across the report, because the vet and rebuttal name findings
by them. Each accepted graded concern, D included, gets one numbered bullet. A
bullet without a number records work no finding asked for. A carried decision
or trade ruling that is not a finding takes no tier or metadata.

Name the abstraction the issue touches, not only its correction, so the watch
can cluster related findings. When a round reverses or narrows a prior
decision, name that decision, the new evidence, its seriousness and why the new
direction holds. Writing a reversal as an ordinary fix hides instability from
the watch.

## Growth-pattern tags

Every finding names the patterns in `../plan/GROWTH-PATTERNS.md` it could
violate, in that file's order. Use `none` when no pattern applies. The
[round grammar](round-grammar.md#common-terminals) owns the token shape while
the plan file owns the open label set.

Tag the work the finding flags, never the correction it asks for. A finding
about a guard added control by control therefore carries `growing-lists` even
when its correction removes the copies. The tag survives in the report and
matching record so a later watch can see a run.

The bar is whether the work could match a pattern, not whether the round has
already proved that it does. A false positive costs one token, or one priced
trade and its ruling when the other risk tokens also fire. A false negative
can hide a run of locally defensible rounds growing machinery no boundary asks
for. The tag is a suspicion, never a verdict, and blocks nothing by itself.

Apply [History reads](#history-reads) to these tags. Each finding prices its own
trade; the watch judges the cross-round signal.

## Reach and complexity

Every finding carries a reach and complexity value. Floor values are explicit:
`developer` and `none` are written rather than implied. No absence carries
meaning, so a forgotten rating cannot pass as a floor.

Reach says how far the fault reaches a person:

- `developer`: nothing an end user can see. The cost is rework,
  re-derivation or regression risk during development.
- `ordinary`: no special condition has to hold.
- `rare`: a condition must hold that can arise while every component honours
  its contract, such as unusual timing, an unusual user action, resource
  exhaustion or an outage.
- `very-rare`: the condition requires the platform to break its own contract,
  such as an operating-system or filesystem facility failing to do what it
  guarantees.

For `rare` and `very-rare`, the finding names the condition so the rating is
checkable.

Complexity says how the correction changes the maintenance burden as a whole:
what future work must understand, preserve and coordinate, never the effort of
making the correction.

| Level | Meaning | Practical anchor |
| --- | --- | --- |
| Low | A small additional maintenance burden. | Few obligations whose interactions remain contained. |
| Medium | A substantial additional maintenance burden. | A sizeable body of conditions to preserve or several agreements that must change together. |
| High | An extensive additional maintenance burden. | A large body of conditions to preserve, constraints spread through the system or extensive coordination between changes. |

Choose an increase, reduction or no material change after comparing the whole
before and after. The round grammar owns the closed spellings. A finding
compares the correction with the existing code and instructions. A commit
compares the whole commit before and after. A yield report compares a decision
with the simplest coherent alternative that omits it. Moving a responsibility
does not create or remove one. An unbuilt alternative supplies no removal
credit.

Consider amount and interaction together. Many independent rules can
accumulate substantial burden, while a small amount of tightly coupled code
can carry it. Rules, state, tests and ownership are evidence, not automatic
levels. Replication is evidence of agreement and coordination costs, not an
automatic escalation. Include workflow instructions, since procedures agents
must follow create obligations too. Do not count test machinery and the
mechanism it covers twice.

Explain the concrete obligations added and removed in the finding's or yield
decision's existing explanation. In a commit, use the untiered decision bullet
required under [Severity sequence](#severity-sequence). The rating summarises
that account. The anchors guide judgement rather than impose numerical
thresholds.

The account rule applies whenever a finding, yield decision or whole commit is
graded. Without it, a size label hides which obligations support the rating.
Accepting that opacity was rejected after a kind-based burden mark failed to
say how much a contained delegation procedure added. Each assessment adds an
account to an existing explanation rather than another report or gate.

One burden scale serves commit marks, findings and yield reports. Scope,
evidence and output stay prescribed while burden size is judged. The account
makes disagreement inspectable; it does not make the scale mechanical.

Reach and complexity form one pair. Growth pattern 6 says a user-facing cost
can veto while a complexity cost goes unpriced. A run of developer, very-rare
or rare reach beside growing complexity on the same machinery exposes that
trade for the watch. A reduction is the opposite signal and does not join the
run. The values rate facts, not worth. Their one direct role in choosing an
answer is the rare-case rule under [Real choices](#real-choices).

## Finding explanations

The [round grammar](round-grammar.md#audit-report) owns the numbered Markdown
block, token order, field order and empty forms. This section owns what the
explanation must prove.

Briefly state the problem, its consequence and the correction, supported by
decisive evidence from sources the auditor read. Include useful paths and
short quotations so the reader can verify the defect. Combine the parts in a
short paragraph when they fit and separate them when that is clearer. Quoted
evidence and code blocks stay inside their finding.

At tiers A to C, an implementation finding states what wrong behaviour the code
produces without the correction. A planning finding states what the
implementation session would do differently and what wrong code or behaviour
would result. For a runtime defect, name the triggering situation and concrete
outcome. A planning finding also says how often a person meets that situation.
When the cost is only rework or re-derivation, say so and use developer reach.
A D finding derives its consequence for grading but need not report it. A tier
claim without a consequence does not stand; drop a finding whose trace ends
with the same behaviour shipping.

At tiers A to C, explain the trade when the growth-pattern value is not `none`,
reach is not `ordinary` and complexity is an increase. State the simplest
mechanism that works within `../plan/BOUNDARIES.md`, what the proposed machinery
costs to build and own, what it gives the user over that mechanism and whether a
boundary entry or recorded user decision settles the choice. Deletion or doing
nothing counts when either is enough. Name concrete obligations and their
interactions rather than repeating the rating.

Keep the trade in the finding's explanation. A separate block is optional.
When the correction is the simplest mechanism, one sentence naming the
boundary or decision that settles it is enough. D findings need no trade
explanation.

Check the simpler mechanism against the plan's recorded reasons and the code.
When a reason still rules it out, say why no simpler mechanism works. When the
reason looks wrong, quote it and give the evidence against it. A plan can
settle whether a mechanism works. Only a boundary entry or recorded user
decision settles a real choice about whether machinery is worth its cost. A
choice that stays real under [Real choices](#real-choices) goes to the user
under [Reconciliation](#reconciliation).

This trade rule applies only when an A to C finding meets all three trigger
conditions above. Most findings sit at the floor values. Without the rule the
risk tags flag a trade nobody prices. Each firing costs a short explanation and
a vet check. A real unresolved choice also costs the user's ruling. That charge
is smaller than the correction round needed after unpriced machinery lands.

## History reads

Cross-round scans belong to the judge, glance and watch. Other phases read
history when needed to establish a specific finding, prior ruling, a rule's
origin or an implementation departure. Lifecycle, scope discovery and handoff
lookups remain required. This keeps current-work review separate from series
and trajectory judgement without withholding the evidence a finding needs.

The plan doctrine's [Handoff](../../../plan/CLAUDE.md#handoff) owns the handoff
for both round kinds. The phase landing the record writes it. The next audit
reads it under that section's read gate.

## Completed commit metadata

Plan and implementation audits exclude completed commits' metadata: kinds,
scopes, capability tags, model records, severity, reach and complexity labels.
This includes commits named as audit targets. Naming one selects its code
changes, not its metadata. Incorrect labels create no finding, correction,
reporting, deferral or follow-up duty. Correcting them adds work without
improving the code being judged.

Keep targeted history reads for a decision's reason, a code defect's cause or a
user's ruling. A behavioural claim that exposes a live defect still informs the
review. Instructions and checks for new records stay intact, as does the
watch's use of old labels as evidence.

Investigating recurring metadata errors requires a separate, explicitly
authorised plan. It may improve future records but never repair completed
commits. It creates no prerequisite or interruption for unrelated work.

## Judging deviations

An implementation audit is not a strict conformance audit. Judge the shipped
code first. It must be correct and meet the repository's quality standards. A
departure that responds to a real plan error is correct behaviour. Record it
as deviated in the coverage table, not as a finding, when the code is right.

A missing departure reason is a finding only when it leaves a live instruction
misleading or an important constraint unexplained. State that concrete
maintenance problem and repair its live owner without rewriting old commits.
Read targeted history when intent matters. Code that faithfully followed a
defective plan into a defect is still a finding. Do not reopen a settled
decision on taste; require correctness or quality evidence.

## Head drift

Vet, rebuttal and fix compare each audited head in the report opening with the
current short HEAD in that repo. Check each repo independently when the report
judges both. When a head differs, list the files changed since the audited head
and inspect the intervening diff for the artifact and every source a finding or
verdict relies on.

Judge against current HEAD even when the tree moved. A quotation mismatch
explained by that diff is a claim about earlier text, not a grounding failure.
Each phase owns its response when current text changes or resolves a finding.

## Vet checks

The vet is read-only and lands nothing. It runs no command that changes a
tracked file, including formatters. Its verdicts inform reconciliation;
corrections belong to the phase that completes the round. This separation keeps
the independent check from applying its own proposals.

Never vet a report whose writer tag names the same assistant. The vet checks
findings from a fresh context in the other assistant. Continue only when the
user explicitly says to.

Check the trade under [Finding explanations](#finding-explanations). The prose
may carry the whole explanation. Verify the simpler mechanism, cost, benefit
and any claim that the choice is settled against their sources. Return Revise
for missing substance, not for missing labels or separate parts. When the
correction is the simplest mechanism, verify that claim and its cited boundary
or decision. Reopen a plan decision only with evidence that it is wrong.

Check the finding's rarity against its cited evidence. A choice about cost that
is real under [Real choices](#real-choices) goes to the user's ruling; the vet
never settles it. When that section settles the choice, the verdict carries the
winning option as the correction.

## Real choices

A choice about cost goes to the user only when it is real. Weigh every option
on each cost the evidence shows: build and upkeep, what people using or
developing the app meet and other material risk such as a provider charge.
Doing nothing counts as an option. An option that breaks a boundary drops out.
Check every cost against its sources first. A cost identical in all options
does not count.

The choice is settled in two cases:

1. One option is at least as good as every other on every cost. Unclear
   evidence rules this case out.
2. The finding's reach is rare or very-rare. The option with the least upkeep
   wins under [Reach and complexity](#reach-and-complexity). Doing nothing and
   changing only wording count as options. On equal upkeep, the option better
   for people using the app wins. Waiting for a ruling on a rare case costs
   more than its answer is worth.
3. The costlier option's only advantage is a guard against a mistake no round
   has found. Such a guard buys nothing the evidence shows, so the option with
   the least upkeep wins. A crumb of yield does not make a choice real.

The winning option becomes the finding's correction. Any other choice is real.
A boundary entry or recorded user decision can still settle a real choice.

Every phase that grounds the item applies this test. The vet applies it before
referring an item, the rebuttal when answering a referral and the fix during
reconciliation. A referral is a claim like any other verdict and a later phase
overturns it on evidence. A ruling on a settled choice costs the user a reading
and a resumed fix but decides nothing.

## Vet verdicts

Return one verdict per finding in report order. The
[vet twin grammar](round-grammar.md#vet-twin) owns the line shape, accepted
words, numbering and wrong-phase refusal.

- **Accept** keeps the finding as written.
- **Revise** keeps the defect and states the corrected tier, evidence or
  correction in a few short sentences.
- **Drop** states why the finding does not stand.
- **Needs user's ruling** identifies a real choice or supported decision change
  that the vet cannot settle.

Put head-drift notes before the first verdict. Free text explains a verdict but
never changes its kind. Return the complete twin in the final response. The
runner saves an unattended twin at its supplied path; a hand-run vet writes the
same text to its resolved path. Chat and file must not differ.

## Rebuttal grounding

Read the report end to end, then the supplied vet twin. Follow
[Head drift](#head-drift) and say where a moved file changes an answer.

Carry accepts forward without fresh source reads or individual answers. For
revisions, drops and ruling items, read the source the verdict rests on
yourself: the named file, its covering test, the plan decision or boundary and
the episode's commit bodies where the vet calls a departure unrecorded. Do not
trust the report's or vet's quotation. Read `../plan/BOUNDARIES.md` and
`../plan/GROWTH-PATTERNS.md` when a verdict invokes them.

## Rebuttal answers

Answer only revised, dropped and referred findings in report order. Accepts
need no entry. The
[rebuttal twin grammar](round-grammar.md#rebuttal-twin) owns the line shape,
accepted words, numbering and wrong-phase refusal. The answer keeps the
report's tier even when it agrees with a revised tier; the note names the new
tier and the fix records it.

- **Agree** keeps the verdict. Agreement with a revision carries the revised
  correction in full so the fix has one text to apply. Agreement with a drop
  needs no explanation unless another note helps the fix.
- **Contest** says what the vet misread. Quote the evidence, name its file and
  line or plan section and state what the verdict should have been. Contest
  only on evidence the vet can read. A disagreement of taste is agreement with
  a note. Contest a referred choice when [Real choices](#real-choices) settles
  it, naming the winner and the evidence for every cost.
- **For user's ruling** keeps a real choice or recorded-decision question open.
  State the auditor's position and evidence briefly and never settle it here.

Return the complete answers without a grouped closing list. The runner saves an
unattended twin at its supplied path; a hand-run rebuttal writes the same text
to its resolved path. Chat and file must not differ.

## Reconciliation

Build the outcome from the numbered vet verdicts and rebuttal answers,
accounting for every finding. An accept stands without a rebuttal answer.
Present agreed verdicts, decisions on contested verdicts and items for the
user's ruling. For each contest, read the evidence, decide the outcome and give
the reason. Ask the user only when evidence leaves the answer unclear.
Disagreement alone needs no ruling. Never re-argue an agreed verdict.

When every verdict is Accept and no rebuttal exists, present the findings as
agreed by both assistants. When the vet has a revision, drop or ruling item and
no rebuttal exists, the fix answers those items from current evidence. Carry
accepts without answering them. Without a twin, present the report findings in
number order with any current-source drift correction.

The user rules by exception: a go on the presented outcome accepts it, and a
reservation reopens the named item. Ground a reopened item before answering it.

A real cost choice needs its own answer even when the round is otherwise
accepted. Apply [Real choices](#real-choices) before presenting it. A settled
choice is presented like a decided verdict. When the user picks the simpler
mechanism, that becomes the finding's correction. When the ruling changes a
plan reason, carry the correction and reason as a cross-repo finding so it is
applied or deferred without re-derivation. When the user keeps the machinery,
the record carries the ruling and reason.

A cross-repo finding left open by the report goes to the user here. Carry the
answer and reason in the deferral, or keep the choice open when the user does
not rule. Never choose for them.

The route's approval rule grants the settled corrections. Planning uses the
[planning round completion rules](../../../plan/.agents/references/planning-rules.md#round-completion);
implementation uses its fix invocation's grant. Stop for a ruling only on:

- a real choice sent to the user
- a contested verdict whose evidence stays unclear
- a drift correction that changes a finding
- a verdict without a rebuttal that the fix cannot settle from evidence

When nothing is open, state one outcome per finding and apply it. An undirected
cross-repo choice outside the judged set does not block the fix. Keep it open in
the deferral and apply the settled findings.

## Audit reports

The [round grammar](round-grammar.md#audit-report) owns report openings,
judged-repo lines, finding fields, location admission, numbering and empty
sentences. The workflow owns the evidence placed before those fields, such as
coverage and current-shape advice.

Planning reports put excess before missing. An accepted removal can make a gap
inside the removed area irrelevant, so the user decides what can go before
reading what to add. Each empty field is a checked verdict, never an omission.
Implementation reports keep local and cross-repo findings in one field because
the judged repo set and location table already identify their owners.

A report contains only the parts its workflow and grammar require. A planned
edit no finding asks for joins the opening so the vet can check it. Material for
the next round goes in the handoff. A finding dropped under the route's own
rules stays out of both.

The coverage table says what an implementation round inspected and an empty
finding field says those checks passed. Do not also list passed checks, files
read or verified claims. Evidence appears only inside the finding it supports.
Chat carries nothing about the judged work that the report or handoff does not.
Setup and tooling problems are not about the judged work and stay in chat.

An unattended audit returns the complete report under
[Runner result](#runner-result); the runner saves it at its supplied path. A
hand-run audit presents the report and writes identical text to the resolved
path. The
[runner documentation](../../tools/audit-round/CLAUDE.md#phase-routing) owns
path resolution and argument order. With no findings, follow
[Direct clean completion](#direct-clean-completion).

## Direct clean completion

An audit with no findings completes without vet, rebuttal, fix, brief, glance
or watch. An automatic series still runs its judge. This route avoids a fresh
fix session whose only work would be an empty record.

For an unattended plan target, return the complete report under
[Runner result](#runner-result). The runner retains it and lands the clean
record. For a hand-run plan target, write and present the report, land the
clean record immediately and delete that round's reports through the runner
command. A commit target lands no clean record and retains its report.

Use the plan doctrine's
[record meanings and placement](../../../plan/CLAUDE.md#shared-implementation-forms)
and
[planning clean-record mandate](../../../plan/CLAUDE.md#commit-message-convention).
Those rules grant the empty record without separate permission. The subject
follows the [subject grammar](subject-grammar.md) with the auditing session's
capability tag and model record. The plan doctrine's
[Handoff](../../../plan/CLAUDE.md#handoff) owns the handoff exception. A round
made clean through reconciliation follows ordinary fix completion.

## Implementation settlement

An implementation round is whole-plan when its range starts at step 1 and ends
at the current implementation plan's last step. A plan that gains a step makes
an earlier whole-plan round partial. Settlement is whole-plan rounds on the
finished code whose severity has stabilised at C or below with no new A, each
coverage table classifying every row. A clean round is not required. Prior
audit commits inform those rounds and name fixes to re-verify but never excuse
a row from inspection.

The watch judges convergence and repeated structural growth; the user owns
settlement. The final whole-plan round expects an `implemented` marker in every
repo that hosts a listed step, newer than that repo's newest hosted step. When a
marker is missing or stale, name it once and continue on the user's word. Later
rounds do not wait for it.

Loop-close asks before archiving unless either repo holds a whole-plan
implementation-audit record newer than the plan's latest step commit. It
continues only on the user's answer when that record is absent, because close
is the last point where a missing audit can still be noticed.

Loop-close follows on the user's word through the
[loop-close workflow](../../../plan/.agents/skills/close/references/workflow.md).
That workflow writes each repo's closing form under the plan doctrine. Stem
scans already show every round, so no compiled history belongs in a closing
body. Commit-scoped rounds use their own one-shot settlement rule.

## Runner result

When the prompt identifies an unattended phase, follow this rule for every
ending, including an early stop. It is shared by audit, vet, rebuttal, fix,
brief, watch, judge and close. Ordinary interactive invocations add no result
line.

The [phase-result grammar](round-grammar.md#phase-result) owns the final control
line, exact JSON object, statuses and phase admission. Keep that line outside a
code fence and make it the last line of the response. Audit, vet and rebuttal
return their complete document before it and write no file; the runner saves
that text without the control line.

- `finished` means the phase completed all required work.
- `needs-ruling` means the fix wrote the final ruling for an open decision. The
  runner checks and displays it, collects the user's reply and resumes the same
  fix session. No other phase can return this status.
- `failed` means required work remains incomplete. Give a short non-empty
  reason.

Each phase judges its own outcome. A clean audit finishes. A vet that accepts
every finding finishes and needs no rebuttal. A permission refusal, missing
input, failed required write or unmet workflow gate means failed even when the
assistant can end its turn normally. A successful permitted retry counts as
success when all required work is complete. Judge what remains blocked, not
whether an earlier tool call failed.

The result grants no permission to bypass a gate or make the user's decision.
Workflows own the outcome; the runner validates parsed documents and landed
subjects without judging tool failures.

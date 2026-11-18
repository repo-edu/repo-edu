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

A file-changing Repo Edu commit grades every concern it closes, D included and
off-plan work included, with the [Finding metadata](#finding-metadata) and the
round grammar's [commit record bullet](round-grammar.md#commit-record-bullet).
The primary area owns supporting documentation too. In a Repo Edu commit, the
implementation tiers grade a concern whether the AI surfaced it formally in a
review or only addressed it in the commit body. Grade each concern against that
rubric in its bullet.

In a Repo Edu commit, `redesign` is the typical conventional kind at tier A,
alongside `refactor`, `feat` and `docs`. `fix` is essentially never tier A: an
A-tier bug fix is a redesign that closes a bug, and commits as `A1` with
`redesign` and the bug named in the sentence.

Explain a graded commit's net change in one untiered decision bullet in its
existing body. Name the obligations added and removed and why one side
outweighs the other. This is the commit-level instance of the account rule in
[Reach and complexity](#reach-and-complexity).

## Finding metadata

Every graded concern carries its finding number and metadata from its audit
report into the round's durable record. The
[round document grammar](round-grammar.md#audit-report) owns the audit report
block and location cases. Its
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
judged repo set into an outside destination.
[Shared implementation forms](#shared-implementation-forms) owns record
placement, directed cross-repo fixes and who follows up.

An implementation audit lands a plan correction without user direction when
implementation history has made text in any section false, one correction is
plainly right and the correction changes no decision's meaning or reason. Stale
text includes a name, path, count, cross-reference or sentence saying which
steps have landed. The fix writes that correction as its own plan-repo commit
under [Shared implementation forms](#shared-implementation-forms). It is not a
deferral. A substantive correction still
defers when the plan repo is outside the judged repo set: changing a decision,
adding a missing rule or row or choosing among sensible corrections needs a
judgement. The plan is the reference the audit judges the implementation
against, so letting the audit rewrite disputed content could make the
implementation pass by moving that reference.

The search-direction value is `excess` for functionality the artifact can shed
or simplify and `missing` for functionality it lacks. Across rounds their
balance shows whether an artifact is still growing or has started to shed.
Commit bullets written before that value existed read as missing, because
excess was not yet a search obligation.

A record bullet that lands an audit report's finding carries that finding's number in the round
grammar's [commit record bullet](round-grammar.md#commit-record-bullet) form. The round data joins
bullet and finding by that number, so the bullet's short title may differ from the audit report's.
Keep titles distinct across the audit report, because the vet and the rebuttal name findings by
them. Each accepted graded concern, D included, gets one numbered bullet. A bullet without a number
records work no finding asked for. A carried decision or trade ruling that is not a finding takes no
tier or metadata.

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
when its correction removes the copies. The tag survives in the audit report
and matching record so a later watch can see a run.

The bar is whether the work could match a pattern, not whether the round has
already proved that it does. A false positive costs one token, or one priced
trade and its ruling when the other risk tokens also fire. A false negative
can hide a run of locally defensible rounds growing machinery no boundary asks
for. The tag is a suspicion, never a verdict, and blocks nothing by itself.

Apply [History reads](#history-reads) to these tags. Each finding prices its own
trade; the watch judges the cross-round signal.

## Coined names

A Repo Edu project term has one defining entry, under the tiers of Repo Edu's
`CLAUDE.md` **Vocabulary**. An audit treats a coined name without an entry, or a
second name for a concept that already has one, as a finding under the ordinary
tiers. A name coined without an entry spreads silently through code, tests,
instructions and plans, and its only repair is a rename plan: unwinding three
such names once took a plan of about 700 lines across more than 50 files.

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

Without the account rule, a size label hides which obligations support the
rating. Case: [`burden-account`](../../../plan/CASES.md#burden-account).

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

The [round grammar](round-grammar.md#audit-report) owns the finding heading,
token order, field order and empty forms. This section owns what the
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

When a plan rule reads records that already exist, a finding about what that
rule prints or decides states what the rule gives on those records today, read
from them by hand, and whether the finding's case appears in them. A case that
appears in no record is stated as such, and the finding then says why the
records will change. A constructed case without that statement is not evidence
that the rule is wrong. Without this rule, a run of rounds can add and remove a
test on argument alone while the rule gives the same result on every real
record. Case: [`record-reading-findings`](../../../plan/CASES.md#record-reading-findings).

Every premise a correction rests on is one of three kinds. A claim about what a
text says is backed by a quote and its location. A claim about how recorded
work behaves, such as how rounds, models or people act, is backed by records or
code read by hand and named in the finding. A design judgement is stated as a
choice with its reason, and a real choice goes to the user under
[Real choices](#real-choices). A behaviour claim with nothing named behind it
is a conjecture, whatever its wording. A finding borrows no tier from a
conjecture: strip the premise and grade what the evidence still carries. When a
correction removes or contradicts evidence the artifact already holds, the
finding states what that evidence says and why the correction wins against it.
The record-reading rule above is the case where the records sit in the
repository.

Without this rule a conjecture written as a fact passes the quote check,
because there is no quote to test. Case: [`premise-kinds`](../../../plan/CASES.md#premise-kinds).

At tiers A to C, explain the trade when the growth-pattern value is not `none`,
reach is not `ordinary` and complexity is an increase. State the simplest
mechanism that works within `../plan/BOUNDARIES.md`, what the proposed machinery
costs to build and own, what it gives the user over that mechanism and whether a
boundary entry or user decision settles the choice. Deletion or doing nothing
counts when either is enough. Name concrete obligations and their interactions
rather than repeating the rating.

Keep the trade in the finding's explanation. A separate block is optional.
When the correction is the simplest mechanism, one sentence naming the
boundary or decision that settles it is enough. D findings need no trade
explanation.

Check the simpler mechanism against the plan's recorded reasons and the code.
When a reason still rules it out, say why no simpler mechanism works. When the
reason looks wrong, quote it and give the evidence against it. A plan can
settle whether a mechanism works. Only a boundary entry or user decision
settles a real choice about whether machinery is worth its cost. A choice that
stays real under [Real choices](#real-choices) goes to the user under
[Reconciliation](#reconciliation).

Without the trade rule the risk tags flag a trade nobody prices.
Case: [`trade-explanation`](../../../plan/CASES.md#trade-explanation).

## Mechanism cases

When a round proposes either of these mechanisms, record its case before the
mechanism enters:

- A plan guard: code whose only purpose is to detect a situation and change how
  it ends, whoever meets the refusal: a person using the product or a developer
  running a check. The rule the code enforces may be an integrity rule that
  other decisions depend on. That rule needs no case. The code that enforces it
  is still a guard and records one.
- A mechanical doctrine rule: a new required record, check or gate that the AI
  applies on its own. Advice that leaves judgment with the round is not a
  mechanical rule.

A mechanism the user directs needs no case: the user named it and has judged its cost. A mechanism
the AI proposed and the user accepted is not directed, however short the acceptance. The case stays
the proposer's burden and lands in the record that lands the mechanism, the plan decision or the
commit body. Without this line, a chat proposal accepted in one word carried a write ceiling into a
ready plan past the case, and the round that then read the plan sized the ceiling instead of pricing
it (failure entry
[`accepted-proposal-without-case`](../../../plan/FAILURES.md#accepted-proposal-without-case)).

Rule text in both repos, `CLAUDE.md` files included, states each decision and
its reason, never who directed it or when. The commit that adds a rule records
its origin. A phase that needs the origin, for example to tell whether a rule
needs a case, reads it from Git under [History reads](#history-reads).
Repeated examples do not create requirements.

The case answers five questions: what triggers the mechanism, how often that
trigger is expected, what goes wrong without it, why accepting that outcome was
rejected and what the mechanism charges each time it applies, including how
often that charge is paid. Accepting the outcome, with its bound, is the default
answer. A plan guard records the case in its **Decisions** paragraph and counts
implementation cost, runtime cost and the audit and reading cost of the record.
A doctrine rule records the case as an entry of the case record, the plan
repo's [`CASES.md`](../../../plan/CASES.md), names that entry by its label beside
the rule and counts the audit surfaces it adds, the findings and extra rounds those surfaces
can draw, and the user's reading and ruling time. AI writing time is not part of
either cost.

Without the case, a reflex rule can impose a standing cost that stays hidden
until a later audit finds it. Case: [`mechanism-cases`](../../../plan/CASES.md#mechanism-cases).

One further rule governs how any ruling reaches the user. A round that asks the user to rule prices
the question first: the request states how rare the defended event is, what the mechanism costs to
build and own, what the cheapest alternative is and what the user notices in each case. An unpriced
ruling request is not ready to be asked: an unpriced boundary ruling once let a costly mechanism
stand (failure entry
[`unpriced-session-exit-ruling`](../../../plan/FAILURES.md#unpriced-session-exit-ruling)).

## History reads

Cross-round scans belong to the automatic-series decision, glance and watch. Other phases read
history when needed to establish a specific finding, prior ruling, a rule's
origin or an implementation departure. Lifecycle, scope discovery and handoff
lookups remain required. This keeps current-work review separate from series
and trajectory judgement without withholding the evidence a finding needs.

[Handoff](#handoff) owns the handoff for both round kinds. The phase landing the record writes it.
The next audit reads it under that section's read gate.

## Handoff

`<stem>-handoff.<sha>.md` is the ephemeral round-to-round handoff. It lives
with the other round files in `plan-evidence/active/`, never in the plan repo.
The name keeps the `<stem>` of the plan the chain refines, so one topic search
surfaces every sidecar of a project. The `<sha>` is the first six characters of
the commit the handoff describes, normally the writing round's fix commit, or
the current `HEAD` when the round lands nothing. Six is fixed, so every name has
the same shape; where git widens an abbreviation to disambiguate, the name
truncates back to six. The SHA sits after the dot so the stem and file kind stay
together. The name carries no writer tag and uses the described commit's SHA
rather than the runner's round key. The name carries the ancestry gate: a round
resolves which handoffs stand on the current chain from
`git merge-base --is-ancestor <sha> HEAD` per listed file.

- Content: what the round did, considered and rejected, what to look at first,
  plus findings deferred as out of scope, blocked or a deliberate non-fix; the
  round-to-round briefing not visible in the artifact or the git log. Its first
  line names the stem of the artifact it briefs, as context rather than as the
  identifier.
- Read: the handoff whose commit is an ancestor of HEAD or is HEAD itself, the
  most recent where several qualify; absence is the normal case, not an error.
  Ancestry rather than equality, so a commit landing between the writing and the
  reading round does not strand the handoff. A handoff whose commit is not an
  ancestor of HEAD belongs to a paused chain and is left alone.
- Write: after the round commit lands, or against the current `HEAD` when the
  round lands nothing; never a constant filename, so the next round can tell
  whether the handoff matches the chain it stands on.
- Keep: a handoff is never deleted. It stays in `plan-evidence/active/` until
  loop-close moves it with the plan's other round files into
  `plan-evidence/<stem>/`. The read gate already leaves an older, paused or
  orphaned handoff alone, so a kept handoff changes no read. The reason is its
  content: what the round considered and rejected is not visible in the
  artifact or the git log, and keeping it also removes a duty from every round.

An audit that reports no findings leaves every existing handoff untouched and
writes none. A round that reaches a clean record after vetting or discussion
follows the ordinary handoff rules above. The shared planning rules'
[Round completion](../../../plan/.agents/references/planning-rules.md#round-completion)
own the planning clean-record mandate;
[Direct clean completion](#direct-clean-completion) owns how the runner finishes
such an audit.

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

Vet, rebuttal, ruler and fix compare each audited head in the audit report opening with the
current short HEAD in that repo. Check each repo independently when the audit
report judges both. When a head differs, list the files changed since the audited head
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

Every vetter of the round's panel checks the findings from a fresh context, whichever assistant
wrote the audit report. It reads the audit report and its sources, never another vetter's vet
report, so each verdict stays independent.

Whether a finding is a good idea is not an axis: a finding can be appealing and
still unauthorised. A finding that changes what a plan holds is the exception,
under the shared planning rules'
[The vet's check](../../../plan/.agents/references/planning-rules.md#the-vets-check).

Check the trade under [Finding explanations](#finding-explanations). The prose
may carry the whole explanation. Verify the simpler mechanism, cost, benefit
and any claim that the choice is settled against their sources. Return Revise
for missing substance, not for missing labels or separate parts. When the
correction is the simplest mechanism, verify that claim and its cited boundary
or decision. A finding that changes what a plan holds follows the shared
planning rules'
[Changes to what a plan holds](../../../plan/.agents/references/planning-rules.md#changes-to-what-a-plan-holds).

Check the finding's rarity against its cited evidence. A choice about cost that
is real under [Real choices](#real-choices) goes to the user's ruling; the vet
never settles it. When that section settles the choice, the verdict carries the
winning option as the correction.

## Real choices

A choice about cost goes to the user only when it is real. Weigh every option
on each cost the evidence shows: build and upkeep, what people using or
developing the app meet and other material risk such as a provider charge.
Weigh what each option gives those people beside its costs: an option that
takes away what another gives is worse on that line. Doing nothing counts as an
option. An option that breaks a boundary drops out.
Check every cost against its sources first. A cost identical in all options
does not count.

The choice is settled in three cases:

1. One option is at least as good as every other on every cost and on what it
   gives. Unclear evidence rules this case out.
2. The finding's reach is rare or very-rare. The option with the least upkeep
   wins under [Reach and complexity](#reach-and-complexity). Doing nothing and
   changing only wording count as options. On equal upkeep, the option better
   for people using the app wins. Waiting for a ruling on a rare case costs
   more than its answer is worth.
3. The costlier option's only advantage is a guard against a mistake no round
   has found. Such a guard buys nothing the evidence shows, so the option with
   the least upkeep wins. A crumb of yield does not make a choice real.

The winning option becomes the finding's correction. Any other choice is real.
A boundary entry or user decision can still settle a real choice.

Every phase that grounds the item applies this test. The vet applies it before referring an item,
the rebuttal when answering a referral, the ruler before it names a winner and the fix during
reconciliation. A referral is a claim like any other verdict and a later phase overturns it on
evidence. A ruling on a settled choice costs the user a reading and a resumed fix but decides
nothing.

A serious contest or split named in the fix phase's `contests` argument is the
exception. It stays in the ruling even when this test settles the choice,
because the runner still requires the user's winner. The settled option becomes
the fix's recommendation.

## Vet verdicts

Return one verdict per finding in audit report order.
The [vet report grammar](round-grammar.md#vet-report) owns the line shape, accepted
words, numbering and wrong-phase refusal.

- **Accept** keeps the finding as written. It may carry a note that the fix
  reads and the rebuttal need not answer.
- **Revise** means the fix should land something else: the vetter's correction,
  or its change to the defect's scope, evidence or tier, changes what the fix
  lands. State the corrected tier, evidence or correction in a few short
  sentences.
- **Drop** states why the finding does not stand.
- **Needs user's ruling** identifies a real choice or supported decision change
  that the vetter cannot settle.

A change that leaves the landed result the same, such as clearer wording or an extra source, is an
Accept with a note. A Revise is the vetter's claim about what should land, and the split rule under
[Reconciliation](#reconciliation) tests that claim against the other vetters of the panel. Wording
advice written as a Revise would read as a disagreement about what lands.

Free text explains a verdict but never changes its kind. Return the complete vet
report in the final response.

## Rebuttal grounding

Read the audit report end to end, then every supplied vet report. Follow
[Head drift](#head-drift) and say where a moved file changes an answer.

Carry accepts forward without fresh source reads or individual answers. For
revisions, drops and ruling items, read the source the verdict rests on
yourself: the named file, its covering test, the plan decision or boundary and
the episode's commit bodies where the vetter calls a departure unrecorded. Do not
trust the audit report's or vet report's quotation. Read `../plan/BOUNDARIES.md` and
`../plan/GROWTH-PATTERNS.md` when a verdict invokes them.

## Rebuttal answers

Answer every revise, drop and ruling verdict of each vetter, in audit report order and, within one
finding, in the order the runner supplies the vet reports. Accepts need no entry. One rebuttal
answers the whole panel, so its answers to different vetters on one finding stay consistent. The
[rebuttal report grammar](round-grammar.md#rebuttal-report) owns the line shape, accepted words,
numbering and wrong-phase refusal, including the vetter each answer names. When an answer agrees
with a revised tier, its note names the new tier and the fix records it.

- **Agree** keeps the verdict. Agreement with a revision carries the revised
  correction in full so the fix has one text to apply. Agreement with a drop
  needs no explanation unless another note helps the fix. Agreement with two
  vetters' revisions of one finding leaves the choice between them to the fix.
- **Contest** says what the vetter misread. Quote the evidence, name its file and
  line or plan section and state what the verdict should have been. Contest
  only on evidence the vetter can read. A disagreement of taste is agreement with
  a note. Contest a referred choice when [Real choices](#real-choices) settles
  it, naming the winner and the evidence for every cost.
- **For user's ruling** keeps a real choice or plan-decision question open.
  State the audit report's position and evidence briefly and never settle it here.

Return the complete answers without a grouped closing list.

## Ruler duties

The ruler names the winner of each contest or split that
[Reconciliation](#reconciliation) gives it. It runs after the rebuttal and before the fix, in a
session that wrote none of the round's reports and applies none of its corrections. It is read-only
and lands nothing; it runs no command that changes a tracked file. It reads the audit report, every
vet report and the rebuttal report, follows [Head drift](#head-drift) and works each finding it was
given in the [Reading order](../skills/fix/references/ruling.md#reading-order) of `ruling.md`. The
[ruler report grammar](round-grammar.md#ruler-report) owns the report's form. Three duties are the
ruler's own:

1. **Open each source by the name the report gives it.** The ruler report grammar's source line
   fixes that name. Open each source with a tool call that holds the name as typed: a file read by
   its absolute path, or a command that holds the path or the six characters. A file the runner
   supplied whole in the first prompt is open already. A read that names a file relative to a repo
   or to an earlier `cd` does not count; read the file again by its absolute path.
2. **Name the winner in the winner words.** Each entry names `report`, one or more vetter tags or
   `neither`, with a one-line reason. A winner that names vetter tags means those vetters' verdicts
   were right. `Not yet` is no ruler word, because the ruler asks no question.
3. **Keep to the limit of [Real choices](#real-choices).** Name the winner the evidence supports.
   When a real choice remains, do not choose: name the vetter that referred the finding, or
   `neither`, and say in the reason that a real choice remains. The fix then stops for the user
   under its own rule. A change to a fixed input stays a premise error for the user.

The runner checks each named source against the tool lines it logged for the ruler's session and
the files it supplied whole in the first prompt. The check is a plain text test, so the form is
fixed. A file read logs its absolute path, while a shell command logs its text as typed, often
relative to a folder an earlier `cd` chose. Both repos also hold files with the same relative path,
so a relative name could pass for a file the ruler never opened. When a source fails, the runner
sends the ruler back once to open what it missed; a second miss fails the round. Return the
complete ruler report under [Runner result](#runner-result).

Without this rule, a ruler can fill its record from the quotations in the reports, and the winner
lands on text nobody opened. Case:
[`ruler-source-check`](../../../plan/CASES.md#ruler-source-check).

## Reconciliation

Build the outcome from every vetter's numbered verdicts, the rebuttal's
answers and the ruler's winners, accounting for every finding. An accept stands without a rebuttal
answer. Present agreed verdicts, decisions on contested verdicts and items for
the user's ruling.

Every contest and every split gets a winner from a judge that is no party to
it. One rule names the judge, in every round and in both work classes:

1. A contest is the rebuttal contesting one vetter's verdict.
2. Two vetters of the panel split on a finding when their verdict words differ, or when both revise
   and the rebuttal does not agree with both. Two vetters that both write `Needs user's ruling` do
   not split, because both already send the finding to the user.
3. A contest or split is serious when the audit report or a vetter graded its finding A or B. The
   user names the winner of every serious contest and split.
4. The ruler names the winner of every other contest and split, on a C or D finding, under
   [Ruler duties](#ruler-duties). It runs before the fix. In a round that also holds a serious
   contest or split, the user then rules on the A and B findings only.

The grade is the highest any side gave, so one side alone cannot lower a finding out of the user's
reach. A split needs a judge because the rebuttal agrees easily, so its agreement cannot say which
vetter was right. A contest needs one because the fix applies the corrections and the rebuttal
answers for the audit report, so neither judges a dispute fairly. Two revisions the rebuttal agrees
with are no split: both vetters and the rebuttal then hold that the audit report's correction was
wrong, and only the choice of the new correction is left. The fix makes that choice from the
evidence and gives its reason, as it does for any two different changes the rebuttal agrees with.

The ruling states each vetter's position and the rebuttal's answers, with the
evidence for each, before any recommendation. The fix applies every winner
without deciding it again, whoever named it, and never picks a side in a
contest or split itself. A winner that names vetter tags applies those vetters'
verdicts. Never re-argue an agreed verdict.

The runner passes every contest and split to the fix: the ruler's with their
winners and reasons on the first call and the serious ones by number. After
displaying the ruling it asks the user for one answer on each serious finding:

1. `report`: the audit report's finding stands as written.
2. One or more vetter tags: those vetters' verdicts were right, and the fix applies
   them.
3. `neither`: no side was right, such as when a third correction holds.
4. `not yet`: the user first wants an answer from the fix.

The first three answers need a one-line reason and are retained on the finding.
The runner refuses a tag outside the round's panel, because a stored winner
must name a verdict on the finding. `Not yet` leaves that finding open so the
resumed fix can answer the user's question. A resumed fix receives every
recorded winner and reason with the free reply. The free reply may be empty
once every serious finding has a winner.

When every verdict is Accept and no rebuttal exists, present the findings as agreed by the auditor
and every vetter.

The user rules by exception: a go on the presented outcome accepts it, and a
reservation reopens the named item. Ground a reopened item before answering it.

A real cost choice needs its own answer even when the round is otherwise
accepted. Apply [Real choices](#real-choices) before presenting it. A settled
choice is presented like a decided verdict. When the user picks the simpler
mechanism, that becomes the finding's correction. When the ruling changes a
plan reason, carry the correction and reason as a cross-repo finding so it is
applied or deferred without re-derivation. When the user keeps the machinery,
the record carries the ruling and reason.

A cross-repo finding left open by the audit report goes to the user here. Carry the
answer and reason in the deferral, or keep the choice open when the user does
not rule. Never choose for them.

The route's approval rule grants the settled corrections. Planning uses the
[planning round completion rules](../../../plan/.agents/references/planning-rules.md#round-completion);
implementation uses its fix invocation's grant. Stop for a ruling only on:

- a real choice sent to the user
- a serious contest or split
- a drift correction that changes a finding

When nothing is open, state one outcome per finding and apply it. An undirected
cross-repo choice outside the judged repo set does not block the fix. Keep it open in
the deferral and apply the settled findings.

## Audit reports

The [round grammar](round-grammar.md#audit-report) owns audit report openings,
target lines, judged-repo lines, finding fields, location admission, numbering
and empty sentences. The workflow owns the evidence placed before those fields,
such as coverage and current-shape advice.

Planning audit reports put excess before missing. An accepted removal can make a gap
inside the removed area irrelevant, so the user decides what can go before
reading what to add. Each empty field is a checked verdict, never an omission.
Implementation audit reports keep local and cross-repo findings in one field because
the judged repo set and location table already identify their owners.

An audit report contains only the parts its workflow and grammar require. A planned
edit no finding asks for joins the opening so the vet can check it. Material for
the next round goes in the handoff. A finding dropped under the route's own
rules stays out of both.

The coverage table says what an implementation round inspected and an empty
finding field says those checks passed. Do not also list passed checks, files
read or verified claims. Evidence appears only inside the finding it supports.
Chat carries nothing about the judged work that the audit report or handoff does not.
Setup and tooling problems are not about the judged work and stay in chat.

An audit returns the complete audit report under [Runner result](#runner-result). The
[runner documentation](../../tools/audit-round/CLAUDE.md#phase-routing) owns path resolution and
argument order. With no findings, follow
[Direct clean completion](#direct-clean-completion).

## Direct clean completion

An audit with no findings completes without vet, rebuttal, fix, glance or
watch. An automatic series still applies its fixed decision rules. This route avoids a fresh
fix session whose only work would be an empty record.

Return the complete audit report under [Runner result](#runner-result). The
runner retains it and lands the clean record, for a plan target and a commit
target alike, so the log shows that the audit ran. It keeps the audit report,
because a round's files stay in the evidence repo.

Use the
[record meanings and placement](#shared-implementation-forms) and the shared
planning rules'
[planning clean-record mandate](../../../plan/.agents/references/planning-rules.md#round-completion).
Those rules grant the empty record without separate permission. The subject
follows the [subject grammar](subject-grammar.md) with the auditing session's
capability tag and model record. [Handoff](#handoff) owns the handoff
exception. A round
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
That workflow writes each repo's closing form under
[Shared implementation forms](#shared-implementation-forms). Stem
scans already show every round, so no compiled history belongs in a closing
body. Commit-scoped rounds use their own series settlement rule.

## Shared implementation forms

This section owns what the `<stem>/` forms used for plan-related implementation
work record in both repos. A stem is the current plan filename without `.md` and
without any `-widen` postfix. The [subject grammar](subject-grammar.md) owns
the shape of every implementation subject: role spellings, scope forms and slot
order. Repo Edu's
[Commit Capability Tag](../../CLAUDE.md#commit-capability-tag) and
[Commit Model Record](../../CLAUDE.md#commit-model-record) own attribution. The
runner's [Round files](../../tools/audit-round/CLAUDE.md#round-files) rules own
audit report filenames; a subject scope and an audit report filename need not
have the same spelling.

A step commit has no severity segment. A severity sequence measures a round:
the graded findings an audit surfaced. A step lands planned work as designed,
so a grade on it can only restate the plan rounds that decided the work or the
kind in its postfix, and a run of steps at the plan's tier would read in the
trajectory as the same maximum repeating.

Two roles change files. `impl-<n>` lands one plan step, always a single step per
commit, and carries a conventional kind and no severity sequence. Its opening
model record names the reported model, launched effort and active
implementation time. A step hosted in both repos splits that time at its first
commit, so its two records do not count work twice.
`impl-audit-<step scope>` with a severity sequence and a conventional kind lands
an implementation-audit fix. The subject grammar requires the conventional kind
on fix commits. The watch workflow owns how it reads these records as trajectory
evidence.

Empty records and markers carry no conventional kind:

- `impl-audit-<step scope>` with a severity sequence and no kind records an
  implementation-audit round that accepts only findings deferred to the other
  repo and changes no file in its own repo. Its body carries those deferrals
  until a later destination-repo round cites and applies them.
- `impl-audit-<step scope>` with `clean` in the sequence's place records a clean
  implementation-audit round. It lands once per round, in the sole judged repo
  or in Repo Edu when both repos were judged. The round grammar's
  [audit report](round-grammar.md#audit-report) identifies the judged repo set.
  A repo whose files took no finding gets no record from a round that found
  some elsewhere, so a both-repo round with findings in one repo lands one
  record, and the peer repo's trajectory reads that record through the judged
  repos' walks. A declined round lands no commit because disagreement is not a
  state. A clean commit audit's record, its series label and `commit-audit`
  role with `clean`, lands by the same rule, so one rule places every clean
  record.
- `implemented` records that every implementation step its repo hosts has
  landed; its subject names that share, and a plan with steps in both repos
  carries one marker per repo. The implementation request authorises the
  marker without further approval. The runner writes it after Git proves every
  hosted share landed and required verification passes. It uses the assigned
  coder's resolved release and effort for the marker's capability tag and
  model record. The current marker must be newer than that
  repo's latest hosted step; a later hosted step makes an older marker stale.
  Working-tree and index changes never block the marker, including changes to
  files a hosted step touched, because the hosted step commits alone determine
  whether implementation landed. The marker is an empty commit and includes no
  concurrent work.
- `closed` records that its repo's implementation-audit rounds have settled. It
  is that repo's closing commit and is written on the user's word.

An extra empty record would read as convergence evidence for files the round
did not re-test.

Plan identity, role, auditor, step numbers and step scope live only in the
subject. No `Plan:`, manual `Step:` or `Audit:` body lines repeat them. A
plan-related commit carries a stem prefix only when it is a step, an
implementation-audit round or a marker. Off-plan rework keeps the repo's
ordinary conventional subject and enters the watch through the files it touches.

Implementation records are keyed to the repo that hosts their changed files,
never to a plan kind. A step commit lands in the repo whose files it changes; a
step changing files in both repos lands one independent commit in each. An
implementation-audit round's records follow the same keying: its fix commits and
deferral records land only in repos whose files took accepted findings; a
clean round follows the single-placement rule above. The implementation audit
workflow derives the initial judged repo set from the user's step scope. Open
deferrals into Repo Edu add that repo to the set for their named corrections,
without changing the selected step range. Report placement under the runner's
[Report lifecycle](../../tools/audit-round/CLAUDE.md#report-lifecycle)
never changes record keying. Each round may read the other repo as evidence. A
round defers a finding whose fix falls outside its repo set in its own commit
body until a later round cites and applies it. The rule is
direction-free and deferral covers only work nobody directed. A later round
record that applies a deferral cites it by the deferring commit's full commit
ID and the deferral's position, in the round grammar's
[commit record bullet](round-grammar.md#commit-record-bullet) form. The reader
compares both exactly, so one citation cannot close two deferrals whose short
forms and positions match. A graded bullet in the destination repo carries one
citation per deferral its change applies. When a
deferral into Repo Edu is satisfied or dropped without a Repo Edu file change,
the untiered citation bullet sits in whichever judged repo already gets the
round record. No extra Repo Edu record lands for the citation. Deferrals into
the plan repo still close only from plan commits. The open-deferral reader
accepts Repo Edu-bound citations from Repo Edu history and the plan's stem
commits. The citation makes openness a Git fact instead of a judgement from
comparing the deferral with the destination text.
Case: [`deferral-citation`](../../../plan/CASES.md#deferral-citation).

The user may direct such a fix into the running round instead, a plan-file fix
included; a directed plan-file fix lands as its own plan-repo commit in the
round form. A stale-text correction under [Finding metadata](#finding-metadata)
lands as its own plan-repo commit in the round form with the finding's section
location. Each plan-file commit cites the finding it applies; do not also record
that finding as a deferral or an implementation record. A stale-text fix carries
an `applies` citation only when it also applies an earlier deferral.

No write in one repo otherwise triggers or waits on a write in the other. Two
undirected exceptions apply. An implementation-audit fix lands the stale-text
correction above in the plan repo. An automatic implementation series chains one
scoped planning round before its series decision when a deferral into the plan
repo is open. Each round still lands its own record, and a failed or unfinished
planning round leaves the deferral open. Plan records, the plan file, its rounds
and `ready`, stay in the plan repo for every plan. The plan repo's loop-close
move is its one `<stem>/closed` commit, so no second closing marker is written
there.

## Tooling mirrors

The plan repo's [design document](../../../plan/notes/tooling-design.md)
explains the planning and audit tooling's system-wide structure and reasons.
The [user guide](../../apps/docs/src/content/docs/tooling/index.md) explains
each tool's purpose and loop, which commands to use and which decisions are the
user's. Both are mirrors of the AI spec in the doctrine, workflows, launchers
and runner; that spec wins where they disagree. Keep them in sync: a step that
changes a workflow, launcher, shared reference or runner option updates the
affected mirror text in the same step.

## Runner result

When the prompt identifies an unattended phase, follow this rule for every
ending, including an early stop. It is shared by audit, vet, rebuttal, ruler, fix,
implement, watch and close. Ordinary interactive invocations add
no result line.

The [phase-result grammar](round-grammar.md#phase-result) owns the final control
line, its place, exact JSON object, statuses and phase admission. Audit, vet,
rebuttal and ruler return their complete document before it and write no file;
the runner saves that text without the control line.

- `finished` means the phase completed all required work.
- `needs-ruling` means the fix or implementation worker wrote the final ruling
  for an open decision. The runner checks and displays it, collects the user's
  reply and resumes the same session. No other phase can return this status.
- `failed` means required work remains incomplete. Give a short non-empty
  reason.

Each phase judges its own outcome. A clean audit finishes. A vetter that accepts
every finding finishes and needs no rebuttal. A permission refusal, missing
input, failed required write or unmet workflow gate means failed even when the
assistant can end its turn normally. A successful permitted retry counts as
success when all required work is complete. Judge what remains blocked, not
whether an earlier tool call failed.

The result grants no permission to bypass a gate or make the user's decision.
Workflows own the outcome; the runner validates parsed documents and landed
subjects without judging tool failures.

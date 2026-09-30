# Shared round protocol

This reference owns the protocol shared by round phases in Repo Edu and the sibling plan repo: file
names, finding tiers, severity sequences, metadata, report and record formats, runner results,
evidence rules and reconciliation. Read the whole file alongside the phase workflow. Rules labelled
for implementation apply only to implementation rounds. Shared code owns round allocation and file
naming for both entry routes. Read this file from the Repo Edu checkout; plan-repo workflows reach
it at `../repo-edu/.agents/references/round-protocol.md`.

## File names

Round documents and logs use `<target>-<round>-<order>-<kind>.<tag>.<ext>`.
The kind is `round`, `audit`, `vet`, `rebut`, `brief`, `ruling` or `watch`.
Documents use `.md`; the transcript log and standalone brief log use `.log`.
Two files omit the tag: the empty `<target>-<round>-0-claim.md` reserves a
number, and `<stem>-handoff.<sha>.md` briefs the commit it names. The runner
claims at the invoking repository root; a hand-run audit claims there too.
The plan repo's handoff rule owns that six-character sha.

- **Target** names what was audited. A planning-artifact audit uses its bare
  stem, without `.md` or `-widen`. For an archived `plan.md`, use the archive
  folder's name. An implementation audit adds `-step-<n>`, `-steps-<a>-<b>`
  or `-all` to that stem at either report root.
- **Commit targets** preserve the references as typed, replacing `HEAD` with
  its short sha at the start of the round. Keep offsets: `HEAD-4..HEAD` becomes
  `b7ca0b3b-4..b7ca0b3b`. For a list, use its first reference followed by
  `-plus-<n>`, where `n` counts the remaining references. Never take a word
  from a commit subject or name a range with two resolved endpoint shas.
- **Round** is the number allocated by the runner, padded to at least two digits.
  A supplied report path already fixes the target and round.
  Every later phase keeps it exactly, even when another assistant writes the next file. A later
  phase never allocates another round.
- **Tag** names the file's writer under [Writer tags](#writer-tags). The
  transcript and its log use the auditor's tag. All other tagged files use
  their own writer's tag.

The shared `tools/audit-round/src/round-paths.ts` owns the fixed order numbers:

| Order | Kind | Files |
| --- | --- | --- |
| 0 | claim | Empty reservation, no tag |
| 1 | round | Transcript and log |
| 2 | audit | Report |
| 3 | vet | Vet twin |
| 4 | rebut | Rebuttal twin |
| 5 | fix | Reserved, no report |
| 6 | brief | Brief and standalone log |
| 7 | ruling | Ruling |
| 8 | glance | Reserved, no report |
| 9 | watch | Watch |

Skipped phases leave gaps. Every round file lives at the invoking root.

Read a name from the right: remove the extension, three-letter tag, kind and order,
then split the remaining name at its last hyphen into target and round.
The tagless claim and handoff are the two exceptions above. Do not read repo
names or audited heads from a filename; they belong in the report opening.

For example, one round can contain `example-step-2-01-2-audit.otm.md` and
`example-step-2-01-3-vet.abx.md`. Their target and round match; their writer tags
differ. Automated sessions receive complete paths. Manual sessions resolve their
paths through the shared command below.

Old prefix names are neither read nor renamed. The user deletes them.

## Writer tags

Use Repo Edu's `CLAUDE.md`, **Commit Capability Tag** and **Commit Model
Record**, to spell your own model and effort as a full three-letter tag.
The runner's strength table is in `tools/audit-round/settings.json`; a model
outside that table takes `u`. A session takes its own tag, never the tag of
the auditor from an input path. Use the tag's first letter alone when checking
which assistant wrote a file: `a` is Claude and `o` is Codex.

Under the runner, audit, vet, rebuttal and fix read their own selection from
`COMMIT_PHASES`. Other sessions use their current model and effort. Codex desktop
sessions resolve them through [task settings](codex-desktop-settings.md) and
Claude sessions through [session settings](claude-desktop-settings.md).
The automated rebuttal starts fresh with the audit's resolved model and effort,
including any `--auditor` fields. The runner resolves file tags from its
configured phase selections. A hand-run
session resolves its own tag before naming the file it writes. When the effort is missing or
cannot be spelled, stop and name the assistant and phase. For a runner audit,
advise a full `--auditor` tag; for another phase following CLI settings,
advise setting that assistant's effort there, since `--auditor` controls only
the audit and rebuttal.

The runner resolves the tags of every file-writing phase it may invoke before
opening any output. Startup updates and settings discovery write only to the
terminal. The run log begins with the selected models table.

## Later files

The runner names the report and every twin before the audit starts. It supplies
these absolute paths in order:

- audit: report to write, target, scope or commit references
- vet: report to read, vet twin to write
- rebut: report and vet twin to read, rebuttal twin to write
- fix: report, then the vet and rebuttal twins that exist
- brief: transcript to read, brief to write
- watch: watch to write, cache root
- watch-edit: watch to replace

Automated sessions write at the supplied output path without reconstructing a name or
adding an opening writer tag. A standalone brief reuses the transcript's target
and round. Its document and log share `6-brief.<tag>`; the log is opened for
overwrite without another claim. The round transcript and log share
`1-round.<tag>`. The second watch pass replaces the supplied draft.

The fix receives the ruling output path separately from its report arguments.
It writes the final ruling at that path before returning `needs-ruling`, using
the fix writer's tag. A resumed fix receives the same path and the user's reply.

## Manual phases

A manual invocation may name the audit report, or the round transcript for a
brief. If the current conversation identifies that input unambiguously, use it.
Otherwise omit the input when calling `paths` below. The command searches only
the invoking root and selects the sole eligible file without confirmation:

- Vet uses audit reports from the other assistant.
- Rebuttal uses audit reports from the current assistant.
- Fix uses audit reports from either assistant.
- Round brief uses round transcripts from either assistant.

Eligibility uses the filename grammar and the writer tag's vendor letter, not
its model tier or effort. When no file qualifies, ask for the input. When
several qualify, present the candidates and ask which to use. Never choose by
recency. Supplied inputs take precedence over discovery; the phase workflow
still owns its assistant and scope checks.

A hand-run audit runs
`pnpm audit-round name <target> [scope-or-commits...] --auditor <full tag>`
before auditing. It passes its own resolved three-letter tag, including `u` for
an unlisted model. The command claims the next number and prints two absolute
paths, claim then audit report. It creates only the claim and starts no
assistant or settings discovery. It does not name later writers' files.

For later phases, use complete supplied paths when present. Otherwise run the
matching command from the invoking checkout:

| Phase | Command |
| --- | --- |
| Vet | `pnpm audit-round paths vet [report] --writer <own full tag>` |
| Rebuttal | `pnpm audit-round paths rebut [report] --writer <own full tag>` |
| Fix | `pnpm audit-round paths fix [report]` |
| Round brief | `pnpm audit-round paths brief [transcript] --writer <own full tag>` |

Each command prints one JSON array of absolute paths in the phase's argument
order above. Use that array for the ordinary workflow. The command writes
nothing, claims no round and starts no assistant or settings discovery. The
output name retains the input's target and round and uses the writing session's
current tag, even when its model or effort differs from the earlier audit or
the runner's settings.

Review inputs are existing files of the exact same round at the report's root.
The resolver requires a vet for rebuttal and returns whichever review files
exist for fix; the fix workflow decides whether those inputs suffice. If more
than one vet or rebuttal matches, present the candidates and ask which to use,
then pass the selection with `--vet <file>` or `--rebut <file>`. Use those
options too when the user already named a review file. Never run `name` to
continue an existing round.

A manual planning reply in the original audit session uses the same rebuttal
resolution. A manual fix asks for any open ruling in chat; it needs no ruling
output path. `pnpm audit-round brief <transcript>` remains the separate command
that starts a brief session itself. The plan repo's `/brief <plan>` summarises
a plan and is outside this round protocol.

## Closing reports

The runner deletes the audit, vet and rebuttal reports as soon as a fix returns
`finished`. Other outcomes retain them. After a hand-run fix lands its records
or a hand-run audit lands its direct clean record,
`pnpm audit-round close <target>-<round>` at the report's root deletes those
same numbered report kinds for that exact round, regardless of writer tag.
Claims, transcripts, logs, briefs, rulings, watches and other rounds remain.

## Finding tiers

Use the rubric for the work being judged. The same letters carry different
meanings in planning and implementation rounds.

### Planning tiers

- **A**: architectural / scope-changing. Holds when the wrong shape would ship
  silently or cost a session or more of rework. In a widening round, A also
  covers a finding that would lock the wrong shape in: a real alternative that
  displaces the current shape, or a structural flaw that invalidates it.
- **B**: real bug or missing decision in code that must exist to ship the
  user-facing task. Holds when the implementer would ship a wrong but passing
  answer. In a widening round, B is a substantive but fixable issue in the
  shape.
- **C**: detail or clarification of a decision already made. Holds when multiple
  plausible interpretations exist and the implementer would pick wrong,
  subject to the planning C admission rule.
- **D**: wording. Floor.

The plan repo's [shared planning rules](../../../plan/.agents/references/planning-rules.md)
own admission and grading discipline, including the C admission rule.

### Implementation tiers

- `[A]`: Data loss, corruption, a broken core workflow or an architectural flaw
  likely to ship silently or require broad rework.
- `[B]`: A real user-visible bug, reliability issue or unresolved code
  decision that must be settled before shipping.
- `[C]`: A narrow correctness, maintainability or test-coverage issue in a
  non-critical path.
- `[D]`: Wording, style, formatting or low-risk polish.

## Severity sequence

The sequence is a sorted run-length count of graded concerns, with zero
categories omitted, such as `A3B4C4D3`. Plan-repo records use this bare form.
Repo Edu records extend it with the marks below. Steps and markers carry no
graded concerns and no sequence. The hook derives the sequence from the graded
body bullets; leave its slot to the hook.

In Repo Edu, every file-changing commit except a plan step commit carries a sorted
run-length sequence of [A]-[D] tier counts. An ordinary commit prefixes its
conventional subject with that sequence. An implementation-audit record places
the same sequence in its shared stem form; a step commit lands planned work and
carries none. The sequence enumerates how many concerns at each tier the commit
addresses, with zero categories omitted. The commit hook derives the sequence,
its case and its `!` from the graded body bullets, overwriting any authored
value. Write the rest of the subject and the bullets; leave the sequence slot
to the hook.

Three marks carry reach and burden change into the sequence itself, because a
commit graph shows the subject and none of the finding tokens.

- Case says who meets the concern. A tier letter is uppercase when the concern's
  reach is `ordinary`, `rare` or `very-rare`, the values an end user can meet,
  and lowercase when its reach is `developer`.
- A leading `!` says at least one concern has `ordinary` reach, the value that
  needs no special condition to hold: `!B1C1c2d1`.
- A leading `growth-<level>` or `pruning-<level>` says what the commit did to the
  maintenance burden. Measure the commit, never add up the finding tokens:
  compare its code and instructions before and after using the
  [common complexity levels](#reach-and-complexity).
  The word gives the direction, `growth` for a net increase and `pruning` for a
  net reduction. The level grades the size of that net change. Omit the whole
  mark when there is no material net change. The direction is a word and not a sign,
  because a sign carries direction and not judgement: `+` reads as a gain where
  growth is the cost. The level is always written, as `growth-low` rather than
  a bare `growth`, because an omitted level would
  pass as the floor and a level is countable in the log only when it is on the
  page. A commit can read `pruning-high` while one concern inside it added a
  rule, because the mark states the size of the commit's net reduction in
  burden. It carries no colon of its own.

The mark precedes the sequence after a space: `abx pruning-high !B1C1c2d1`. It
leads because what a commit did to the maintenance burden outranks how many
concerns it closed, and a commit often carries the mark where the sequence is
routine.

The subject's shape, the order of its tags and which slots each kind of commit
fills, is owned by [the subject grammar](subject-grammar.md).
This section owns what the sequence and its marks mean.

Reach values and the common burden scale are defined under
[Reach and complexity](#reach-and-complexity).
That section also owns the requirement and case for explaining the whole
commit's net change in one untiered decision bullet in its existing body. The mark and
the finding token `[complexity:...]` run that one measurement, so they translate
exactly: `growth-high` is `[complexity:high]`, `pruning-high` is
`[complexity:minus-high]` and an absent mark is `[complexity:none]`.

Plan rounds keep bare tiers. These marks describe shipped behaviour and the code
that carries it, which a plan document has not reached yet.

## Finding metadata

The metadata tokens are user-directed. Every graded concern carries its title and metadata into the
report and the round's record. The record is durable after the chat and report are gone. Every
finding includes `[growth:...]`, `[reach:...]` and `[complexity:...]`, including the floor values
`none`, `developer` and `none`. Their meanings live under [Growth tags](#growth-tags) and
[Reach and complexity](#reach-and-complexity). Location and search-direction tokens depend on what
the round judges:

- `[field:excess|missing]` names the search direction the finding came from:
  `excess` for functionality that can be removed or simplified, `missing` for
  functionality the artifact lacks. It is the token the two-field shape under
  the planning report contract groups on, and across rounds the balance of the
  two values shows whether an artifact is still growing or has started to shed.
  Commit bullets that predate the token carry none and read as `missing`,
  because the excess direction did not exist as a search obligation before the
  token did. The missing search skips ground an excess finding proposes to cut.
  A keep ruling returns that ground to the next round's missing search.
- `[section:<heading>]` names the artifact section the finding lands in, the
  heading in kebab case, as in `[section:decisions]`. The watch uses it as a
  cluster key when reading the recorded findings.
- `[area:<primary-id>]` names the primary partition bucket of a finding that
  concerns repo-edu code, followed by `[cover:<cover-id>]` for each
  cross-cutting cover bucket. A finding with no area token is a plan-doctrine
  finding outside repo-edu severity buckets.

Planning audit findings carry `[field:]` and `[section:]`. Plan-repo
implementation and off-plan findings carry `[section:]` without `[field:]`.
A Repo Edu finding carries its primary `[area:]` from
`tools/architecture-check/src/area-model.json`, plus applicable `[cover:]`
tokens. A finding deferred from Repo Edu to the plan repo uses
`[plan:../plan/<topic>.md#<heading>]` instead of `[area:]`. A finding deferred
from the plan repo to Repo Edu uses `[area:]` instead of `[section:]`.
Growth, reach and complexity stay on every form.

### Record bullets

In a planning audit commit bullet the tier letter comes first, then the tokens, then a short
title, then the prose after a colon:

```text
- B [field:excess] [section:decisions] [growth:hardening,growing-lists] [reach:rare] [complexity:minus-low] Anchorless admission cases: removing a few independent admission checks leaves only the case the boundary names.
```

The title is required, and it is the same title the report's finding block leads
with. It gives a later round a handle to group and refer to a finding by, and a
finding that cannot be titled in a few words is usually two findings. The report
leads with the title and puts the tokens on their own line, because a person
scans it; the commit bullet leads with the tokens, because a fresh round parses
them.

Repo Edu bullets use a bracketed uppercase tier, followed by the location,
growth, reach and complexity tokens: `- [C] [area:<primary-id>] ...`.
Plan-repo implementation and off-plan bullets use a bare tier:
`- C [section:<heading>] ...`. Only a planning `audit` record carries a
`[field:]` token; other plan-repo records refuse it.

Each accepted graded concern, D included, gets one bullet. A carried decision
or trade ruling that is not a finding takes no tier or metadata. The glance
counts A–C corrections by primary area or section once per commit. D findings
do not advance that count. Record placement and authorisation remain with the
phase completing the round.

## Worked record forms

These are worked instances of the [subject grammar](subject-grammar.md), which
owns the shape. For a findings fix, write the report filename's full auditor
tag in the subject and the fixing session's own model and effort in the body's
opening line. The commit hook replaces them with `COMMIT_AUDITOR` and
`COMMIT_PHASES` when supplied. No runner check is needed to write a record.
Leave the severity slot to the hook; the examples below show the authored
message before it fills that slot. Replace the example stem, tag, model,
effort, scope and findings with the round's values.

### Planning record

Planning records use `audit`. Each finding carries `[field:]` and a section
location under [Finding metadata](#finding-metadata). They carry no yield
lines. For one missing C finding:

```text
example/audit ath: align the report location

gpt-6-astra high

- C [field:missing] [section:decisions] [growth:none] [reach:developer] [complexity:none] Report location: the decision names the invoking root.
```

The hook inserts `C1` before the colon.

### Implementation record in Repo Edu

Implementation records use `impl-audit-<scope>`, where the scope is `<n>`,
`<a>-<b>` or `all`. Repo Edu finding bullets use bracketed tiers and primary
areas. Recount the accepted findings in this record for its closing yield lines,
using their final reach and complexity values. For one C finding in step 2:

```text
example/impl-audit-2 ath docs(audit-round): align the report location

gpt-6-astra high

- [C] [area:tool-audit-round] [growth:none] [reach:developer] [complexity:none] Report location: the workflow names the invoking root.

Round yield: 0 ordinary; 0 rare; 1 developer.
Structure: 0 removing, 0 adding, 1 flat.
```

The hook inserts `c1` before `docs(audit-round)`. When the commit changes
maintenance burden, author its growth or pruning mark under
[Severity sequence](#severity-sequence). The hook derives the severity sequence,
its case and its `!` from the finding bullets.

### Implementation record in the plan repo

The role still uses `impl-audit-<scope>`. Local finding bullets use bare tiers
and `[section:]`, without `[field:]`. The record carries no yield lines:

```text
example/impl-audit-2 ath docs(audit): align the report location

gpt-6-astra high

- C [section:report-file] [growth:none] [reach:developer] [complexity:none] Report location: the workflow names the invoking root.
```

The hook inserts `C1` before `docs(audit)`. The fix workflows own record
placement, deferrals and clean records reached through reconciliation.
Audits with no findings complete under their audit workflow and never enter
the fix workflow.

## Runner result

When the prompt identifies an unattended round phase, planning or implementation, follow this rule
for every ending, including an early stop. It is shared by audit, vet, rebuttal, fix, brief and the
two watch passes. Planning workflows read this whole reference from its Repo Edu home; their
planning rules stay in the plan repo. Implementation routes may supply local substitutions. Ordinary
interactive invocations do not add a result line.

Make the last line of the final response `PHASE RESULT: <JSON object>`.
Keep it outside any code fence. Audit, vet and rebuttal supply their complete
report or twin in the final response and write no file. The runner saves that
text at the supplied path without the result line before the next phase reads
it. The runner reads the result line but does not display it. The object has
exactly these fields:

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
An audit finishes when its required evidence and final report are complete. A
clean report also finishes. The runner replaces only the supplied output path.
Reports from other rounds do not block the run.

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
root, and the watch edit only the draft as file arguments. Only the writer's prompt
receives joined Git evidence for the audited plan, computed after the fix and
only when due. The editor improves the wording while preserving the draft's claims
and judgements. They run only when the runner's own
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

## Completed commit metadata

Plan and implementation audits exclude completed commits' metadata: kinds,
scopes, capability tags, model records, severity, reach and complexity labels.
This includes commits named as audit targets: naming one selects its code
changes, not its metadata. Incorrect labels create no finding, correction,
reporting, deferral or follow-up duty. The user accepts those errors because
correcting them adds work without improving the code being judged.

Keep targeted history reads for a decision's reason, a code defect's cause or
a user's ruling. A behavioural claim that exposes a live defect still informs
the code review. Instructions and checks for writing new records stay intact,
as does the watch's use of old labels as evidence.

Investigating recurring metadata errors requires a separate, explicitly
authorised plan. It may improve the process for future records, never repair
completed commits. It creates no prerequisite, interruption or other work for
an unrelated plan or audit.

## Judging deviations

This is not a strict conformance audit. Where the implementation departed from
the plan, judge the shipped code first. It must be correct and of the best
quality the repo's standards allow. A departure that responds to a real error
or imperfection in the plan is correct behaviour. Record it as deviated in the
table, not as a finding, when the code is right. A missing departure reason is
a finding only when it leaves a live instruction misleading or an important
constraint unexplained. State that concrete maintenance problem and repair its
live owner, without rewriting old commits. Read targeted history when intent
matters. Code that faithfully followed a defective plan into a defect is still
a finding. The standard is the shipped code, never fidelity for its own sake.
Do not reopen decisions the plan settled. Question one only on correctness or
quality evidence, never on taste.

## Growth tags

Every finding carries a growth tag naming the patterns in `../plan/GROWTH-PATTERNS.md` it could
violate, by their labels: `[growth:hardening]` for one, `[growth:hardening,unpriced-complexity]`
when more than one could apply, listed in pattern order, and `[growth:none]` when none does. What is
tagged is the work the finding flags, never the correction it asks for; the complexity token rates
the correction. A finding that flags a guard added control by control tags `growing-lists` even when
its correction removes the copies. The tag rides the finding in the report and the matching bullet
in the round's commit body, under [Record bullets](#record-bullets), so it survives in the log after
the chat is gone. A tag that reaches only the report is lost, and the next round is back to having
no memory.

The bar is could it be, not is it. A false positive costs one bracket, or
one trade block and its ruling when the other two tokens also show risk. A
false negative costs the loop this rule exists to break: a run of rounds each
repairing machinery that no boundary asks for, every round locally defensible
and no round able to see the run. The tag is a suspicion, never a verdict, and
it blocks nothing. A finding tagged `[growth:hardening]` still lands. So
there is no reason to suppress one. The tag's cross-round signal lives in
the run; a single risky finding prices its own trade inside its trade
block, per the finding explanation rules, and still lands.

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
how the correction changes the maintenance burden as a whole: what future
work must understand, preserve and coordinate, never the effort of making
the correction. Commit marks, audit findings and yield reports use these
common levels:

| Level | Meaning | Practical anchor |
| --- | --- | --- |
| Low | A small additional maintenance burden. | Few obligations whose interactions remain contained. |
| Medium | A substantial additional maintenance burden. | A sizeable body of conditions to preserve or several agreements that must change together. |
| High | An extensive additional maintenance burden. | A large body of conditions to preserve, constraints spread through the system or extensive coordination between changes. |

Compare before with after and judge additions and removals together. A finding
compares the correction with the existing code and instructions. A commit
compares the whole commit's code and instructions before and after, never the
sum of its finding tokens. A yield report compares a decision with the simplest
coherent alternative that omits it. Moving a responsibility does not create or
remove one. An unbuilt alternative supplies no removal credit.

Choose the direction from the net change, then grade its size. Use `low`,
`medium` or `high` for an increase and the corresponding `minus-` level for a
reduction, judged with the same anchors. Use `none` for no material net change.
Explain why one side outweighs the other. Do not average the categories of
mechanisms added and removed: moving a large burden while adding one small
obligation is small growth.

Consider amount and interaction together. Many independent rules can accumulate
substantial burden; a small amount of tightly coupled code can carry it too.
Rules, state and ownership are evidence, not automatic levels. Neither line
count nor an ownership boundary determines the grade. Replication is evidence
of agreement and coordination costs, not an automatic escalation: grade the
added agreements and their interaction. Include workflow instructions, since
procedures agents must follow create obligations too. Documentation is not
automatically free. Count the obligations tests add or remove without counting
the machinery they cover twice.

Explain the concrete obligations added and removed in the finding's or yield
decision's existing explanation. In a commit, use one untiered decision bullet
in the existing body to explain the whole commit's net change in obligations.
The rating summarises that account. The anchors guide judgement rather than
impose numerical thresholds.

The account rule applies whenever a finding, yield decision or whole commit is
graded, so its cost recurs with each assessment. Without it, a judged size label
hides which obligations support the rating and why additions outweigh removals.
Accepting that opacity was rejected because the kind-based `growth-high` on
`d80b85ce` did not answer how much burden its contained delegation procedure
added. Each assessment adds an account within an existing explanation or one
commit-body bullet. Readers and auditors must check it, and disputes can add
findings, rounds and user reading or ruling time. It adds no separate report,
gate or hook check.

This scale reverses the 2026-09-22 ruling that kept kind-based commit grades
alongside burden-based yield grades. The new evidence was `d80b85ce`: its high
mark identified an ownership change but did not answer the user's size
question. One burden scale gives up that kind signal. It is a deliberate
exception to the plan doctrine's mechanical-grading principle: scope, evidence
and output remain prescribed, while burden size is judged. The account makes
disagreement inspectable; it does not make the scale mechanical.

The commit subject's leading mark runs this measurement over a whole commit, with the same level
spellings: `growth-low` is `low` and `pruning-high` is `minus-high`. An absent mark presents `none`
compactly. Severity and reach stay separate from complexity. [Severity sequence](#severity-sequence)
owns the mark's meaning and the subject grammar owns its form. Replace the old definition directly,
with no date-based grading, historical conversion, episode split or extra inspection duties for old
marks. Do not rewrite Git history.

The two tokens are one pair, and the pair is the point. Growth pattern 6 in
`../plan/GROWTH-PATTERNS.md` says a user-facing cost vetoes while a
complexity cost never does, and its test is to name the trade: what the work
gives the user against what its machinery costs. The pair fires that test on
every finding, so a cross-round run of `[reach:developer]`,
`[reach:very-rare]` or `[reach:rare]` beside `low`, `medium` or `high`
`[complexity:...]` values on the same machinery is the unpriced trade shown
in the log for the watch to judge. A
`minus-` value is the opposite signal: the correction removed more burden
than it added, which counts in its favour and never joins a priced run. The
tokens describe reach and net burden, not worth, and like the growth tag they block nothing: a
finding tagged `[reach:rare] [complexity:high]` still lands. The vocabulary
has one spelling across both logs. A run can also supply evidence for a new
growth pattern, including work no listed pattern matches. The tokens rate
facts rather than worth: a round that scored its own proposed correction
would be grading its own work.

## Vet verdicts

Return one vet-verdict per audit-finding, in the report's order: accept, revise, drop or
needs the user's ruling. A revise vet-verdict states the revision. A drop vet-verdict
states why. Keep each vet-verdict to a few short sentences.

Every vet-verdict starts with exactly `<audit-finding number>. [<tier>] <vet-verdict>`. Use the
report's audit-finding number and A/B/C/D tier. The vet-verdict is exactly one of `Accept`,
`Revise`, `Drop` or `Needs user's ruling`. The first line contains nothing else, for example
`1. [B] Accept`. Conditions, notes and required explanations follow on separate lines. Prose before
the first vet-verdict is free; put drift notes there. After the first vet-verdict, every non-empty
line is a vet-verdict or a condition. Any other line counts as a condition, including a narrowing
note. The vet-verdict numbers must match the report exactly. An unconditional Accept with no
additional notes ends after the first line; do not repeat the audit-finding title, evidence or
reasoning. Required narrowing notes count as additional notes. This format applies in both chat and
the `-3-vet.<tag>.md` twin.

## Rebuttal grounding

Read the report end to end, then the supplied vet twin. Check each sha in the
report opening against its repo's `git rev-parse --short HEAD`, and when one
differs list what moved with `git diff --name-only <sha>..HEAD` in that
repo. Answer against HEAD either way, and say where a moved file changes an
answer.

Carry unconditional accepts forward without fresh source reads or individual
answers. For revisions, drops, conditional accepts and ruling items, read the
source the verdict rests on yourself: the file
path the finding names, the test that covers it, the plan decision or
boundary the vet cites, and the episode's commit bodies where the vet calls
a departure unrecorded. Do not trust the report's quotes or the vet's; the
answer stands on what you read now. Read `../plan/BOUNDARIES.md` and
`../plan/GROWTH-PATTERNS.md` where a verdict invokes them.

## Rebuttal answers

Answer only revisions, drops, conditional accepts and ruling items, in the
report's order. Unconditional accepts need no entry; the fix reads them from
the numbered vet verdicts.
Every answer starts with exactly `<finding number>. [<tier>] <answer>`.
Use the report's finding number and A/B/C/D tier. The answer is exactly one
of `Agree`, `Contest` or `For user's ruling`.
The first line contains nothing else, for example `1. [B] Agree`.
Conditions, notes and required explanations follow on separate lines.
An unconditional Agree with no additional notes ends after the first line;
do not repeat the finding title, evidence or reasoning. Other answers use a
few short sentences. Every answer is one of three kinds.

- Agree. The verdict stands. Add further information only when agreement is
  conditional or there are additional notes. Agreement with a revise carries
  the revised correction in full as a note so the fix phase has one text to
  apply. Agreement with a drop needs no explanation unless there is a condition
  or an additional note.
- Contest. The verdict rests on something the vet misread. Quote the
  evidence, name its file and line or its plan section, and state what the
  verdict should have been. Contest only on evidence the vet can go and
  read. A disagreement of taste is not a contest; it is an agree with a
  note.
- For user's ruling. The vet sent the item to the user under its
  recorded-decision or trade rules. State the auditor's position and its
  evidence in the same short form, and stop there. Never settle it here.

## Reconciliation

Build the outcome from the numbered vet verdicts and rebuttal answers, accounting
for every finding. An unconditional accept stays agreed without a rebuttal
entry. Present agreed verdicts, your decisions on contested verdicts and items
for the user's ruling. For each contested verdict, read the evidence yourself,
decide the outcome and state your decision and reason. Ask the user only when
the evidence leaves the answer unclear; disagreement alone needs no ruling.
Never re-argue an agreed verdict.

When the report has a vet twin and no rebuttal, and every verdict is an
unconditional accept, the runner skipped the rebuttal because the auditor had
nothing to answer. Present the findings as agreed by both assistants, say
that the vet accepted every finding, and do not re-answer the verdicts. When
the vet twin holds any other verdict and no rebuttal exists, answer each
verdict here: agreement carries it into the outcome, disagreement names the
evidence the vet misread. Present the same three groups. Without a twin,
present the report's findings in their numbered order with any drift
corrections from the fix phase's current-source grounding.

The user reads along and rules by exception: a go on the presented outcome
is the acceptance, and a reservation on any item reopens it, including a
reservation the report never raised. Ground a reopened item the same way
before answering it.

One kind of finding is not covered by accepting the round as a whole, in a
vetted round and an unvetted one alike: a real unresolved choice about cost
needs its own answer, whether the report explains it in the finding's prose or
a separate trade block. List these apart in the presentation.
When the user picks the simpler mechanism, that mechanism becomes the
finding's required correction, revised in the discussion like any other
revision. When that ruling overturns a reason the plan records, the round
carries the correction and the user's reason as a cross-repo finding, so the
plan correction is applied or deferred without re-derivation. When the user
keeps the machinery, the same record carries the ruling and its reason. The
code finding then follows the normal path: a correction the ruling leaves
standing is applied, and a finding the ruling dissolves is omitted from the
record.

A cross-repo finding the report left as an open choice is put to the user
here. When the user rules, carry the answer and its reason in the deferral.
When the user does not rule, keep the choice open in the deferral instead of
choosing for them.

The invocation grants the corrections settled above. Stop for a ruling only on
open items: an item sent to the user's ruling, a contested verdict the evidence leaves unclear, a
drift correction that changes a finding, or a verdict without a rebuttal that this session cannot
settle from the evidence. When nothing is open, state the outcome in one line per finding and apply.
A cross-repo
open choice awaiting the user's ruling is not an open item here. Its outcome lands through the
deferral above or a later plan round, never through this session, so it holds no settled correction
back. Keep it open in the deferral and apply the settled findings.

## Round yield

This tally applies to implementation audits and their Repo Edu records.

After the coverage line, close the round with two more lines that tally the
findings the audit reports:

```text
Round yield: <n> ordinary; <n> rare; <n> developer.
Structure: <n> removing, <n> adding, <n> flat.
```

The first line counts the reported findings by their `[reach:...]` value,
treating `very-rare` as rare. The second counts them by the sign of their
`[complexity:...]` value: `minus-` levels remove, `low`, `medium` and `high` add
and `none` is flat. A clean round writes both lines with zeroes.

The tally exists because the decision to run another round needs the round's
yield, and reading it out of per-finding tokens means re-reading the whole log
by hand. It answers what a round bought: findings an end user can meet, and
whether the corrections left the code with more maintenance burden or less.
Both lines are counts over the findings, unlike the commit subject's leading
`growth-<level>` or `pruning-<level>`, which measures one commit's own code
before and after.
The two answer different questions and neither replaces the other.

## Report format

### Implementation reports

Open by naming the workflow that ran and include exactly one plain line: `Judged repos: plan@<sha>`,
`Judged repos: repo-edu@<sha>` or `Judged repos: plan@<sha>, repo-edu@<sha>`. Use each judged repo's
short audited HEAD. Repos read only as evidence stay outside that line. It selects the repos for
vet, rebuttal, fix and clean completion. The filename holds the writer tag; do not repeat or look up
that tag for the opening. Then name the plan file, its ready commit and the implementation commits
inspected. State the round's user-set scope: the whole plan, one step or one step range.
Then report the coverage table, its coverage line and the **Round yield** lines,
followed by the finding field.

Every finding, including a cross-repo finding, belongs in one `## Findings`
field. A field with no findings contains exactly `No findings.` instead of
finding blocks. A report with only deferred findings still has findings.

### Planning reports

Open by naming the workflow, artifact and widening or detailing phase.
Include exactly one plain line `Judged repos: plan@<sha>` with the audited
short HEAD. Evidence-only repos stay outside it. Do not repeat the writer tag
from the filename. The planning workflow supplies current-shape advice for a
widening report and the premise-error route for an early stop.

Present the graded findings in two fields, both present in every report:
`## Excess functionality` first, for what the artifact can shed or simplify,
then `## Missing functionality`, for what it lacks, per the two-direction search
in a planning audit. Excess leads because an accepted removal
makes gap detection in the removed area moot: the user rules on what to cut
before reading what to add. Each field orders its findings from A through D.
Number the findings as one run: start at 1 in the excess field and keep the
numbers increasing through the missing field, so the user can refer to one
finding without restating it. A field with no findings contains exactly
`No excess findings.` or `No missing findings.`, respectively, with no finding
blocks. An empty field is a checked verdict, never an omission to leave silent.

## Finding shape

Use the fields under [Report format](#report-format) for the round kind.
Use this block form, with a numbered bold tier and title on the first line and
the metadata tokens on their own line immediately after the title, before the explanation.
Separate the title, token line and explanation with blank lines:

1. **C: Conflicting report names**

   [area:tool-audit-round] [growth:none] [reach:developer] [complexity:none]

   The report rule and its example name different files. The vet cannot resolve
   the example. Align the example with the rule.

Use the same block shape for a planning finding, with its planning metadata:

1. **C: Conflicting report names**

   <!-- rumdl-disable-next-line MD013 -->
   [field:missing] [section:report-file] [growth:none] [reach:developer] [complexity:none]

   The report rule requires the scope in the filename, but the phase argument
   contract requires an unscoped name. Following either contract makes one
   reader look for the wrong file. Both are explicit requirements, and the
   doctrine delegates naming to the plan, so an implementation audit has no
   grounds to choose between them. Align both contracts on scoped names so
   reports for different step ranges remain distinct.

Keep numbering continuous from 1 across all finding fields. Order each field
from A through D. Quoted evidence and code blocks belong inside their finding.

Briefly explain the problem, its consequence and the correction, supported by
decisive evidence from sources you have read. Combine these in a short paragraph
when they fit; include useful quotes and file paths so the reader can verify the
defect. Use another paragraph when needed, without packing several ideas into
one sentence. Separate correction, evidence, failure-trace and trade parts are
not required. Expand when a real unresolved choice needs explanation.

At tiers A to C, an implementation finding states what wrong behaviour the code produces without the
correction. A planning finding states what the implementation session would do differently and what
wrong code or behaviour results, under the planning grading discipline. For `rare` or `very-rare`
reach, name the condition that makes the rating checkable. For a runtime defect, name the triggering
situation and concrete outcome. A planning finding also states how often a person meets that
situation. When the cost is only rework or re-derivation, state that cost and use
`[reach:developer]`. A D-tier finding derives its consequence for grading but need not report it. A
tier claim without a consequence does not stand; drop a finding whose trace ends with the same
behaviour shipping. Reach supports the user's ruling on the outcome and never changes the tier.

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
goes to the user under [Reconciliation](#reconciliation).

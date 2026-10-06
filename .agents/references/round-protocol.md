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
Three files omit the tag: the empty `<target>-<round>-0-claim.md` reserves a
number, `<stem>-handoff.<sha>.md` briefs the commit it names and the runner's
`<target>-queue.md` holds the auditors a running sequence has yet to start. The
queue file carries no round number because it belongs to the whole sequence,
and the runner deletes it when the sequence ends. The runner
claims at the plan repository root; a hand-run audit claims there too.
The plan repo's handoff rule owns that six-character sha.

- **Target** names what was audited. A planning-artifact audit uses its bare
  stem, without `.md` or `-widen`. For an archived `plan.md`, use the archive
  folder's name. An implementation audit adds `-step-<a>..<b>` or `-step-all`
  to that stem. A single step is the range from itself to itself, such as
  `-step-07..07`, and step numbers are padded to at least two digits. The
  explicit step word disambiguates a plan name ending in a number when reading
  a filename from the right. One word, padding and the `..` range keep `ls` and
  Finder in step order, with a range after every round of its first step. The
  equal width keeps round and phase numbers aligned across scopes.
- **Commit targets** preserve the references as typed, replacing `HEAD` with
  Repo Edu's short sha at the start of the round. Keep offsets: `HEAD-4..HEAD` becomes
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

Skipped phases leave gaps. Every round file lives at the plan repo root.

Read a name from the right: remove the extension, three-letter tag, kind and order,
then split the remaining name at its last hyphen into target and round.
The tagless claim, handoff and queue file are the three exceptions above. Do not read repo
names or audited heads from a filename; they belong in the report opening.

For example, one round can contain `example-step-02..02-01-2-audit.otm.md` and
`example-step-02..02-01-3-vet.abx.md`. Their target and round match; their writer tags
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

- audit: path where the runner saves the report, target, scope or commit references
- vet: report to read, path where the runner saves the vet twin
- rebut: report and vet twin to read, path where the runner saves the rebuttal twin
- fix: report, then the vet and rebuttal twins that exist
- brief: transcript to read, brief to write
- watch: watch to write, cache root

The runner saves audit, vet and rebuttal outputs from each final response under
[Runner result](#runner-result). Those sessions write no file. Only brief and watch
sessions and the fix's ruling write directly to their supplied output paths.
Use the supplied paths without reconstructing a name or adding an opening writer tag.
A standalone brief reuses the transcript's target
and round. Its document and log share `6-brief.<tag>`; the log is opened for
overwrite without another claim. The round transcript and log share
`1-round.<tag>`.

The fix receives the ruling output path separately from its report arguments.
It writes the final ruling at that path before returning `needs-ruling`, using
the fix writer's tag. A resumed fix receives the same path and the user's reply.

## Manual phases

The `name`, `paths` and `close` commands can start from either checkout.
Round files remain at the plan repo root. Planning sessions work in the plan
checkout; implementation and commit sessions work in Repo Edu.

A manual invocation may name the audit report.
If the current conversation identifies that input unambiguously, use it.
Otherwise omit the input when calling `paths` below. The command searches only
the plan repo root and selects the most recently modified eligible file without
confirmation:

- Vet uses audit reports from the other assistant.
- Rebuttal uses audit reports from the current assistant.
- Fix uses audit reports from either assistant.

Eligibility uses the filename grammar and the writer tag's vendor letter, not
its model tier or effort. When no file qualifies, ask for the input. Supplied
inputs take precedence over discovery; the phase workflow still owns its
assistant and scope checks.

A hand-run audit runs
`pnpm audit-round name [target] [scope-or-commits...] --auditor <full tag>`
before auditing. It passes its own resolved three-letter tag, including `u` for
an unlisted model. Without a target, the command follows
[Omitted targets](#omitted-targets). It claims the next number
and prints one JSON object:
`cwd` is the working checkout, `workflow` is the owning workflow, `claim` is the
reserved claim path and `arguments` holds the report path followed by the resolved
audit target and scope. It creates only the claim and starts no assistant or
settings discovery. It does not name later writers' files.

The target grammar is the same from either checkout. A plan stem alone selects
a planning audit. A stem with a step number, an inclusive range or `all`
selects an implementation audit. Commit references select a Repo Edu commit
audit. Plan arguments accept `.md` and `-widen` but no path; lookup prefers the
active artifact at the plan root, then its archive. A commit-shaped stem keeps
`.md` to identify it as a plan.

For later phases, use complete runner-supplied paths when present. Hand-run
commands take bare file names and resolve them at the plan repo root:

| Phase | Command |
| --- | --- |
| Vet | `pnpm audit-round paths vet [report] --writer <own full tag>` |
| Rebuttal | `pnpm audit-round paths rebut [report] --writer <own full tag>` |
| Fix | `pnpm audit-round paths fix [report]` |

Each command prints one JSON object with `cwd`, `workflow` and `arguments`. The arguments are
absolute paths in the phase's order above. The report opening's named workflow selects the route.
Work in the printed checkout, read its repository instructions and follow its printed workflow with
those arguments, even when the session started elsewhere. The command writes nothing, claims no
round and starts no assistant or settings discovery. The output name retains the input's target and
round and uses the writing session's current tag, even when its model or effort differs from the
earlier audit or the runner's settings.

Review inputs are existing files of the exact same round at the report's root.
The resolver requires a vet for rebuttal and returns whichever review files
exist for fix; the fix workflow decides whether those inputs suffice. If more
than one vet or rebuttal matches, the resolver takes the most recently modified
one. Pass `--vet <file>` or `--rebut <file>` when the user named a review file.
Never run `name` to continue an existing round.

A manual planning reply in the original audit session uses the same rebuttal
resolution. A manual fix asks for any open ruling in chat; it needs no ruling
output path. `pnpm audit-round brief [transcript]` remains the separate command
that starts a brief session itself; without a transcript it retells the most
recently modified one at the plan root. The home `/brief-round [transcript]`
and `$brief-round [transcript]` retell the same transcript in chat and write
no file. The home `/brief-plan [stem]` and `$brief-plan [stem]` summarise a
plan from either checkout and are outside this round protocol.
The runner supplies the round brief's and the watch's workflow and its listed
files, including the `simple` definition, without a launcher. Their home
launchers, `/brief-round` and `/watch` with their Codex forms, serve only
hand-run sessions.

### Omitted targets

When `name` or an automated round gets no target, it repeats the newest
unfinished audit. A bare `pnpm audit-round` with no arguments at all still
prints help. The plan is the active artifact at the plan root, never an
archived one, whose stem commit is newest in either repo by commit date. That
commit decides:

- A planning commit, `init`, `audit`, `settle` or `ready`, selects a planning
  audit of the plan.
- An implementation-audit record that is not clean selects its scope again.
- Any other commit stops with its reason: a clean record, a step or a marker.
  The user then names the scope. Moving on to the next audit unit is the user's
  call.

The home `/brief-plan` given no stem reads the same plan.
`pnpm audit-round plan` prints it from either checkout.

## Deleting reports

An unattended phase deletes no round files, including a fix resumed after a
ruling. Report deletion belongs to the runner so completion has one owner.
The runner deletes the audit, vet and rebuttal reports as soon as a fix returns
`finished`. Other outcomes retain them. After a hand-run fix lands its records
or a hand-run audit lands its direct clean record,
`pnpm audit-round delete-reports <target>-<round>` deletes those
same numbered report kinds for that exact round, regardless of writer tag. It
uses the runner's own filename parser, so a hand-run round deletes exactly what
the runner would. It lists each deleted file and fails when no report matches.
Claims, transcripts, logs, briefs, rulings, watches and other rounds remain.
Loop-close is a separate step that archives a plan; the
[loop-close workflow](../../../plan/.agents/skills/close/references/workflow.md)
owns it.

## Direct clean completion

An audit with no findings completes without vet, rebuttal, fix, brief, glance
or watch. This route avoids a fresh fix session whose only work would be an
empty record.

- Unattended: return the complete report under [Runner result](#runner-result).
  The runner retains it and lands the clean record for a plan target.
- Hand-run: deliver the report under [Audit delivery](#audit-delivery), land
  the plan target's clean record immediately and follow
  [Deleting reports](#deleting-reports), then stop.
- A commit target lands no clean record and retains its report in either route.

Use the plan doctrine's
[record meanings and placement](../../../plan/CLAUDE.md#shared-implementation-forms) and
[planning clean-record mandate](../../../plan/CLAUDE.md#commit-message-convention). Those standing
rules grant the empty record without separate permission. The subject follows
[the subject grammar](subject-grammar.md), with the auditing session's capability tag. Its body
opens with that session's actual model and effort and closes with both [Round yield](#round-yield)
lines at zero. The plan doctrine's [Handoff](../../../plan/CLAUDE.md#handoff) owns the handoff
exception for this route. A round made clean through reconciliation follows its ordinary fix
completion instead.

## History reads

Cross-round scans belong to glance and watch. The narrow exception is an
implementation audit's stop recommendation: it reads the subjects and **Round
yield** lines of earlier implementation-audit records for the same step scope.
It uses them only to judge whether the next round on that scope is likely to
find something worth its cost. It does not compute the episode or classify its
trajectory. Other phases read history when needed to establish a specific
finding, prior ruling, a rule's origin or an implementation departure.
Lifecycle, scope discovery and handoff lookups remain required. This keeps
current-work review separate from trajectory judgement without withholding
the evidence a finding needs.

The plan doctrine's [Handoff](../../../plan/CLAUDE.md#handoff) owns the handoff
for both round kinds. The phase landing the record writes it. The next audit
reads it under that section's read gate.

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
categories omitted, such as `A3B4C4D3`, carrying the marks below in both
repos. Steps and markers carry no graded concerns and no sequence.

In Repo Edu, every file-changing commit except a plan step commit carries a sorted
run-length sequence of [A]-[D] tier counts. An ordinary commit prefixes its
conventional subject with that sequence. In the plan repo, every planning and
implementation-audit record carries it, and an off-plan commit carries it when
it closes a graded concern. An implementation-audit record places
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
  net reduction. The level grades the size of that net change, and `growth-none`
  says there was no material net change. The mark is written beside every
  sequence except a deferral record's, which changes no code and so measures
  nothing. The direction is a word and not a sign,
  because a sign carries direction and not judgement: `+` reads as a gain where
  growth is the cost. The level is always written, as `growth-low` rather than
  a bare `growth` and `growth-none` rather than no mark, because an omission
  cannot be told from a forgotten mark and a level is countable in the log only
  when it is on the page. The floor has no direction, so `pruning-none` is not
  a spelling. A commit can read `pruning-high` while one concern inside it added a
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
`[complexity:minus-high]` and `growth-none` is `[complexity:none]`.

The marks read the same in both repos. The case and the `!` derive from reach
tokens every plan bullet already carries. A plan-repo doctrine or workflow fix
changes the instructions the burden measurement is defined over, so an
unmarked plan log would hide a burden trajectory it has the evidence to show.

## Finding metadata

Every graded concern carries its title and metadata into the
report and the round's record. The record is durable after the chat and report are gone. Every
finding includes `[growth-pattern:...]`, `[reach:...]` and `[complexity:...]`, including the floor
values `none`, `developer` and `none`. Their meanings live under
[Growth-pattern tags](#growth-pattern-tags) and
[Reach and complexity](#reach-and-complexity). Location and search-direction tokens depend on what
the round judges:

- `[field:excess|missing]` names the search direction the finding came from:
  `excess` for functionality that can be removed or simplified, `missing` for
  functionality the artifact lacks. The two-field shape under
  [Planning reports](#planning-reports) groups findings by this token. Across
  rounds the balance of the two values shows whether an artifact is still
  growing or has started to shed.
  Commit bullets that predate the token carry none and read as `missing`,
  because the excess direction did not exist as a search obligation before the
  token did. The planning audit workflow owns the search order and how removals affect
  the ground searched.
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
- B [field:excess] [section:decisions] [growth-pattern:hardening,growing-lists] [reach:rare] [complexity:minus-low] Anchorless admission cases: removing a few independent admission checks leaves only the case the boundary names.
```

The title is required, and it is the same title the report's finding block leads
with. It gives a later round a handle to group and refer to a finding by, and a
finding that cannot be titled in a few words is usually two findings. The report
leads with the title and puts the tokens on their own line, because a person
scans it; the commit bullet leads with the tokens, because a fresh round parses
them.

Repo Edu bullets use a bracketed uppercase tier, followed by the location,
growth, reach and complexity tokens: `- [C] [area:<primary-id>] ...`.
Plan-repo implementation and off-plan bullets use an unbracketed tier:
`- C [section:<heading>] ...`. Only a planning `audit` record carries a
`[field:]` token; other plan-repo records refuse it.

Each accepted graded concern, D included, gets one bullet. A carried decision
or trade ruling that is not a finding takes no tier or metadata. Name the
abstraction the issue touches, not only the fix, so the watch can cluster
findings across rounds. When a round reverses or narrows a prior decision,
name that decision, the new evidence, its seriousness and why the new direction
holds. A reversal written as an ordinary fix hides instability from the watch.
Record placement belongs to the plan doctrine's
[Shared implementation forms](../../../plan/CLAUDE.md#shared-implementation-forms);
authorisation remains with the route completing the round.

## Worked record forms

These are worked instances of the [subject grammar](subject-grammar.md), which
owns the shape. Apply Repo Edu's `CLAUDE.md` **Commit Capability Tag** and
**Commit Model Record** and [Severity sequence](#severity-sequence).
No runner check is needed to write a record. The examples show the authored
message before the hook fills its sequence.
Replace the example stem, tag, model,
effort, scope and findings with the round's values.

### Planning record

Planning records use `audit`. Each finding carries `[field:]` and a section
location under [Finding metadata](#finding-metadata). Recount the accepted
findings for the closing yield lines. For one missing C finding:

```text
example/audit ath growth-none: align the report location

gpt-6-astra high

- C [field:missing] [section:decisions] [growth-pattern:none] [reach:developer] [complexity:none] Report location: the decision names the plan repo root.

Round yield: 0 ordinary; 0 rare; 1 developer.
Structure: 0 removing, 0 adding, 1 flat.
```

The hook inserts `c1` before the colon. Author the growth or pruning mark
before the sequence under [Severity sequence](#severity-sequence), `growth-none`
when the commit leaves maintenance burden unchanged; this applies to every
record form below except the deferral record, which changes no code.

### Implementation record in Repo Edu

Implementation records use `impl-audit-<scope>`, where the scope is `<n>`,
`<a>-<b>` or `all`. Repo Edu finding bullets use bracketed tiers and primary
areas. Recount the accepted findings in this record for its closing yield lines,
using their final reach and complexity values. For one C finding in step 2:

```text
example/impl-audit-2 ath growth-none docs(audit-round): align the report location

gpt-6-astra high

- [C] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Report location: the workflow names the plan repo root.

Round yield: 0 ordinary; 0 rare; 1 developer.
Structure: 0 removing, 0 adding, 1 flat.
```

The hook inserts `c1` before `docs(audit-round)` and derives the severity
sequence, its case and its `!` from the finding bullets.

### Implementation record in the plan repo

The role still uses `impl-audit-<scope>`. Local finding bullets use unbracketed
tiers and `[section:]`, without `[field:]`. The record closes with the same
yield lines:

```text
example/impl-audit-2 ath growth-none docs(audit): align the report location

gpt-6-astra high

- C [section:report-file] [growth-pattern:none] [reach:developer] [complexity:none] Report location: the workflow names the plan repo root.

Round yield: 0 ordinary; 0 rare; 1 developer.
Structure: 0 removing, 0 adding, 1 flat.
```

The hook inserts `c1` before `docs(audit)`. The plan doctrine owns record
placement and deferrals; fix workflows carry them out after reconciliation.
Audits with no findings use [Direct clean completion](#direct-clean-completion).

## Runner result

When the prompt identifies an unattended round phase, planning or implementation, follow this rule
for every ending, including an early stop. It is shared by audit, vet, rebuttal, fix, brief and
watch. Planning workflows read this whole reference from its Repo Edu home; their
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
| `finished` | The phase completed its required work. A fix landed its records. A brief wrote its file beside the transcript. | Delete a finished fix's reports under **Deleting reports**, then continue, or finish the run after the watch. |
| `needs-ruling` | The fix phase wrote the final ruling for its open decisions. | Check and display the ruling file, collect the user's reply and resume the same fix in the background. Only a completed fix proceeds through the normal checks, brief and watch; stopping without a reply retains the round files. |
| `failed` | The phase could not complete its required work. | Show the reason and stop. |

Each phase judges its own outcome. Every phase but the fix uses only `finished` or `failed`; the
reports may carry open items for the fix phase to present, and the brief retells them for the user.
An audit finishes when its required evidence and final report are complete. A
clean report also finishes. The runner replaces only the supplied output path.
Reports from other rounds do not block the run.

A clean audit follows [Direct clean completion](#direct-clean-completion). A vet that accepts
every finding without conditions skips the rebuttal, so the fix starts sooner.
A ruling resumes the same
fix session. [Later files](#later-files) owns the supplied paths.

Required work still blocked by a permission refusal or another error means
`failed`, even when the assistant can end its turn normally or a partial
report exists. A successful permitted retry counts as success when all
required work is complete. Judge what remains blocked, not whether any tool
call failed earlier. A missing input or unmet workflow gate also means
`failed`; reserve `needs-ruling` for the fix workflow's open items. This rule
grants no permission to bypass a gate or make the user's decision.

Workflows own the phase outcome; the runner validates the report,
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

## Implementation settlement

Scoped rounds never settle the episode, even when their ranges tile every
step. Each scoped verdict describes the HEAD it ran on, and later steps age it.
The proof that the implementation is settled is whole-plan rounds on the
finished code whose severity has stabilised at C or below with no new A, each
round's table classifying every row. A round that finds nothing is not required.
Prior audit commits inform those rounds, ranking their reports and naming the
fixes to re-verify. They never excuse a row from inspection.

The watch judges convergence and repeated structural growth; the user owns
settlement. The final whole-plan round expects an `implemented` marker in every
judged repo under the plan doctrine's
[Shared implementation forms](../../../plan/CLAUDE.md#shared-implementation-forms).
When a marker is missing, name it once and continue on the user's word. That round
uses the audit's read-only evidence rules. The final round is advice, not a gate.
When asked to treat the implementation as done without that round, name the
missing round once and continue on the user's word.

Loop-close follows on the user's word, given as `/close` or `$close` or asked
for in the final round's fix session. Either way the session follows the
[loop-close workflow](../../../plan/.agents/skills/close/references/workflow.md),
which writes each repo's closing form under that doctrine. The stem scans
already show every round, so no compiled history belongs in either closing
body. Commit-scoped rounds use their separate settlement rule.

## Growth-pattern tags

Every finding carries a growth-pattern tag naming the patterns in `../plan/GROWTH-PATTERNS.md` it
could violate, by their labels: `[growth-pattern:hardening]` for one,
`[growth-pattern:hardening,unpriced-complexity]` when more than one could apply, listed in pattern
order, and `[growth-pattern:none]` when none does. The token names the pattern list rather than
bare growth, because the subject's growth mark measures how much burden a commit added and this tag
names which kind of unwanted growth a finding suspects. What is
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
it blocks nothing. A finding tagged `[growth-pattern:hardening]` still lands. So
there is no reason to suppress one. The tag's cross-round signal lives in
the run; a single risky finding prices its own trade inside its trade
block, per the finding explanation rules, and still lands.

Apply [History reads](#history-reads) to these tags. Each finding keeps its own
trade assessment; the watch judges the cross-round signal.

## Reach and complexity

Every finding carries a reach and a complexity token beside its growth-pattern tag,
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

One burden scale serves commit marks, findings and yield reports. It gives up
the kind signal a kind-based commit grade carried. It is a deliberate
exception to the plan doctrine's mechanical-grading principle: scope, evidence
and output remain prescribed, while burden size is judged. The account makes
disagreement inspectable; it does not make the scale mechanical.

The commit subject's leading mark runs this measurement over a whole commit, with the same level
spellings: `growth-low` is `low`, `pruning-high` is `minus-high` and `growth-none` is `none`.
Severity and reach stay separate from complexity. [Severity sequence](#severity-sequence) owns the
mark's meaning and the subject grammar owns its form. Replace the old definition directly, with no
date-based grading, historical conversion, episode split or extra inspection duties for old marks.
Do not rewrite Git history.

The two tokens are one pair, and the pair is the point. Growth pattern 6 in
`../plan/GROWTH-PATTERNS.md` says a user-facing cost vetoes while a complexity cost never does, and
its test is to name the trade: what the work gives the user against what its machinery costs. The
pair fires that test on every finding, so a cross-round run of `[reach:developer]`,
`[reach:very-rare]` or `[reach:rare]` beside `low`, `medium` or `high` `[complexity:...]` values on
the same machinery is the unpriced trade shown in the log for the watch to judge. A `minus-` value
is the opposite signal: the correction removed more burden than it added, which counts in its favour
and never joins a priced run. The tokens describe reach and net burden, not worth. Like the
growth-pattern tag they block nothing on their own. Their one use in settling a choice is the
second case under [Real choices](#real-choices): on a rare finding, the option with the least upkeep
wins. The vocabulary has one spelling across both logs. A run can also supply evidence for a new
growth pattern, including work no listed pattern matches. The tokens rate facts rather than worth: a
round that scored its own proposed correction would be grading its own work.

## Head drift

Vet, rebuttal and fix compare each audited head in the report opening with
`git rev-parse --short HEAD` in that repo. Check each repo independently when
the report judges both repos. When a head differs, list the changed files with
`git diff --name-only <sha>..HEAD` in that repo. Inspect the intervening diff
for the artifact and every source a finding or verdict relies on, then ground
the answer or correction against those files at HEAD.

Judge against HEAD even when the tree has moved. A quote mismatch explained
by that diff is a claim about earlier text, not a grounding failure. Each
phase owns its response when the current text changes or resolves a finding.

## Vet checks

Resolve the vet's input and output under [Manual phases](#manual-phases), using
the current writer tag. Automated invocations use their supplied paths unchanged.

The vet is read-only and lands nothing. It runs no command that changes a
tracked file, including formatters. Its verdicts inform reconciliation;
corrections belong to the phase that completes the round. This separation
keeps the independent check from applying its own proposals.

Never vet a report whose tag's vendor letter is your own assistant. The vet
checks audit-findings from a fresh context in the other assistant. Continue
only when the user explicitly says to.

Check the trade under [Finding shape](#finding-shape). The explanation may be
part of the audit-finding's prose. Verify the simpler mechanism, cost, benefit
and any claim that the choice is settled against their sources. Return Revise
for missing substance, not for missing labels or separate parts. When the
correction is the simplest mechanism, verify that claim and the cited boundary
or decision against the sources. When that claim cites a plan decision, reopen
it only with evidence that the decision is wrong; otherwise accept it.

Check the audit-finding's rarity against its cited evidence. A choice about
cost that is real under [Real choices](#real-choices) goes to the user's
ruling; the vet never settles it. When the choice is settled there, the
vet-verdict carries the winning option as the correction instead.

## Real choices

A choice about cost goes to the user's ruling only when it is real. Weigh each
option on every cost the evidence shows: build and upkeep, what people using or
developing the app meet and any risk, such as an extra provider charge. Doing
nothing counts as an option. An option that breaks a boundary entry drops out.
Check each cost against its sources first. A cost that is the same in every
option does not count.

The choice is settled in two cases:

1. One option is at least as good as every other on every cost. A cost the
   evidence leaves unclear rules this case out.
2. The audit-finding's reach is `rare` or `very-rare`. The option with the
   least upkeep wins: the lowest net burden under
   [Reach and complexity](#reach-and-complexity). Doing nothing and changing
   only the wording count as options. On equal upkeep, the option better for
   people using the app wins. Waiting for a ruling on a rare case costs more
   than its answer is worth.

The winning option becomes the audit-finding's correction. Any other choice is
real. A boundary entry or recorded user decision still settles a real choice,
under [Finding shape](#finding-shape).

Every phase that grounds the item applies this test: the vet before it refers
an item, the rebuttal when it answers a referral and the fix during
reconciliation. A referral is a claim like any other vet-verdict, and a later
phase overturns it on evidence it has read. A ruling on a settled choice costs
the user a reading and a resumed fix and decides nothing.

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

Return the complete vet-verdicts in the final response. When hand-run, also
write the same text to the supplied vet path. The twin is untracked and
gitignored, so that write keeps the vet's read-only rule intact.

## Rebuttal grounding

Read the report end to end, then the supplied vet twin. Follow
[Head drift](#head-drift) and say where a moved file changes an answer.

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
the numbered vet-verdicts.
Every rebut-answer starts with exactly `<audit-finding number>. [<tier>] <rebut-answer>`.
Use the report's audit-finding number and A/B/C/D tier. The rebut-answer is exactly one
of `Agree`, `Contest` or `For user's ruling`.
The first line contains nothing else, for example `1. [B] Agree`.
Conditions, notes and required explanations follow on separate lines.
An unconditional Agree with no additional notes ends after the first line;
do not repeat the audit-finding title, evidence or reasoning. Other rebut-answers
use a few short sentences. Every rebut-answer is one of three kinds.

- Agree. The vet-verdict stands. Add further information only when agreement is
  conditional or there are additional notes. Agreement with a revise carries
  the revised correction in full as a note so the fix phase has one text to
  apply. Agreement with a drop needs no explanation unless there is a condition
  or an additional note.
- Contest. The vet-verdict rests on something the vet misread. Quote the
  evidence, name its file and line or its plan section, and state what the
  vet-verdict should have been. Contest only on evidence the vet can go and
  read. A disagreement of taste is not a contest; it is an agree with a
  note. Contest a referral to the user's ruling when the choice is settled
  under [Real choices](#real-choices). Name the option that settles it and
  the evidence for each cost.
- For user's ruling. The vet sent the item to the user under its
  recorded-decision or trade rules, and the choice is real under
  [Real choices](#real-choices). State the auditor's position and its
  evidence in the same short form, and stop there. Never settle it here.

Return the complete rebut-answers in the final response without a grouped
closing list. When hand-run, also write the same text to the supplied rebuttal
path. The twin is untracked and gitignored, so that write keeps the rebuttal
read-only.

## Reconciliation

Build the outcome from the numbered vet-verdicts and rebut-answers, accounting
for every audit-finding. An unconditional accept stays agreed without a rebut-answer.
Present agreed vet-verdicts, your decisions on contested vet-verdicts and items
for the user's ruling. For each contested vet-verdict, read the evidence yourself,
decide the outcome and state your decision and reason. Ask the user only when
the evidence leaves the answer unclear; disagreement alone needs no ruling.
Never re-argue an agreed vet-verdict.

When the report has a vet twin and no rebuttal, and every vet-verdict is an
unconditional accept, the runner skipped the rebuttal because the auditor had
nothing to answer. Present the audit-findings as agreed by both assistants, say
that the vet accepted every audit-finding, and do not re-answer the vet-verdicts. When
the vet twin holds any other vet-verdict and no rebuttal exists, answer each
vet-verdict here: agreement carries it into the outcome, disagreement names the
evidence the vet misread. Present the same three groups. Without a twin,
present the report's audit-findings in their numbered order with any drift
corrections from the fix phase's current-source grounding.

The user reads along and rules by exception: a go on the presented outcome
is the acceptance, and a reservation on any item reopens it, including a
reservation the report never raised. Ground a reopened item the same way
before answering it.

One kind of audit-finding is not covered by accepting the round as a whole, in a
vetted round and an unvetted one alike: a real choice about cost needs its own
answer, whether the report explains it in the audit-finding's prose or a
separate trade block. List these apart in the presentation. Apply
[Real choices](#real-choices) to every item sent to the user's ruling, whether
or not the rebuttal contested the referral. Present a settled choice like a
decided vet-verdict: its correction and the evidence for each cost.
When the user picks the simpler mechanism, that mechanism becomes the
audit-finding's required correction, revised in the discussion like any other
revision. When that ruling overturns a reason the plan records, the round
carries the correction and the user's reason as a cross-repo audit-finding, so the
plan correction is applied or deferred without re-derivation. When the user
keeps the machinery, the same record carries the ruling and its reason. The
audit-finding about code then follows the normal path: a correction the ruling leaves
standing is applied, and an audit-finding the ruling dissolves is omitted from the
record.

A cross-repo audit-finding the report left as an open choice is put to the user
here. When the user rules, carry the answer and its reason in the deferral.
When the user does not rule, keep the choice open in the deferral instead of
choosing for them.

The route's approval rule grants the corrections settled above. Planning uses the
[planning round completion rules](../../../plan/.agents/references/planning-rules.md#round-completion);
implementation uses its fix invocation's grant. Stop for a ruling only on open items:

- An item sent to the user's ruling whose choice is real under
  [Real choices](#real-choices).
- A contested vet-verdict the evidence leaves unclear.
- A drift correction that changes an audit-finding.
- A vet-verdict without a rebuttal that this session cannot settle from the evidence.

When nothing is open, state the outcome in one line per audit-finding and apply.
An undirected cross-repo choice outside the judged repo set is not an open
item blocking this fix. Its outcome follows the deferral above, so it holds
no settled correction back. Keep it open in
the deferral and apply the settled audit-findings.

## Round yield

This tally applies to implementation audit reports and to every round record
in both repos, planning records included. The lines count the reach and
complexity tokens every record's bullets already carry, so both repos keep the
same record body.

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

For a round record, recount only the accepted findings in that record using
their final reach and complexity values. Put both lines at the end of its
body. The report is removed after completion, so the record is the durable
home for that yield. A clean record carries zeroes in either repo.

The tally exists because the decision to run another round needs the round's
yield, and reading it out of per-finding tokens means re-reading the whole log
by hand. It answers what a round bought: findings an end user can meet, and
whether the corrections left the code with more maintenance burden or less.
Both lines are counts over the findings, unlike the commit subject's leading
`growth-<level>` or `pruning-<level>`, which measures one commit's own code
before and after.
The two answer different questions and neither replaces the other.

## Report format

### Audit delivery

An unattended audit returns the complete report under
[Runner result](#runner-result); the runner saves it at the supplied path.
A hand-run audit presents the report, writes the same text to its resolved
path and says so. Chat and file must not differ. Resolve a missing output path
under [Manual phases](#manual-phases). The report and claim are gitignored,
so writing them keeps the source files unchanged. With no findings, follow
[Direct clean completion](#direct-clean-completion); otherwise the audit ends
at its report and the route's discussion or review follows.

### Audit notes

A report holds only the parts its kind lists below, in that order, and nothing
precedes its opening. A planned edit that no audit-finding asks for, such as
user-directed work, joins the opening so the vet can check it. Material for the
next round goes in the round's handoff. An audit-finding dropped under the
route's own rules stays out of both.

Those parts are the whole account of the round's checking. The coverage table
shows what an implementation round inspected, and an empty finding field is the
verdict that its checks passed. So a report lists no passed checks, files read
or verified claims, and it narrates no other verification. Evidence appears only
inside the finding it supports. No phase reads such an account, and it repeats
the coverage table.

Chat carries nothing about the judged work that the report or handoff does
not. Setup and tooling problems are not about the judged work and stay in chat.
A note only in chat reaches neither the vet nor the fix.

### Implementation reports

Open by naming `Implementation audit workflow` and include exactly one plain line:
`Judged repos: plan@<sha>`, `Judged repos: repo-edu@<sha>` or
`Judged repos: plan@<sha>, repo-edu@<sha>`. Use each judged repo's short audited HEAD. Repos read
only as evidence stay outside that line. It selects the repos for vet, rebuttal, fix and clean
completion. The filename holds the writer tag; do not repeat or look up that tag for the opening.
Follow it with exactly one plain line in one of these forms:
`Stop recommendation: stop. <reason>` or
`Stop recommendation: continue. <reason>`. The reason judges whether the next
round on the same scope is likely to find something worth its cost. It weighs
this round's findings and earlier same-scope records against the supplied stop
conditions, gives one answer rather than a menu and never replaces the user's
stop decision. Then name the plan file, its ready commit and the implementation
commits inspected. State the round's user-set scope: the whole plan, one step or
one step range. Then report the coverage table, its coverage line and the
**Round yield** lines, followed by the finding field.

Every finding, including a cross-repo finding, belongs in one `## Findings`
field. A field with no findings contains exactly `No findings.` instead of
finding blocks. A report with only deferred findings still has findings.

### Planning reports

Open by naming `Planning round workflow`, the artifact and widening or detailing phase.
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

   [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none]

   The report rule and its example name different files. The vet cannot resolve
   the example. Align the example with the rule.

Use the same block shape for a planning finding, with its planning metadata:

1. **C: Conflicting report names**

   <!-- rumdl-disable-next-line MD013 -->
   [field:missing] [section:report-file] [growth-pattern:none] [reach:developer] [complexity:none]

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
behaviour shipping. Reach can settle a choice under [Real choices](#real-choices) and never changes
the tier.

At tiers A to C, explain the trade when a finding's growth-pattern tag is not `none`,
its reach is not `ordinary` and its complexity is `low`, `medium` or `high`.
State the simplest
mechanism that works within `../plan/BOUNDARIES.md`, what the proposed machinery
costs to build and own, what it gives the user over that mechanism and whether a
boundary entry or recorded user decision settles the choice. Deletion or doing
nothing counts when either is enough. Name the concrete obligations and their
interactions rather than repeating the complexity token.

Keep this in the finding's explanation; a separate `Trade:` block is optional.
When the correction is itself the simplest mechanism, one sentence saying so
and naming the boundary or decision that settles it is enough. Expand only for
a real unresolved choice. D-tier findings need no trade explanation.

Check the simpler mechanism against the plan's recorded reasons and the code.
When a reason still rules it out, say no simpler mechanism works. When the reason
looks wrong, quote it and give the evidence against it. The plan can settle
whether a mechanism works; only a boundary entry or recorded user decision
settles a real choice about whether machinery is worth its cost. This preserves
the anchor-rule protection in `../plan/GROWTH-PATTERNS.md`. A choice that stays
real under [Real choices](#real-choices) goes to the user under
[Reconciliation](#reconciliation).

This rule's case: it applies when an A- to C-tier finding meets all three
trigger conditions above. Most plan findings sit at the floor values. The plan
log shows one to five firings per episode. Without the rule the tags flag a
trade nobody prices. At plan commit `9fcfbbe`, a finding carrying all three risk
tokens added outside-work check machinery to a plan. The audit and vet both
passed it without pricing the trade. Plan commit `e4887e3` spent a full round
undoing it. Accepting that outcome was rejected because each undo round costs
more than the trade explanation. The tokens already carry the signal; the rule
makes it actionable when it fires. Each firing charges a short trade
explanation and a vet check. A real unresolved choice also needs the user's
ruling. Findings at floor values pay nothing.

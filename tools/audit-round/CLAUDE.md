# CLAUDE.md

This is the private planning and implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal, fix and brief sequence, the reply a fix's open
  item needs and the watch that follows a finished planning or plan-scoped implementation round. It
  retains the audit result and report as local values. Audit, vet, rebuttal, fix and brief start
  fresh. A clean audit completes directly through `clean.ts` without any later phase, glance or
  watch. The coordinator reads the report through `report.ts` to decide whether it is clean. A vet
  that accepted every finding without a condition skips the rebuttal the same way, because the
  auditor has nothing to answer; the fix then reads the report with its vet twin alone. The
  coordinator reads the twin through `vet.ts` to decide whether every finding was accepted
  unconditionally. Rebuttal uses the audit's resolved model and effort, including `--auditor`
  fields, because it is the auditor's answer. Its workflow grounds answers in current sources. The
  settings file selects the default auditor, the fixer and the assistants that write documents.
  The brief follows only a finished fix, after all rulings and resumed fix invocations have
  completed. Only `--brief` adds that phase and its settings row to every round. Its input is the
  round transcript, never the report, and its workflow belongs to the Repo Edu root. `runBrief` runs
  that one phase on its own over an earlier transcript. The fix receives a ruling output path
  separately from its report arguments. It writes the final ruling and checks it for clarity before
  returning `needs-ruling`. The runner checks that file, then displays it and collects a reply
  without running the brief. A missing or empty ruling fails the fix with its recovery session. The
  same fix session resumes in the background with that reply. Further open decisions repeat this
  route. A completed fix follows the same report closure, commit checks, brief and watch as an
  uninterrupted fix. Stopping without a reply retains the round files and reports the fix's recovery
  command and ends the auditor sequence. A submitted reply lets a completed round continue any
  remaining auditor entries. Further open decisions replace the ruling in that same session under
  [Writing a ruling](../../.agents/skills/fix/references/ruling.md). No separate ruling phases run.
  `runWatch` owns the watch that follows a round: the glance decides from the commit record and the
  watch's own history whether a watch is due, and only a due glance runs `watch` to write the
  finished document. The audited plan's stem comes from `planStem` and selects both the glance
  record and joined watch evidence. Only a due glance computes and formats that evidence, once after
  the fix. Only the writer's prompt receives the snapshot separately from its file arguments. The
  glance is a dependency the runner supplies from `glance.ts`, not a phase, so a not-due round
  starts no session for it. The watch writer owns both the judgement and final wording. Its model
  and effort live in `settings.json`, beside the brief's settings. The watch runs only after a plan
  round with audit findings that finished, because a round awaiting a ruling has not proved its work
  landed; nothing is lost, since the glance counts audit correction commits and not rounds. A round
  given no watch target, which is what `--no-watch` does, consults no glance at all. The watch reads
  the commit record and never the round, so `runWatch` passes it no transcript and no report. After
  the watch finishes, `runWatch` reads back the grade it recorded; a watch that leaves no readable
  entry fails its phase. A finished round reports that grade, and the command runner ends the
  auditor sequence on red, so no queued round starts before the user acts on the watch. A
  finished round reports whether its audit had no findings and carries the report's stop
  recommendation, independently of any clean record the fix lands. The command runner prints every
  completed implementation recommendation. A clean audit or stop recommendation skips later
  entries that resolve to the same assistant, model and effort; a continue recommendation skips
  none. The round records both repositories' HEADs before the fix and validates every landed
  subject under its repository's grammar. A plan target fails when a finished fix landed no commit.
  A commit target may land nothing. Reader failures retain the owning phase and its session for
  recovery. As soon as a fix returns `finished`, the coordinator closes the report set through its
  dependency, before reading landed subjects or running the brief. Other outcomes retain the set.
- `clean.ts` owns direct completion when the audit report has no findings. A
  plan target lands one empty clean record in the sole judged repo or in
  Repo Edu when both repos were judged, using the report's judged-repos
  opening and the audit's actual model record and capability tag. `git commit --only --allow-empty`
  preserves staged work while using the normal hooks and signing settings.
  A commit target lands no commit. Both routes retain their report and leave
  existing handoffs untouched. Completion failures stop the run without a
  fictitious fix session or resume command. `target.ts` supplies the plan stem
  shared by output naming and clean records, including archived plans.
- `report.ts` uses `mdast-util-from-markdown` to read the document-level opening and finding fields.
  It reads the implementation report's one plain stop-or-continue recommendation and reason beside
  its judged repos. Planning reports have Excess functionality and Missing functionality fields;
  implementation reports have one Findings field including deferred findings. Each holds numbered
  finding blocks or its exact empty-field sentence. Quoted evidence and code blocks supply no
  findings. `vet.ts` reads the
  fixed verdict lines and requires the report's finding numbers in order. Only Accept verdicts
  with no following conditions skip the rebuttal.
  Both readers are supplied through `RoundDependencies`, alongside the HEAD and subject reads.
- `phase.ts` owns who runs each phase of a round and on what, and the capability tag's whole
  vocabulary in both directions: the letters a subject spells a phase with and `parseAuditor`, which
  reads each assistant name or partial tag in the `--auditor` list. Assistant names bypass audit
  model and effort pins to inherit the CLI settings. The three alphabets share no letter, so a
  partial tag says which fields it named. `roundPhases` is the one owner of the round's phases: the
  runner invokes from the value it returns and the run's settings header prints the same value, so
  what a round says it ran on is what it ran with. A phase names a model, an effort, both or
  neither; a named field runs on what it names whatever the CLI is configured to use, and an unnamed
  one follows that configuration. `settings.json` owns phase selections and the model tier table.
  `settings.ts` loads and validates it once at command entry, independently of the working
  directory. That configuration is passed through routing, output naming and commit stamps.
  `--auditor` overrides each field it names, using the configured tier table for its model. Both
  audit settings and command-line overrides bind the audit and rebuttal together, because the
  rebuttal is the auditor's answer. Each named field carries what named it, so the report never
  guesses, and either CLI accepts one. It also defines the private inputs and results for assistant
  invocations, and the shared workflow and launcher selectors, and owns which phases' texts enter
  the round transcript: only audit, vet, rebuttal and fix. The brief, ruling and watch are separate
  documents. The fix writes the ruling; the brief and watch run once the transcript holds the round.
  Assistant boundaries own processes, stream validation, session observations and phase output. They
  return only after accounting for the process, streams and required record writes. A failure
  retains the known session identity, including a resumed session whose new invocation reported no
  identity.
- `episode.ts` owns episode membership and history facts for the glance and
  joined watch evidence. It joins historical stems, includes rework touching
  the topic's artifacts and retains both repositories' heads and anchors.
  `episode-log.ts` reads Git's commit dates, bodies, touched paths and renames.
  `episode-facts.ts` derives severity, token counts and repeated-growth evidence
  without grading them. Every member keeps its complete findings or an
  unreadable reason; unreadable findings contribute no partial counts. Current
  areas resolve directly, retired areas resolve through `splitFrom` and unknown
  areas remain listed on their findings. Redesigns and widening renames identify
  possible new graded windows for the watch to judge. `readWatchEvidence`
  joins both histories and `formatWatchEvidence` serialises the evidence for
  the runner and hand-run command. It resolves a hand-run commit target as an
  explicit anchor in whichever repo holds its SHA; HEAD forms mean Repo Edu.
  The peer keeps its own anchor. Without a target it takes the newest stem
  commit across both histories by commit date. No episode
  file is written.
- `glance.ts` owns the rule that decides from an episode and the watch record in
  `watch.json` whether the trajectory watch is due. The episode uses a supplied
  topic from the audited plan for every runner glance. The episode reader
  also serves hand-run default-topic resolution. Each
  file-changing audit correction commit for the selected plan counts once per area
  with an A–C correction, across all step scopes. Off-plan work and other plans'
  audits remain watch evidence but do not advance the count.
  Repo Edu groups by finding area and planning groups by finding section.
  D-only work, clean records, deferral-only records and planned steps do not count.
  Green waits for three audit correction commits in one area and amber waits for two. Red runs
  after every finished round with audit findings. Clean audits never call the
  glance. Severity, reach and growth have no early trigger.
  A subject the grammar refuses or an unreadable finding set supplies no
  correction count. The episode retains the unreadable evidence. The watch record is read as
  data: a missing, unreadable or old-format entry, or a recorded head off HEAD's
  history, is no record. No record reads as green and counts from the episode's
  anchor, the earliest commit carrying the stem. Unstemmed history has no eligible
  audits, so a first round never earns a
  watch by being first. The decision's sentence opens its own section of the
  log and the terminal as `[glance]`. `readWatchGrade` reads back the grade a finished watch
  recorded for the runner's sequence decision.
- `findings.ts` reads the complete current bullet form for commit hooks and
  episodes, D included. It validates token values without consulting the area
  model. `commit-msg.ts` checks primary and cover IDs against the current model
  at write time. `sequence.ts` derives severity from the strict read and
  fills the subject's severity slot under its role and repository rules. The
  growth mark remains authored and is required beside every sequence outside a
  deferral record.
- `subject.ts` is the one reader of the commit subject grammar in
  [the subject grammar](../../.agents/references/subject-grammar.md): it parses a subject under
  either repository's form, names the class it matched and refuses with the first slot that does not
  fit. The commit hooks and the glance both read through it. Its loose form read, the first token
  split at its slash, is the one read that reaches subjects older than the settled grammar, because
  episode scoping and auditor stamping need nothing else from them. `commit-msg.ts` is the hook's
  rule: it replaces a record's auditor tag with `COMMIT_AUDITOR` when the runner supplies it. It
  derives severity from the graded bullets before parsing the subject. It replaces the body's
  opening with `COMMIT_PHASES` when a round supplies it and requires a model line otherwise. It
  refuses a single-model record whose effort disagrees with the tag. `commit-msg-main.ts` is the
  entry both repositories' hooks run, `<repo-edu|plan> <message file>`; a refusal names the grammar
  file.
- `assistant.ts` owns one invocation's session identity, final text and completion evidence.
  After validating completion, it saves audit, vet and rebuttal reports
  from the final text without the result line. A failed write fails the phase before progression.
  Context measurements pass directly to the terminal display's observer.
  Claude and Codex decoders validate the fields they consume.
  `cli-process.ts` owns the child's environment and stops the child before unwinding a failed line
  consumer, because Execa's iterator return awaits the child. It then awaits all readers and the
  process. Process output is never accumulated by Execa. Every child carries the round's commit
  stamps, overriding any inherited ones, so a phase that commits records the round that ran rather
  than whatever started it. The stamps are read when the child starts, from the output's record
  of the phases that have run, so a clean round that skipped the vet and the rebuttal stamps
  neither into its record, and an accepted vet's round stamps no rebuttal.
- `codex-session.ts` reads the current session's appended records. A resumed
  fix starts at the file's pre-invocation end. An
  incomplete record stays with the reader until more bytes arrive; a final
  incomplete record fails the invocation.
- `ruling-input.ts` owns the reply reader through Node's `readline`. A blank line
  sends a non-empty multiline reply. Ctrl-C, end of input and cancellation discard
  an unfinished reply. Non-terminal input supplies no ruling. The assistant never
  inherits the terminal. Reply recording completes before the fix can resume.
- `startup.ts` owns where the `audit-round` cache lives and holds its update dates.
  `resolveCacheRoot` is that one owner, so the update stamps and the watch record the glance reads
  resolve the same way. The watch workflow owns `watch.json`: each episode records both
  repositories' graded heads beside one grade and written date. The glance counts from the plan head
  for planning rounds and the Repo Edu head for implementation rounds. Both update checks precede
  settings discovery. Codex compares its installed version with the standalone installer's release
  channel before running its updater. A current or newer installation is kept. An update is
  successful only when a fresh version read reaches the checked release or a newer one. Installer
  output is retained for failure diagnostics, since its success banner does not prove a version
  change. Failed checks and unverified updates leave the date unstamped so the next run retries.
  Settings discovery reads each CLI's default selection. It also asks Claude for the release of each
  model a round's phases may pin, as `namedModels` derives them from `roundPhases`, because a family
  alias names whichever release is current. Codex runs a named model under that name. Claude control
  requests and the short-lived Codex settings connection start no LLM turn.
  `requests.ts` owns headless and manual recovery arguments, including `--approve-for-me` on every
  Codex phase and resume command and a named model and reasoning effort: Codex takes them before any
  subcommand, so a resumed phase keeps them, and Claude takes `--model` and `--effort`. A fix
  awaiting a ruling and a failure both carry their phase, so continuation and recovery use the model
  the round ran that phase on. Claude uses `--permission-mode auto` in settings discovery and every
  session entry, and that discovery names no model of its own. `requests.ts` also supplies each
  fresh phase's selected workflow and whole files listed by the workflow's
  `reads` header. Header paths resolve from the workflow file. `vfile-matter` parses the header and
  `zod` checks its shape. Listed workflows supply their own reads recursively, with each source
  included once. Audit, vet, rebuttal and fix also receive their home launcher. Brief and watch
  have no launcher; their workflow headers list the `simple` definition directly.
  Resumed sessions receive no files again. Root
  instructions are not listed. Both assistants receive their phase prompts on standard input. Codex
  command-line arguments contain no prompt text, including on resume, so joined evidence is not
  limited by the operating system's per-argument size. The same collected file list produces a
  separate log prompt containing source paths with an omission notice in place of file contents.
- `output.ts` owns terminal presentation and incremental run recording. A run description names the
  run, lists the phases it may run and locates its files: a round records a log and transcript pair,
  and a brief on its own records a log beside the transcript it retells and keeps no transcript of
  its own. It uses `round-paths.ts` for file names and round identity. It validates all file-writing
  phase tags before `run-files.ts` exclusively creates the tagless claim, then opens the transcript
  and log. The claim remains after success or failure, and a conflict stops without retrying. Each
  entry carries its phase, so the settings header reports the model and effort that phase will run
  on, each in its own aligned column. It names what set each of them: `--auditor`,
  `audit-round settings` for the phase's own pin, or `CLI default` when the phase names nothing. A
  phase whose two fields came from different places names both, model first. A pinned model reads as
  the release its CLI resolved it to at startup, so every row names a release. The output holds only
  the run start, current phase timing, context observations and each started phase's model
  selection. A phase starts with its launch selection, then its CLI's model feedback replaces it.
  Commit stamps use those phase selections. Every status stamp shows the phase's elapsed time and
  the round's total. Every logged tool line opens with its step's own time, the assistant time since
  the previous tool line or since the phase start for the first, followed by the round's total
  assistant time. `run-clock.ts` owns what those readings count. A round measures its assistants, so
  time the user holds is not the run's. Displaying the ruling opens a wait and submitting or
  cancelling the reply closes it. Each phase and the run read the same waiting total through their
  own mark, so one rule serves every reading. Two baselines measure context growth: a written status
  stamp reports the tokens added since the previous written stamp, and a logged tool line reports
  the tokens added since the previous tool line, beside the time since it. Both chain into the
  totals beside them; a fresh phase starts its stamp baseline at zero and a resumed phase reports no
  first change. `run-files.ts` completes each required write before returning to the invocation; no
  complete transcript accumulates in memory. `terminal.ts` renders assistant Markdown through the
  `pi-tui` Markdown component at the current terminal width, preserving paragraph spacing, nested
  lists and source finding numbers. It uses cyan for inline code without background blocks and
  honours `NO_COLOR`. It writes the rendered document directly and uses log-update only for the live
  status line, so permanent text is not wrapped twice. Redirected output retains the original
  Markdown. The log records each tool invocation once, with shell wrappers removed and no event
  envelopes or result payloads. Invocation lines stay complete in the log; assistant texts stay
  complete in Markdown. Only terminal tool lines shorten. The terminal omits the final
  `PHASE RESULT` control line; the transcript retains it. `showBrief` renders the saved brief after
  validation and appends it to the log, keeping it out of the transcript it retells. The brief's
  assistant text is not displayed, so a writer echo cannot duplicate the saved document. Both full
  rounds and standalone briefs use this route. `beginRuling` releases the live status display and
  renders the fix's ruling. `endRuling` excludes the user's waiting time and records a submitted
  reply in the log and transcript before any resumed process starts. Assistant replies use the
  normal phase output, so launch prompts stay in the log and never reach the terminal. Supplied
  instruction files appear there by path only; their full contents go to the assistant.
- `round-paths.ts` owns the file-name grammar, target names, round allocation candidates,
  existing document resolution and report closure for both entry routes. It resolves `HEAD`
  in commit targets and scans the plan root for the next target-wide number. Automated rounds
  supply every phase path. A manual audit names only its claim and report; later manual phases
  retain that report's round and name their output with the current session's writer tag.
  `manualPhasePaths` returns the ordinary phase arguments and finds review inputs only within
  the exact round at the report's root. With no input, it selects the most recently modified
  eligible document at the plan root: the other assistant's audit for vet, the current
  assistant's audit for rebuttal or either assistant's audit for fix. Several reviews of one round
  resolve the same way unless one is selected.
  `closeRound` deletes only audit, vet and rebuttal files for that exact round, using recorded
  filenames without consulting model settings. `queueFile` names a plan target's
  `<target>-queue.md` beside its rounds. It carries no round number because it belongs to the
  whole sequence: one path stays valid across rounds, so an editor holding it open keeps editing
  the file the runner reads.
- `context.ts` resolves the installed Repo Edu checkout and its sibling plan root.
  It reads no invoking directory and carries no round kind.
- `target.ts` owns the argument grammar for automated rounds and `name`. A plan
  stem alone selects planning; a stem with a step, an increasing range or `all`
  selects implementation. Commit references select a Repo Edu commit audit.
  A commit-shaped plan stem keeps `.md` to identify it as a plan. Plan arguments
  drop `.md` and `-widen` and refuse paths with a stem example. `resolvePlan`
  prefers the active artifact at the plan root, then looks in the archive. It
  supplies the absolute plan path before any assistant starts. The audit workflow owns Git
  resolution and inclusive-range admission. The runner passes references
  unchanged and rejects multiple auditor entries for commit targets, which run once without
  a trajectory glance or watch.
- `default-target.ts` owns the target of a round or `name` given none, under the shared
  protocol's [Omitted targets](../../.agents/references/round-protocol.md#omitted-targets). It
  reads both histories through `stemCommits`, the same newest-first order the hand-run episode
  uses, skips plans without an active artifact and parses the newest remaining commit strictly.
  The selected target passes through `auditTarget` as a typed one would. `defaultPlan` applies the
  same plan rule alone for the `plan` command, which the home plan brief runs for an omitted stem.
- `command.ts` owns the command grammar, startup and final reporting, including the `--auditor`
  option. It reads that value with the queue's entry grammar and refuses a list with no entries. The
  round is the command itself, taking the target as its own arguments. Its subcommands are `brief`,
  `name`, `paths`, `close`, `episode` and `plan`. `plan` prints the plan an omitted target selects,
  as JSON, and writes nothing. The `episode` command prints joined watch evidence from the shared
  reader and formatter without settings discovery, assistant startup or file writes. The `name`
  command claims a round and prints its claim, workflow, working checkout and audit arguments. Its
  required `--auditor` is the hand-run session's full tag, including `u`, checked separately from a
  round's model request. The `paths` command prints the workflow, working checkout and argument
  paths for an existing report as a JSON object. It reads the report opening's named workflow to
  select its kind. Both commands bypass assistant startup and settings discovery; `paths` writes
  nothing. The `close` command uses the same closing function as the coordinator and starts no
  assistant or settings discovery. So the program carries an action handler, Commander adds no
  `help` command, and each command's own `-h` prints its help. A bare command line prints that help;
  options without a target take `defaultTarget`. It also owns the round sequence and its counter.
  The first `--auditor` entry, or the configured default when the option is absent, runs first. For
  a plan target the remaining entries seed the target's queue file, which the user may edit while
  rounds run. Between rounds the sequence takes the queue's first entry, so the queue is the only
  round limit. Every completed implementation round prints the stop-or-continue recommendation and
  its reason. An audit with no findings or a stop recommendation removes queued entries that resolve
  to that round's assistant, model and effort. Other settings remain, and a continue recommendation
  removes nothing. A fix that lands a clean record removes none. Failure, a round requiring a
  ruling, a red watch or an empty queue stops the sequence, and the queue file is
  deleted however the sequence ends. A commit target runs once and keeps no queue. Each round prints
  the queue's path and contents when it opens. Each round records its own file pair and the
  coordinator has no filesystem side effects: it opens one output per round, retires the previous
  one first, and reads updates and settings once for the whole run before opening any files. Startup
  messages go only to the terminal; the run log begins with the models table. A chained round
  carries its place in its title and independently claims the next number for its target. Required
  write failures stop phase progression. If recording itself fails, the emergency channel still
  reports the known session and recovery command.
- `queue.ts` owns the queue file's contents and the entry grammar `--auditor` shares: names or tags
  separated by commas, spaces or line breaks, each read by `parseAuditor`. Entries keep the user's
  spelling, so a rewrite changes only which entries remain. It resolves each entry through the same
  phase settings and startup model selection as the round, so ending signals compare the exact
  assistant, model and effort rather than the entry's spelling. The runner reads the file only
  between rounds, so an edit made during a round applies from the next one. A missing file reads as
  an empty queue. A malformed entry stops the sequence with an error naming the file and the entry.
- `contract.ts` invokes the same assistant and output boundaries with a probe
  prompt. It requires successful and deliberately failed shell calls before
  replacing any selected fixtures. It invokes no workflow and refreshes only
  this package's recordings.

The coordinator has no process, filesystem or terminal side effects of its own.
Its dependencies supply those operations explicitly. A returned phase failure
stops the sequence. A rejected phase invocation also stops it without retrying;
the invocation owner must release its resources before rejecting.

`phase.ts` owns workflow and launcher selection. Audit, vet, rebuttal and fix use the single
launcher set under the plan checkout's `home/`; their workflow follows the round's kind. Brief
and watch have no launchers; the runner supplies their Repo Edu workflows directly.
Planning sessions work in the plan checkout; implementation and commit sessions work in Repo Edu.
Every round file lives at the plan root. The runner names all input and output paths before the
audit. The runner saves audit, vet and rebuttal final responses; brief and watch sessions write
their own documents. Report phases finish only when their supplied output exists and is non-empty.
Claude receives the peer checkout as an additional directory; recovery commands restore the working
directory.

Workflows own findings, authority, gates and phase outcomes. The shared
Runner result rule in
`../../.agents/references/round-protocol.md#runner-result` defines their
meaning. Phase results carry only status and reason. The runner reads reports,
vet twins and the fix's landed subjects for routing and completion checks. It also reads
`HEAD` for naming and the log the glance counts; the audit workflow still
resolves the audited scope. Keep assistant adapters independent of the product
LLM adapters.

## Commands

### Model settings

Edit `tools/audit-round/settings.json` to change model selection for runs from
either checkout. Changes apply to the next invocation. This local file is
gitignored. When it is missing, the runner creates it from
[default-settings.json](default-settings.json), the version-controlled
defaults. An invalid file stops the command with a validation error and is
left unchanged.

- `defaultAuditor` selects Claude or Codex when `--auditor` is absent.
- `strengthModels` maps each assistant's base and top tiers to a model name.
  The same names classify reported models for capability tags. A family alias
  such as `opus` follows the CLI's current release; a full model name pins it.
  The settings header shows the release either one resolves to.
- `phases` sets each phase's model and effort. A `null` field inherits the
  assistant CLI's effective setting. A named model must suit the selected CLI.
- Audit and vet each have separate Claude and Codex selections, so changing
  auditor in a chain keeps each CLI on its own model. Rebuttal shares the
  audit selection. The vet uses the other assistant. Fix and the document
  phases each select their assistant, whoever audited.
- A field supplied by `--auditor` wins over the corresponding audit setting.
  Other fields use this file, then the CLI when the file says `null`.
- `--auditor claude` and `--auditor codex` inherit the selected CLI's current
  model and effort for audit and rebuttal, bypassing both audit pins in this
  file. Each list entry selects its own settings independently. Other phases
  keep their configured selections. Letter tags such as `a` and `o` still
  follow this file.

Tests supply an independent configuration through `configured-runner.ts` and
`fixtures/settings.json`. Neither changes to the local file nor changes to
the built-in defaults change the test inputs. Settings tests cover loading,
generation and validation separately.

### Invocation

Run from either checkout with authenticated `claude` and `codex`
commands available. Terminal Markdown rendering is bundled with the runner and needs no separate
executable. Set `NO_COLOR=1` to disable colour. Redirected output retains the original Markdown.

The terminal renderer is `@earendil-works/pi-tui`, replacing Glow. The accepted presentation keeps
tables aligned, preserves paragraph and nested-list spacing and uses cyan code references without
heavy background blocks. Preserve these qualities when changing terminal rendering.

```bash
pnpm audit-round example 1-3
pnpm audit-round example 3 --auditor a -v
pnpm audit-round example 3 --auditor atx
pnpm audit-round task-modifier all --auditor claude
pnpm audit-round task-modifier --auditor codex
pnpm audit-round example 3 --auditor codex,claude,claude
pnpm audit-round example 3 --auditor "atx, obm"
pnpm audit-round example 3 --no-watch
pnpm audit-round example 3 --brief
pnpm audit-round HEAD-1
pnpm audit-round HEAD-2..HEAD
pnpm audit-round --auditor codex
pnpm audit-round brief example-step-03..03-01-1-round.otm.md
pnpm audit-round brief
pnpm audit-round plan
pnpm audit-round name example 3 --auditor oth
pnpm audit-round name --auditor oth
pnpm audit-round paths vet example-step-03..03-01-2-audit.oth.md --writer abx
pnpm audit-round paths rebut example-step-03..03-01-2-audit.oth.md --writer otm
pnpm audit-round paths fix example-step-03..03-01-2-audit.oth.md
pnpm audit-round close example-step-03..03-01
pnpm audit-round episode example
pnpm audit-round episode HEAD-2
pnpm audit-round:contract
pnpm audit-round:contract codex
```

The round names the report, vet, rebuttal, brief, ruling and watch before the
audit starts. It writes the tagless claim, transcript and log at the plan
root. Phase files use `<target>-<round>-<order>-<kind>.<tag>.<ext>` under
the shared round protocol, with the transcript and log sharing `1-round`.
Each phase receives the complete paths it reads and writes in protocol order.

`name` prints one JSON object with `cwd`, `workflow`, `claim` and `arguments`.
The arguments hold the report path followed by the resolved target and scope.
It creates only the claim. It does not load settings or start an assistant. Its argument grammar
is the same as the automated round, from either checkout. Without a target, both repeat the newest
unfinished audit under the shared protocol's
[Omitted targets](../../.agents/references/round-protocol.md#omitted-targets).

`paths <vet|rebut|fix> [input]` resolves a later manual phase and prints its working checkout,
workflow and arguments as one JSON object. Vet and rebuttal take `--writer <full tag>` from
the current session. Fix writes no phase report and needs no writer tag. Without an input, the
command selects the most recently modified eligible file at the plan root. Several reviews of
that round resolve to the newest unless `--vet <file>` or `--rebut <file>` selects one. The
command writes nothing and never
claims another number. The shared round protocol owns manual invocation details.

`close` deletes the audit and twins for its exact target and round at the
plan root. Claims and runner documents remain.

The brief writes a plain-words twin only after the full fix has completed, then prints the saved
document in the terminal. Only `--brief` runs it, for every round, without changing the watch. A
clean audit records its outcome directly and retains the report, without later sessions. A fix that
stops for a ruling adds a ruling twin. A finished plan round with audit findings ends with a glance
at the commit record, and a due glance adds a `-watch.md` document. The watch keeps its own history
in the shared cache, which is how its cadence survives between rounds, and `--no-watch` skips both.
`brief` accepts an earlier transcript at the plan root, or takes the most recently modified one when
none is named. It reads its kind from the transcript title, writes beside it without claiming a new
number and overwrites its standalone log on each run. `--auditor` accepts one selection or a
sequence on the named plan scope, separated by commas or spaces. Repeated entries request separate
rounds. The entries after the current round wait in `<target>-queue.md` at the plan root. Edit it
to add, remove or reorder rounds; the runner reads it between rounds and deletes it when the
sequence ends. An empty or deleted file ends the sequence after the current round. Every completed
implementation round prints its recommendation and reason. A clean audit or stop recommendation
skips queued entries with the same resolved assistant, model and effort; other settings remain. A
continue recommendation skips none. Failure or leaving a ruling without a reply stops the sequence.
A submitted reply resumes the fix, then the queue after the round completes. Each header records
the round's start time; filenames carry no timestamp.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use child processes and the recordings under
`src/__tests__/fixtures`. Ordinary tests make no live model calls.

# CLAUDE.md

This is the private planning and implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal, fix and brief sequence, the reply a
  fix's open item needs and the watch that follows a finished planning or plan-scoped implementation
  round. It retains the audit session and report as local values. Audit, vet, fix and brief start
  fresh. A clean audit completes directly through `clean.ts` without any later phase, glance or
  watch. The coordinator reads the report through `report.ts` to decide whether it is clean. A vet
  that accepted every finding without a condition skips the rebuttal the same way, because the
  auditor has nothing to answer; the fix then reads the report with its vet twin alone. The
  coordinator reads the twin through `vet.ts` to decide whether every finding was accepted
  unconditionally. Rebuttal resumes the audit session only when that session's last measurement
  leaves room for a rebuttal before the assistant summarises itself in place. A measured shortfall
  starts the rebuttal fresh, because a summarised session holds a summary where the evidence was. An
  assistant that reports no window reports no shortfall and keeps the resume. `round.ts` owns that
  rule, the compaction share it compares against and the rebuttal's reserve. The settings file
  selects the default auditor and the assistants that write documents. Codex always fixes. The brief
  follows only a finished fix, after all rulings and resumed fix invocations have completed.
  Its input is the round transcript, never the report, and its launcher always
  belongs to the Repo Edu root. `runBrief` runs that one phase on its own over an earlier
  transcript. The fix receives a ruling output path separately from its report arguments. It writes
  the final ruling and checks it for clarity before returning `needs-ruling`. The runner checks that
  file, then displays it and collects a reply without running the brief. A missing or empty ruling
  fails the fix with its recovery session. The same fix session resumes in the background with that
  reply. Further open decisions repeat this route. A completed fix follows the same report closure,
  commit checks, brief and watch as an uninterrupted fix. Stopping without a reply retains the round
  files and reports the fix's recovery command. A round that required a ruling ends the auditor
  sequence even when the resumed fix completes. Further open decisions replace the ruling in that
  same session. The fix reuses established evidence and verifies only uncertain claims. It keeps
  the explanation proportional to the choice. No separate ruling phases run.
  `runWatch` owns the watch that follows a round: the glance decides from the
  commit record and the watch's own history whether a watch is due, and only a due glance runs
  `watch` and `watch-edit` over that draft. The audited plan's stem comes from `planStem` and
  selects both the glance record and joined watch evidence. Only a due glance computes and formats
  that evidence, once after the fix. Both watch prompts receive the same snapshot separately from
  their file arguments. The glance is a dependency the runner supplies from `glance.ts`, not a
  phase, so a not-due round starts no session for it. The watch edit takes the draft and the
  shared evidence snapshot. Both watch passes have their own model and effort in
  `settings.json`, beside the brief's settings. The watch runs only after a plan round with audit
  findings that finished, because a round awaiting a ruling has not proved its work landed; nothing
  is lost, since the glance counts correction commits and not rounds. A round given no watch target,
  which is what `--no-watch` does, consults no glance at all. The watch reads the commit record and
  never the round, so `runWatch` passes it no transcript and no report. A finished round reports
  whether its audit had no findings, independently of any clean record the fix lands. The command
  runner uses that result to skip later auditor entries for the same assistant. The round records
  both repositories' HEADs before the fix and validates every landed subject under its repository's
  grammar. A plan target fails when a finished fix landed no commit. A commit target may land
  nothing. Reader failures retain the owning phase and its session for recovery. As soon as a fix
  returns `finished`, the coordinator closes the report set through its dependency, before reading
  landed subjects or running the brief. Other outcomes retain the set.
- `clean.ts` owns direct completion when the audit report has no findings. A
  plan target lands one empty clean record in the sole judged repo or at the
  invoking root when both repos were judged, using the report's judged-repos
  opening and the audit's
  actual model record and capability tag. `git commit --only --allow-empty`
  preserves staged work while using the normal hooks and signing settings.
  A commit target lands no commit. Both routes retain their report and leave
  existing handoffs untouched. Completion failures stop the run without a
  fictitious fix session or resume command. `target.ts` supplies the plan stem
  shared by output naming and clean records, including archived plans.
- `report.ts` uses `mdast-util-from-markdown` to read the document-level finding fields. Planning
  reports have Excess functionality and Missing functionality fields; implementation reports have
  one Findings field including deferred findings. Each holds numbered finding blocks or its exact
  empty-field sentence. Quoted evidence and code blocks supply no findings. `vet.ts` reads the
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
  rebuttal resumes the audit session and one thread cannot change model half way through. Each named
  field carries what named it, so the report never guesses, and either CLI accepts one. It also
  defines the private inputs and results for assistant invocations, and the launcher-root table, and
  owns which phases' texts enter the round transcript: only audit, vet, rebuttal and fix. The brief,
  ruling and watch are separate documents. The fix writes the ruling; the brief and watch
  run once the transcript holds the round. Assistant boundaries own processes, stream
  validation, session observations and phase output. They return only after accounting for the
  process, streams and required record writes. A failure retains the known session identity,
  including a resumed session whose new invocation reported no identity.
- `episode.ts` owns episode membership and history facts for the glance and
  joined watch evidence. It joins historical stems, includes rework touching
  the topic's artifacts and retains both repositories' heads and anchors.
  `episode-log.ts` reads Git's bodies, touched paths and renames.
  `episode-facts.ts` derives severity, token counts and repeated-growth evidence
  without grading them. Every member keeps its complete findings or an
  unreadable reason; unreadable findings contribute no partial counts. Current
  areas resolve directly, retired areas resolve through `splitFrom` and unknown
  areas remain listed on their findings. Redesigns and widening renames identify
  possible new graded windows for the watch to judge. `readWatchEvidence`
  joins both histories and `formatWatchEvidence` serialises the evidence for
  the runner and hand-run command. It resolves a hand-run commit target as an
  explicit anchor in the invoking repo only; the peer keeps its own anchor.
  Without a target it takes the latest stem on HEAD's history. No episode
  file is written.
- `glance.ts` owns the rule that decides from an episode and the watch record in
  `watch.json` whether the trajectory watch is due. The episode uses a supplied
  topic from the audited plan for every runner glance. The episode reader
  also serves hand-run default-topic resolution. Each
  file-changing commit counts once per area with an A–C correction.
  Repo Edu groups by finding area and planning groups by finding section.
  D-only work, clean records, deferral-only records and planned steps do not count.
  Green waits for four corrections in one area and amber waits for two. Red runs
  after every finished round with audit findings. Clean audits never call the
  glance. Severity, reach and growth have no early trigger.
  A subject the grammar refuses or an unreadable finding set supplies no
  correction count. The episode retains the unreadable evidence. The watch record is read as
  data: a missing, unreadable or old-format entry, or a recorded head off HEAD's
  history, is no record. No record reads as green and counts from the episode's
  anchor, the earliest commit carrying the stem, so a first round never earns a
  watch by being first. The decision's sentence opens its own section of the
  log and the terminal as `[glance]`.
- `findings.ts` reads the complete current bullet form for commit hooks and
  episodes, D included. It validates token values without consulting the area
  model. `commit-msg.ts` checks primary and cover IDs against the current model
  at write time. `sequence.ts` derives severity from the strict read and
  fills the subject's severity slot under its role and repository rules. The
  growth mark remains authored.
- `subject.ts` is the one reader of the commit subject grammar in
  [the subject grammar](../../.agents/references/subject-grammar.md): it parses a subject under
  either repository's form, names the class it matched and refuses with the first slot that does
  not fit. The commit hooks and the glance both read through it. Its loose form read, the first
  token split at its slash, is the one read that reaches subjects older than the settled grammar,
  because episode scoping and auditor stamping need nothing else from them. `commit-msg.ts` is the
  hook's rule: it widens a record's auditor letter from `COMMIT_AUDITOR`, derives
  severity from the graded bullets before parsing the subject, replaces the body's
  opening with `COMMIT_PHASES` when a round supplies it, requires a model line otherwise and refuses
  a single-model record whose effort disagrees with the tag. `commit-msg-main.ts` is the entry both
  repositories' hooks run, `<repo-edu|plan> <message file>`; a refusal names the grammar file.
- `assistant.ts` owns one invocation's session identity, final text, completion evidence and last
  context measurement. One observer keeps that measurement as the feedback passes, so the round
  decides on it rather than the display. Claude and Codex decoders validate the fields they consume.
  `cli-process.ts` owns the child's environment and stops the child before unwinding a failed line
  consumer, because Execa's iterator return awaits the child. It then awaits all readers and the
  process. Process output is never accumulated by Execa. Every child carries the round's commit
  stamps, overriding any inherited ones, so a phase that commits records the round that ran rather
  than whatever started it. The stamps are read when the child starts, from the output's record
  of the phases that have run, so a clean round that skipped the vet and the rebuttal stamps
  neither into its record, and an accepted vet's round stamps no rebuttal.
- `codex-session.ts` reads the current session's appended records. A resumed
  rebuttal or resumed fix starts at the file's pre-invocation end. An
  incomplete record stays with the reader until more bytes arrive; a final
  incomplete record fails the invocation.
- `ruling-input.ts` owns the reply reader through Node's `readline`. A blank line
  sends a non-empty multiline reply. Ctrl-C, end of input and cancellation discard
  an unfinished reply. Non-terminal input supplies no ruling. The assistant never
  inherits the terminal. Reply recording completes before the fix can resume.
- `startup.ts` owns where the `audit-round` cache lives and holds its update dates.
  `resolveCacheRoot` is that one owner, so the update stamps and the watch record the glance reads
  resolve the same way. The watch workflow owns `watch.json`: each episode records both
  repositories' graded heads beside one grade and written date. The glance counts from the invoking
  repository's head only. Both update checks precede settings discovery. Codex compares its
  installed version with the standalone installer's release channel before running its updater. A
  current or newer installation is kept. An update is successful only when a fresh version read
  reaches the checked release or a newer one. Installer output is retained for failure diagnostics,
  since its success banner does not prove a version change. Failed checks and unverified updates
  leave the date unstamped so the next run retries. Claude control requests and the short-lived
  Codex settings connection start no LLM turn. `requests.ts` owns headless and manual recovery
  arguments, including `--approve-for-me` on every Codex phase and resume command and a named model
  and reasoning effort: Codex takes them before any subcommand, so a resumed phase keeps them, and
  Claude takes `--model` and `--effort`. A fix awaiting a ruling and a failure both carry their
  phase, so continuation and recovery use the model the round ran that phase on. Claude uses
  `--permission-mode auto` in settings discovery and every session entry, and that discovery names
  no model of its own. Both assistants receive their phase prompts on standard input. Codex
  command-line arguments contain no prompt text, including on resume, so joined evidence is not
  limited by the operating system's per-argument size.
- `output.ts` owns terminal presentation and incremental run recording. A run description names the
  run, lists the phases it may run and locates its files: a round records a log and transcript pair,
  and a brief on its own records a log beside the transcript it retells and keeps no transcript of
  its own. It uses `round-paths.ts` for file names and round identity. It validates all
  file-writing phase tags before `run-files.ts` exclusively creates the tagless claim, then opens
  the transcript and log. The claim remains after success or failure, and a conflict stops without
  retrying. Each entry carries its
  phase, so the settings header reports the model and effort that phase will run on and names what
  set each of them: a command-line flag, the phase's own pin, or the assistant's settings. A phase
  whose two fields came from different places names both, model first. The output holds only the run
  start, current phase timing, context observations and each started phase's model selection. A
  phase starts with its launch selection, then its CLI's model feedback replaces it. Commit stamps
  use those phase selections; requested aliases remain in the settings header and file tags. Every
  status stamp shows the phase's elapsed time and the round's total. Every logged tool line opens
  with its step's own time, the assistant time since the previous tool line or since the phase start
  for the first, followed by the round's total assistant time. `run-clock.ts` owns what those
  readings count. A round measures its assistants, so time the user holds is not the run's.
  Displaying the ruling opens a wait and submitting or cancelling the reply closes it. Each phase
  and the run read the same waiting total through their own mark, so one rule serves every reading.
  Two baselines measure context growth: a written status stamp reports the tokens added since the
  previous written stamp, and a logged tool line reports the tokens added since the previous tool
  line, beside the time since it. Both chain into the totals beside them; a fresh phase starts its
  stamp baseline at zero and a resumed phase reports no first change. `run-files.ts` completes each
  required write before returning to the invocation; no complete transcript accumulates in memory.
  `terminal.ts` renders assistant Markdown through the `pi-tui` Markdown component at the current
  terminal width, preserving paragraph spacing, nested lists and source finding numbers. It uses
  cyan for inline code without background blocks and honours `NO_COLOR`. It writes the rendered
  document directly and uses log-update only for the live status line, so permanent text is not
  wrapped twice. Redirected output retains the original Markdown. The log records each tool
  invocation once, with shell wrappers removed and no event envelopes or result payloads. Invocation
  lines stay complete in the log; assistant texts stay complete in Markdown. Only terminal tool
  lines shorten. `showBrief` renders the saved brief after validation and appends it to the log,
  keeping it out of the transcript it retells. The brief's assistant text is not displayed, so
  a writer echo cannot duplicate the saved document. Both full rounds and standalone briefs use this
  route. `beginRuling` releases the live status display and renders the fix's ruling.
  `endRuling` excludes the user's waiting time and records a submitted reply in the log and
  transcript before any resumed process starts. Assistant replies use the normal phase output, so
  launch prompts stay in the log and never reach the terminal.
- `round-paths.ts` owns the file-name grammar, target names, round allocation candidates,
  existing document resolution and report closure for both entry routes. It resolves `HEAD`
  in commit targets and scans both roots for the next target-wide number. Automated rounds
  supply every phase path. A manual audit names only its claim and report; later manual phases
  retain that report's round and name their output with the current session's writer tag.
  `manualPhasePaths` returns the ordinary phase arguments and finds review inputs only within
  the exact round at the report's root. With no input, it selects the sole eligible document at
  the invoking root: the other assistant's audit for vet, the current assistant's audit for
  rebuttal, either assistant's audit for fix or either assistant's transcript for brief.
  Multiple matches require an explicit file selection.
  `closeRound` deletes only audit, vet and rebuttal files for that exact round, using recorded
  filenames without consulting model settings.
- `context.ts` resolves the installed Repo Edu checkout, its sibling plan root,
  the invoking working directory and the round kind once. Only those two roots
  may start a round. The context follows every phase and recovery session;
  workflow ownership never changes the working directory.
- `target.ts` owns target validation and the target type: a plan with optional
  steps or a non-empty list of commit references from Repo Edu and an artifact
  alone from the plan root. A plan named by its stem gets `.md`; a name shaped
  like a commit reference, a range or a bare hex string is judged as commits,
  so a plan whose stem reads as a SHA keeps its extension. Planning starts
  reject step scopes and commit references before assistant startup.
  `command.ts` checks that the plan file exists where the phases open it,
  before any assistant starts. The audit workflow owns Git
  resolution and inclusive-range admission. The runner passes references
  unchanged and rejects multiple auditor entries for commit targets, which run once without
  a trajectory glance or watch.
- `command.ts` owns the command grammar, startup and final reporting, including the comma-separated
  auditor list and the error that identifies a malformed entry. It trims each entry and delegates
  its assistant name or capability tag to `parseAuditor`. The round is the command itself, taking
  the target as its own arguments. Its subcommands are `brief`, `name`, `paths`, `close` and
  `episode`. The `episode` command prints joined watch evidence from the shared reader and formatter
  without settings discovery, assistant startup or file writes. The `name` command claims a round
  and prints its claim and audit report paths. Its required `--auditor` is the hand-run session's
  full tag, including `u`, checked separately from a round's model request. The `paths` command
  prints a JSON array of a manual phase's input and output paths for an existing report or
  transcript. Both commands bypass assistant startup and settings discovery; `paths` writes nothing.
  The `close` command uses the same closing function as the coordinator and starts no assistant or
  settings discovery. So the program carries an action handler, Commander adds no `help` command,
  and each command's own `-h` prints its help. A bare command line prints that help rather than
  reporting a missing plan. It also owns the remaining auditor list and round counter. Each entry
  runs once in the supplied order with its own override. Only an audit with no findings removes all
  remaining entries for that assistant, across model and effort tags. A fix that lands a clean
  record removes none. Failure or a round requiring a ruling stops the sequence. The list length is
  the only round limit and an omitted list uses the configured default once. Each round records its
  own file pair and the coordinator has no filesystem side effects: it opens one output per round,
  retires the previous one first, and reads updates and settings once for the whole run before
  opening any files. Startup messages go only to the terminal; the run log begins with the models
  table. A chained round carries its place in its title and independently claims the next number for
  its target. Required write failures stop phase progression. If recording itself fails, the
  emergency channel still reports the known session and recovery command.
- `contract.ts` invokes the same assistant and output boundaries with a probe
  prompt. It requires successful and deliberately failed shell calls before
  replacing any selected fixtures. It invokes no workflow and refreshes only
  this package's recordings.

The coordinator has no process, filesystem or terminal side effects of its own.
Its dependencies supply those operations explicitly. A returned phase failure
stops the sequence. A rejected phase invocation also stops it without retrying;
the invocation owner must release its resources before rejecting.

The phase table in `phase.ts` owns launcher roots. Every session keeps the
invoking working directory and every round file lives there. The runner names
all input and output paths before the audit. Report phases finish only when
their supplied output exists and is non-empty. Claude receives the peer checkout
as an additional directory; recovery commands restore the working directory.

Workflow launchers own findings, authority, gates and phase outcomes. The shared
Runner result rule in
`../../.agents/skills/audit/references/workflow.md#runner-result` defines their
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
left unchanged. The user supplied the defaults on 2026-09-23.

- `defaultAuditor` selects Claude or Codex when `--auditor` is absent.
- `strengthModels` maps each assistant's base and top tiers to a model name.
  The same names classify reported models for capability tags. A family alias
  such as `opus` follows the CLI's current release; a full model name pins it.
- `phases` sets each phase's model and effort. A `null` field inherits the
  assistant CLI's effective setting. A named model must suit the selected CLI.
- Audit and vet each have separate Claude and Codex selections, so changing
  auditor in a chain keeps each CLI on its own model. Rebuttal shares the
  audit selection. The vet uses the other assistant and fix uses Codex.
  Document phases each select their assistant.
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

Run from the Repo Edu checkout root with authenticated `claude` and `codex`
commands available. Terminal Markdown rendering is bundled with the runner and needs no separate
executable. Set `NO_COLOR=1` to disable colour. Redirected output retains the original Markdown.

The terminal renderer is `@earendil-works/pi-tui`, replacing Glow. On 2026-09-24,
the user confirmed a strong preference for its output in a live audit round.
The accepted presentation keeps tables aligned, preserves paragraph and nested-list
spacing and uses cyan code references without heavy background blocks. Preserve
these qualities when changing terminal rendering.

```bash
pnpm audit-round ../plan/example.md 1-3
pnpm audit-round ../plan/example.md 3 --auditor a -v
pnpm audit-round ../plan/example.md 3 --auditor atx
pnpm audit-round task-modifier --auditor claude
pnpm audit-round task-modifier --auditor codex
pnpm audit-round ../plan/example.md 3 --auditor codex,claude,claude
pnpm audit-round ../plan/example.md 3 --auditor "atx, obm"
pnpm audit-round ../plan/example.md 3 --no-watch
pnpm audit-round HEAD-1
pnpm audit-round HEAD-2..HEAD
pnpm audit-round brief example-step-3-01-0-round.otm.md
pnpm audit-round name ../plan/example.md 3 --auditor oth
pnpm audit-round paths vet example-step-3-01-1-audit.oth.md --writer abx
pnpm audit-round paths rebut example-step-3-01-1-audit.oth.md --writer otm
pnpm audit-round paths fix example-step-3-01-1-audit.oth.md
pnpm audit-round close example-step-3-01
pnpm audit-round episode example
pnpm audit-round episode HEAD-2
pnpm audit-round:contract
pnpm audit-round:contract codex
```

The round names the report, vet, rebuttal, brief, ruling and watch before the
audit starts. It writes the tagless claim, transcript and log at the invoking
root. Phase files use `<target>-<round>-<order>-<kind>.<tag>.<ext>` under
the shared round protocol, with the transcript and log sharing `0-round`.
Each phase receives the complete paths it reads and writes in protocol order.

`name` prints two absolute paths, claim then audit report, and creates only the
claim. It does not load settings or start an assistant. A plan-root hand-run
implementation audit may name a step scope; the automated round still requires
Repo Edu for that route.

`paths <vet|rebut|fix|brief> [input]` resolves a later manual phase and prints its
arguments as one JSON array. Vet, rebuttal and brief take `--writer <full tag>`
from the current session. Fix writes no phase report and needs no writer tag.
Without an input, the command selects the sole eligible file at the invoking root.
Use `--vet <file>` or `--rebut <file>` to select an existing review when several
belong to that round. The command writes nothing and never claims another
number. The shared round protocol owns manual invocation details.

`close` deletes the audit and twins for its exact target and round at the
invoking root. Claims and runner documents remain.

The brief writes a plain-words twin only after the full fix has completed, then prints the saved
document in the terminal. A clean audit records its outcome directly and
retains the report, without later sessions. A fix that stops for a ruling adds a ruling twin. A
finished plan round with audit findings ends with a glance at the commit record, and a due glance
adds a `-watch.md` document. The watch keeps its own history in the shared cache, which is how its
cadence survives between rounds, and `--no-watch` skips both. `brief` accepts an earlier transcript
at either root, writes beside it without claiming a new number and overwrites its standalone log on
each run. `--auditor` accepts one selection or a comma-separated sequence on the named plan scope.
Repeated entries request separate rounds. A clean audit skips all remaining entries for its
assistant; failure or a round requiring a ruling stops the sequence. Each header records the round's
start time; filenames carry no timestamp.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use child processes and the recordings under
`src/__tests__/fixtures`. Ordinary tests make no live model calls.

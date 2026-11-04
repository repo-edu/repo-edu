# CLAUDE.md

This is the private planning and implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal, fix and brief sequence, the reply a fix's open
  item needs, the watch that follows a finished planning or plan-scoped implementation round and the
  fresh judge that routes an automatic series. It retains the audit result and report as local
  values. Audit, vet, rebuttal, fix and brief start fresh. A clean audit completes directly through
  `clean.ts` without vet, rebuttal, fix, brief, glance or watch; an automatic series still runs its
  judge. The coordinator reads the report through `report.ts` to decide whether it is clean. A vet
  that accepted every finding skips the rebuttal the same way, because the auditor has nothing to
  answer; the fix then reads the report with its vet twin alone. The coordinator reads the twin
  through `vet.ts` to decide whether every finding was accepted from its verdict lines. Rebuttal
  uses the audit's resolved model and effort, including `--auditor` or `--first` fields, because it
  is the auditor's answer. Its workflow grounds answers in current sources. The settings file
  selects the default auditor, the coder list and the assistants that write documents. A plan's
  ready marker selects its fixer from that list; work without an assignment uses the first coder.
  The brief follows
  only a finished fix, after all rulings and resumed fix invocations have completed. Only `--brief`
  adds that phase and its settings row to every round. Its input is the round transcript, never the
  report, and its workflow belongs to the Repo Edu root. `runBrief` runs that one phase on its own
  over an earlier transcript. The fix receives a ruling output path separately from its report
  arguments. It writes the final ruling and checks it for clarity before returning `needs-ruling`.
  The runner checks that file, then displays it and collects a reply without running the brief. A
  missing or empty ruling fails the fix with its recovery session. The same fix session resumes in
  the background with that reply. Further open decisions repeat this route. A completed fix follows
  the same report deletion, commit checks, brief and watch as an uninterrupted fix. Stopping without
  a reply retains the round files and reports the fix's recovery command and ends the auditor
  sequence. A submitted reply lets a completed round continue any remaining auditor entries. Further
  open decisions replace the ruling in that same session under
  [Writing a ruling](../../.agents/skills/fix/references/ruling.md). No separate ruling phases run.
  `runWatch` owns the watch that follows a round: the glance decides from the commit record and the
  watch's own history whether a watch is due, and only a due glance runs `watch` to return the
  finished document and grade. The audited plan's stem comes from `planStem` and selects both the
  glance record and joined watch evidence. Only a due glance computes and formats the Git episode
  and the plan's existing round-kind data files, once after the fix. Only the writer's prompt
  receives the snapshot separately from its empty phase-argument list. The glance is a dependency
  the runner supplies from `glance.ts`, not a phase, so a not-due round starts no session for it.
  The watch writer owns both the judgement and final wording. Its model and effort live in
  `settings.json`, beside the brief's settings. The watch runs only after a plan round with audit
  findings that finished, because a round awaiting a ruling has not proved its work landed; nothing
  is lost, since the glance counts audit correction commits and not rounds. A round given no watch
  target, which is what `--no-watch` does, consults no glance at all. The watch reads the Git record
  and retained round data, so `runWatch` passes it no transcript or report. The watch-specific
  result returns its Markdown, parsed grade and the final compaction count owned by `RoundOutput`.
  `runWatch` rejects a compacted result before writing, then saves an admitted document before
  atomically replacing only its episode's cadence entry. A failed document write skips the record
  write. A failed record write leaves the valid document and earlier record in place. A finished
  round reports the returned grade, and the command runner ends the auditor sequence on red, so no
  queued round starts before the user acts on the watch. Before the brief and watch, `round.ts`
  publishes the settled findings as the current `in-progress` round-data entry. After the fix, it
  resolves the plan's current filename. A widening fix must end with the grammar's settling line,
  which replaces the audit report's closing line as the entry's retained settling recommendation,
  because the fix ends the round and has answered every ruling it asked; a fix outside widening must
  return none. The watch still runs when the fix changed the plan's phase, but the judge does not.
  After any other non-red round in an active plan's automatic series, it starts a fresh judge turn
  over the plan's round-kind data, episode commits, stop conditions and latest watch. The runner's
  real-bug gate removes settle in widening while either assistant's latest settled read of the scope
  carries an accepted A, and removes stop otherwise while that read carries an accepted A or B. A
  widening judge chooses settle, stop, Claude or Codex; every other judge chooses stop, Claude or
  Codex. The output stores its answer in the final entry. Manual queues and commit targets run no
  judge. The round records both repositories' HEADs before the fix, reads the landed records and
  validates every subject under its repository's grammar. A plan target keeps only the records whose
  subject carries its stem, because another plan's round may land in the same checkout while the fix
  runs. A plan target fails when a finished fix landed no commit. A commit target may land nothing.
  Reader failures retain the owning phase and its session for recovery. The coordinator deletes the
  report set after these checks, then runs the brief. Other outcomes retain the set. `runClose` runs
  the loop-close phase alone on its own settings. It passes the active plan, the capability tag and
  model record its commits carry, the open deferrals resolved before assistant startup and any abort
  reason. A finished close that left its plan at the root fails, because the move is the close.
- `clean.ts` owns direct completion when the audit report has no findings. A
  plan target lands one empty clean record in the sole judged repo or in
  Repo Edu when both repos were judged, using the report's judged-repos
  opening and the audit's actual model record and capability tag. `git commit --only --allow-empty`
  preserves staged work while using the normal hooks and signing settings.
  Full commit IDs identify any deferrals that the clean record closes.
  A commit target lands no commit. Both routes retain their report and leave
  existing handoffs untouched. Completion failures stop the run without a
  fictitious fix session or resume command. `target.ts` supplies the active
  plan stem shared by output naming and clean records.
- `lifecycle.ts` owns the shared plan-file preflight and the Git operations for
  the user-called `settle` and `ready` commands, plus each hosting repo's
  runner-written `implemented` marker. It refuses an untracked,
  staged or unstaged target plan while leaving unrelated work alone. Settle
  commits only the widening rename before claiming its marker. Ready shares
  the `git commit --only --allow-empty` route with direct clean completion and
  validates the committed plan's steps and audit ranges, advances through the
  configured coder list and writes the assignment in its marker. Both routes
  keep the plan checkout's normal hooks enabled. An implemented marker carries
  the assigned coder's resolved model record and capability tag.
- `implement.ts` owns the assigned-ready gate, optional step scope, per-repo
  landed-share scan and sequential worker loop. It starts one fresh worker for
  each selected step with pending shares. A ruling resumes only that worker.
  A failed worker or missing share stops before the next step and retains its
  recovery session. After the loop, each hosting repo with every share landed
  receives its current `implemented` marker.
- `implement-output.ts` resolves the assigned coder's release, effort, tag and
  model record once. It names one retained log and ruling path per step.
- `plan-steps.ts` reads the first ordered list below the depth-2
  `Implementation plan` heading. It requires each item to open with a bold
  title and one closed host sentence, then returns the steps and their hosting
  repos in list order. It also reads the `Audit ranges:` sentence under the
  depth-3 `Execution and audits` subsection and requires its scopes to tile the
  listed steps in order.
- `report.ts` uses `mdast-util-from-markdown` to read the document-level opening and finding fields.
  A widening report must end with the grammar's settling line as its last paragraph, read from its
  source so a formatted reason keeps its words; the reader returns that line as the report's
  settling value, refuses one on any other report class and returns an empty value there. A clean
  widening round retains the report's line as its settling recommendation, since no fix ran to
  replace it. Planning reports have Excess functionality and Missing functionality fields;
  implementation reports have one Findings field including deferred findings. Each holds depth-3
  finding headings or its exact empty-field sentence. A heading form keeps evidence free of the
  indentation a numbered list needs, which grew by one space at the tenth finding and was missed.
  Finding titles are distinct across the whole report because the vet and rebuttal name findings by
  them; round data joins findings to record bullets by the `[finding:<n>]` number each bullet opens
  with. Quoted evidence and code blocks supply no findings. `vet.ts` reads the fixed verdict and
  answer lines and ignores every other line. It requires verdicts for the report's finding numbers
  in order and rebuttal answers for each revise, drop and ruling verdict. Only Accept verdicts skip
  the rebuttal. Both readers are supplied through `RoundDependencies`, alongside the HEAD and
  subject reads.
- `phase.ts` owns who runs each phase of a round and on what, and the capability tag's whole
  vocabulary in both directions: the letters a subject spells a phase with and `parseAuditor`, which
  reads each assistant name or partial tag in the `--auditor` list and the `--first` selection.
  Assistant names bypass audit model and effort pins for the assistant's default selection. The
  three alphabets share no letter, so a partial tag says which fields it named. `roundPhases` is the
  one owner of the round's phases: it resolves the assistant's selection once for audit and
  rebuttal, the runner invokes from the value it returns and the run's settings header prints the
  same value, so what a round says it ran on is what it ran with. `closePhase` names the loop-close
  on its own settings, because the close belongs to no auditor. Every phase names a model and an
  effort; a field that says
  `default` reads the assistant's default selection, so neither CLI's own configuration enters.
  `settings.json` owns the coder list, phase selections, the default selections
  and the model tier table.
  `settings.ts` loads and validates it once at command entry, independently of the working
  directory. That configuration is passed through routing, output naming and commit stamps.
  `--auditor` and `--first` override each field they name, using the configured tier table for its
  model. Both audit settings and command-line overrides bind the audit and rebuttal together,
  because the rebuttal is the auditor's answer. Each named field carries what named it, including
  which of the two options a tag came from, so the report never guesses, and either CLI accepts one.
  It also defines the private inputs and results for assistant invocations, and the shared workflow
  and launcher selectors, and owns which phases' texts enter the round transcript: audit, vet,
  rebuttal, fix and the judge's one answer line, so the recommendation on how to continue survives
  in the file after the terminal has scrolled. The brief, ruling and watch are separate documents.
  The judge is an evidence-only turn with no document, launcher or model-record entry of its own, so
  the launcher and commit-record set stays the four recorded phases. The fix writes the ruling; the
  brief and watch run once the transcript holds the round. Assistant boundaries own processes,
  stream validation, session observations and phase output. They return only after accounting for
  the process, streams and required record writes. A failure retains the known session identity,
  including a resumed session whose new invocation reported no identity.
- `episode.ts` owns episode membership and history facts for the glance and joined watch evidence.
  It joins both repos' commits under the plan's stem, includes rework touching the topic's artifacts
  and retains both repositories' heads and anchors. `episode-log.ts` reads Git's commit dates,
  bodies, touched paths and renames. `episode-facts.ts` checks body finding counts against subject
  severity and derives episode-level token counts and repeated-growth evidence without grading them.
  Every member keeps its complete findings or an unreadable reason; unreadable findings contribute
  no partial counts. Current areas resolve directly and retired areas resolve through `splitFrom`;
  an unknown location stays on its original finding. Redesigns and widening renames mark their
  commits as possible new graded windows for the watch to judge. `readWatchEvidence` joins both
  histories with the plan's existing planning and implementation round data. `formatWatchEvidence`
  projects the repositories, their heads, anchors, episode-level counts and runs, then each commit's
  six-character SHA, date, written subject, window candidate, unreadable reason and finding prefixes
  through their titles. Its round data keeps each round's identity, landed commits, status,
  applicable findings and phase compaction counts. The joined top level keeps token counts and
  repeated-growth evidence across both repos; repeated-growth commits use short `plan@` or
  `repo-edu@` SHAs. It returns that serialised view beside the two typed heads from the same
  projection. The runner uses both, while the hand-run command pages only the view. It resolves a
  hand-run commit target as an explicit anchor in whichever repo holds its SHA; HEAD forms mean Repo
  Edu. The peer keeps its own anchor. Without a target it takes the newest stem commit across both
  histories by commit date. No episode file is written. The hidden hand-run command takes a
  one-based inclusive line range over the current indented view. It states the returned range and
  current total on every call, including an out-of-range call that returns no evidence lines.
- `judge.ts` reads one round kind's retained data, the stem's episode commit
  list, `STOP-CONDITIONS.md` and the newest watch. It applies the settled-span
  gate and each assistant's latest settled entry on the scope to decide whether
  the phase's ending is available. Widening has no settled-span cut and always
  admits stop, while the gate controls settle on an accepted A alone: a widening
  B is a fixable issue inside the shape that the vet checked and the fix landed,
  and the retained settling recommendation already says whether a shape
  question remains. Detailing and implementation use the gate on an accepted A
  or B to control stop. Detailing uses the current span. Implementation
  uses every settled entry on its scope target. Only the exact current
  `in-progress` entry is eligible.
  Failed or interrupted entries with landed records remain eligible. It
  validates the judge's single answer and reason without deriving watch-only
  facts.
- `glance.ts` owns the rule that decides from an episode and the watch record in
  `watch.json` whether the trajectory watch is due. The episode uses a supplied
  topic from the audited plan for every runner glance. The episode reader
  also serves hand-run default-topic resolution. Each
  file-changing audit correction commit for the selected plan counts once per area
  with an A–C correction, across all step scopes. Off-plan work and other plans'
  audits remain watch evidence but do not advance the count.
  Repo Edu groups by finding area and planning groups by finding section.
  D-only work, clean records, deferral-only records and planned steps do not count.
  Green waits for three audit correction commits in one area; amber and red wait for two. Red
  has no early trigger because the runner already stops the sequence on it, so the user has acted
  before a next round can run. Clean audits never call the glance. Severity, reach and growth have
  no early trigger.
  A subject the grammar refuses or an unreadable finding set supplies no
  correction count. The episode retains the unreadable evidence. The watch record is read as
  data: a missing, unreadable or old-format entry, or a recorded head off HEAD's
  history, is no record. No record reads as green and counts from the episode's
  anchor, the earliest commit carrying the stem. Unstemmed history has no eligible
  audits, so a first round never earns a
  watch by being first. The decision's sentence opens its own section of the
  log and the terminal as `[glance]`. The same module atomically writes the
  cadence entry that `round.ts` has admitted for the runner's sequence decision.
- `findings.ts` reads the complete current bullet form for commit hooks and episodes, D included. It
  validates token values without consulting the area model. It requires the `Title: prose` form and
  reads the optional leading `[finding:<n>]` token that names the report finding the bullet lands,
  plus `[applies:<full-sha>/<position>]` citations on graded bullets and the untiered `The plan
  stands.` form. A citation keeps the full commit ID. The hook therefore refuses a malformed bullet
  before the round-data join or deferral owner reads it. `commit-msg.ts` checks
  primary and cover IDs against the current model at write time. `sequence.ts` derives severity from
  the strict read and fills the subject's severity slot under its role and repository rules. The
  growth mark remains authored and is required beside every sequence outside a deferral record.
- `open-deferrals.ts` owns one active plan's open set. It selects plan-bound
  deferrals from every Repo Edu commit by their destination plan and Repo
  Edu-bound deferrals from that plan's stem commits. It removes plan-bound
  deferrals through plan-repo citations. It removes Repo Edu-bound deferrals
  through citations in Repo Edu history or the plan's stem commits. Each match
  uses the exact full commit ID and position. It returns the remaining
  deferring repo, full commit ID, position, tier, destination and title newest
  first. The automatic series
  chain, each plan-scoped implementation audit, every automatic series ending
  and loop-close all read this owner.
- `subject.ts` is the one reader of the commit subject grammar in
  [the subject grammar](../../.agents/references/subject-grammar.md): it parses a subject under
  either repository's form, names the class it matched and refuses with the first slot that does not
  fit. The commit hooks and the glance both read through it. Its loose form read, the first token
  split at its slash, is the one read that reaches subjects older than the settled grammar, because
  episode scoping and auditor stamping need nothing else from them. `commit-msg.ts` is the hook's
  rule: it replaces a record's auditor tag with `COMMIT_AUDITOR` when the runner supplies it. It
  derives severity from the graded bullets before parsing the subject. It replaces the body's
  opening phase lines and time line with `COMMIT_PHASES` when a round supplies it, so a second
  stamp repeats neither, and requires a model line otherwise. It refuses a
  single-model record whose effort disagrees with the tag, a step record
  without active implementation time and a ready marker without its coder.
  `commit-msg-main.ts` is the
  entry both repositories' hooks run, `<repo-edu|plan> <message file>`; a refusal names the grammar
  file.
- `assistant.ts` owns one invocation's session identity, final text and turn evidence. A session
  is one or more turns and ends with its process: Claude's print mode emits one result per turn,
  a background task or subagent wakes the session for a further turn, and while a subagent is
  pending the CLI defers the results and flushes them at exit behind an empty result of no turns.
  The phase's final text is the last turn's text. After the process ends with at least one turn,
  it saves audit, vet and rebuttal reports from that text without the result line. A failed write
  fails the phase before progression. For the watch it parses the grade line and returns the
  remaining Markdown with the output recorder's final compaction count, without writing a file.
  Context and token measurements pass directly to the output observer. Both
  assistants replace the phase total with the session's newest running total.
  Claude and Codex decoders validate the fields they consume.
  `claude.ts` reads `modelUsage` from each turn's result. Its input is
  `inputTokens + cacheReadInputTokens + cacheCreationInputTokens`, its cached
  input is `cacheReadInputTokens` and its output is `outputTokens`.
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
  incomplete record fails the invocation. Its token reading uses
  `total_token_usage`: input already includes cached input, cached remains
  separate and output already includes reasoning.
- `ruling-input.ts` owns the reply reader through Node's `readline`. A blank line
  sends a non-empty multiline reply. Ctrl-C, end of input and cancellation discard
  an unfinished reply. Non-terminal input supplies no ruling. The assistant never
  inherits the terminal. Reply recording completes before the fix can resume.
- `startup.ts` owns where the `audit-round` cache lives and holds its update dates.
  `resolveCacheRoot` is that one owner, so the update stamps and the watch record the glance reads
  resolve the same way. The watch workflow and shared
  grammar own `watch.json`'s shape. `round.ts` orders its write after the admitted document: each
  episode records both repositories' graded heads beside one grade and written date. The glance
  counts from the plan head for planning rounds and the Repo Edu head for implementation rounds.
  Both update checks precede release resolution. Codex compares its installed version with the
  standalone installer's release channel before running its updater. A current or newer installation
  is kept. An update is successful only when a fresh version read reaches the checked release or a
  newer one. Installer output is retained for failure diagnostics, since its success banner does not
  prove a version change. Failed checks and unverified updates leave the date unstamped so the next
  run retries. Release resolution asks Claude for the release of each model a round's phases may
  pin, as `namedModels` derives them from `roundPhases`, because a family alias names whichever
  release is current. Codex runs a named model under that name. Neither CLI's own model
  configuration is read, because `settings.json` names every phase's selection. Claude control
  requests start no LLM turn. `requests.ts` owns headless and manual recovery arguments, including
  `--approve-for-me` on every Codex phase and resume command and every phase's model and reasoning
  effort: Codex takes them before any subcommand, so a resumed phase keeps them, and Claude takes
  `--model` and `--effort`. A fix awaiting a ruling and a failure both carry their phase, so
  continuation and recovery use the model the round ran that phase on. Claude uses
  `--permission-mode auto` in release resolution and every session entry. `requests.ts` also
  supplies each fresh phase's selected workflow and whole files listed by the workflow's `reads`
  header. Header paths resolve from the workflow file. `vfile-matter` parses the header and `zod`
  checks its shape. Listed workflows supply their own reads recursively, with each source included
  once. Audit, vet, rebuttal and fix also receive their home launcher. Brief and watch have no
  launcher; their workflow headers list the `simple` definition directly. The close has no launcher
  either, and its prompt names a loop-close rather than a round phase. Resumed sessions receive no
  files again. Root instructions are not listed. Both assistants receive their phase prompts on
  standard input. Codex command-line arguments contain no prompt text, including on resume, so
  joined evidence is not limited by the operating system's per-argument size. The same collected
  file list produces a separate log prompt containing source paths with an omission notice in place
  of file contents.
- `output.ts` owns terminal presentation and incremental run recording. A run description names the
  run, lists the phases it may run and locates its files: every round records a log and transcript,
  a round on an active plan also updates one machine-readable per-plan data file, and a commit audit
  writes no plan data entry. A brief on its own records a log beside the transcript it retells and
  keeps no transcript of its own, and a close records only `<stem>-close.<tag>.log` at the plan
  root. The close's run also yields the tag and model record its session hands its commits. It uses
  `round-paths.ts` for file names and round identity. It validates all file-writing phase tags
  before `run-files.ts` exclusively creates the tagless claim, then opens the transcript and log.
  The claim remains after success or failure, and a conflict stops without retrying. Each entry
  carries its phase, so the settings header reports the model and effort that phase will run on,
  each in its own aligned column. It names what set each of them: `--auditor` or `--first`,
  `audit-round settings` for the phase's own pin, or `audit-round defaults` when the phase says
  `default`. A phase whose two fields came from different places names both, model first. A pinned
  model reads as the release its CLI resolved it to at startup, so every row names a release. The
  output holds the run start and current phase timing. It keeps context observations and each
  started phase's model selection, time, tokens, peak context and compaction count. It warns once
  when audit, vet, rebuttal or fix first compacts. The watch returns the final count to `round.ts`,
  which fails a compacted result with the evidence size and the need for one uncompacted session. A
  phase starts with its launch selection, then its CLI's model feedback replaces it. Each finished
  invocation adds its elapsed time to the phase's time. Both assistants' latest session totals
  replace the earlier reading, so a resumed fix counts each token once. Each phase prints its
  per-model input, cached input and output totals beside its elapsed time. Commit stamps use those
  phase selections and add a time line for the audit, vet and rebuttal that finished. Every status
  stamp shows the phase's elapsed time and the round's total. Every logged tool line opens with its
  step's own time, the assistant time since the previous tool line or since the phase start for the
  first, followed by the round's total assistant time. `run-clock.ts` owns what those readings
  count. A round measures its assistants, so time the user holds is not the run's. Displaying the
  ruling opens a wait and submitting or cancelling the reply closes it. Each phase and the run read
  the same waiting total through their own mark, so one rule serves every reading. Two baselines
  measure context growth: a written status stamp reports the tokens added since the previous written
  stamp, and a logged tool line reports the tokens added since the previous tool line, beside the
  time since it. Both chain into the totals beside them; a fresh phase starts its stamp baseline at
  zero and a resumed phase reports no first change. `round-data.ts` owns the checked JSON schemas,
  replace-or-append writer and the read of one plan's existing round-kind files from the active root
  or closed-plan archive. A finding review carries its report number, tier and verdict; retained
  finding data stores the verdict word and rebuttal answer. A planning entry's required `settling`
  field keeps the widening round's settling recommendation as it stands when the round ends: the
  fix's settling line, or the audit report's closing settling line when the clean audit ran no fix;
  detailing entries use `""`. The planning and implementation files each hold a time-ordered entry
  per round. An entry records state, settings, chosen auditor and source, phase measurements
  including peak context and compactions, landed commits, finding review and outcome data and any
  judge answer. `RoundOutput` writes the settled findings as `in-progress` before later phases, then
  replaces the entry with its final state. The writer checks the whole array and publishes it by
  temporary file rename. `run-files.ts` completes each required write before returning to the
  invocation; no complete transcript accumulates in memory. `terminal.ts` renders assistant Markdown
  through the `pi-tui` Markdown component at the current terminal width, preserving paragraph
  spacing, nested lists and source finding numbers. It uses cyan for inline code without background
  blocks and honours `NO_COLOR`. It writes the rendered document directly and uses log-update only
  for the live status line, so permanent text is not wrapped twice. Redirected output retains the
  original Markdown. The log records each tool invocation once, with shell wrappers removed and no
  event envelopes or result payloads. Invocation lines stay complete in the log; assistant texts
  stay complete in Markdown. Only terminal tool lines shorten. The terminal omits the final
  `PHASE RESULT` control line; the transcript retains it. `showBrief` renders the saved brief after
  validation and appends it to the log, keeping it out of the transcript it retells. The brief's
  assistant text is not displayed, so a writer echo cannot duplicate the saved document. Both full
  rounds and standalone briefs use this route. `beginRuling` releases the live status display and
  renders the fix's ruling. `endRuling` excludes the user's waiting time and records a submitted
  reply in the log and transcript before any resumed process starts. Assistant replies use the
  normal phase output, so launch prompts stay in the log and never reach the terminal. Supplied
  instruction files appear there by path only; their full contents go to the assistant. Each
  assistant's reported model line is followed by the model-change notice from `model-change.ts`
  when that comparison differs.
- `model-change.ts` owns the non-blocking model and effort notice. Every
  round phase and the close compare the same way: the notice reads every
  active and archived plan's checked round data and compares the report with
  the newest earlier report by the same assistant on the same launched
  selection, whatever phase ran it. The launched selection is what the
  settings named before the CLI resolved any alias, so an alias that now
  resolves to another release warns, and so does a tool running another
  release or effort than it did on that selection before. A changed launched
  selection is already visible in the settings header, so a coder rotation or
  an edited default is no warning. A first observation, a different assistant
  and an unchanged report produce no notice. A phase entry recorded before
  the launched selection was kept matches nothing. Invalid round data still
  stops the run before an assistant starts.
- `models.ts` owns the model read-out and its two sections.
  `model-evidence.ts` reads checked round data once at the plan root and
  closed-plan archives, then joins the step, ready and closed records from both
  Git histories. `model-comparison.ts` owns the graded words and direct range
  comparisons. Every recorded auditor and coder gets one row. The opening
  sentence uses only current recorded rows and states each current thin row's
  shortage once per work class. Auditor comparisons use complete
  settings-chosen openings only where
  both rows were active, split planning from implementation and add audit and
  rebuttal cost. Later and command-line rounds stay descriptive. Coder
  comparisons use one closed and assigned plan per example. The archived plan
  supplies the listed steps, every hosted share must be present and the
  whole-plan audit must follow the final share. The comparison adds step and
  implementation-fix time and excludes planning fixes. A missing assignment,
  unavailable step time or model mismatch keeps the plan visible but unranked.
  Mean and standard deviation come from `simple-statistics`.
  Direct observed-range comparisons own the graded reading and clear-cut
  recommendation. Coder spread and worst-plan yield may block a lead. Current
  auditor rows come from the newest round and current coder rows from the live
  coder list. The command starts no assistant and writes no round file or
  round data. Like other commands that read settings, it creates a missing
  `settings.json` from the defaults.
- `round-paths.ts` owns the file-name grammar, target names, round allocation candidates, existing
  document resolution and report deletion for both entry routes. A plan target's name carries
  `-plan` or `-impl-<scope>` after the stem, matching the `plan-audit` and `impl-audit-<scope>`
  commit roles. A round's title opens with its kind and scope, such as `Plan audit of <plan>` or
  `Implementation audit of <plan>, steps 1-6`, and `transcriptKind` reads the kind back from it. It
  uses each commit group's captured starting HEAD, drops the first plan reference's `plan@` prefix,
  shortens each group after its first reference, joins group labels with `+` and
  scans the plan root for the next target-wide number.
  Automated rounds supply every phase path. A manual audit names only its claim and report; later
  manual phases retain that report's round and name their output with the current session's writer
  tag. `manualPhasePaths` returns the ordinary phase arguments and finds review inputs only within
  the exact round at the report's root. With no input, it selects the most recently modified
  eligible document at the plan root: the other assistant's audit for vet, the current assistant's
  audit for rebuttal or either assistant's audit for fix. Several reviews of one round resolve the
  same way unless one is selected. `deleteRoundReports` deletes only audit, vet and rebuttal files
  for that exact round, using recorded filenames without consulting model settings, and returns
  their names. Per-plan round data does not participate in numbered allocation.
  `queueFile` names a plan target's `<target>-queue.md` beside its rounds. It
  carries no round number because it
  belongs to the whole sequence: one path stays valid across rounds, so an
  editor holding it open keeps editing the file the runner reads.
- `context.ts` resolves the installed Repo Edu checkout and its sibling plan root.
  It reads no invoking directory and carries no round kind.
- `target.ts` owns the argument grammar for automated rounds and `name`. `targetRequest` reads a
  plan stem with an optional scope, or commit references, which are a complete target. A plan's
  scope is the word `plan` for its planning round, or step scopes in audit order, each a step or an
  increasing range, separated by commas or spaces as auditor entries are; `planningScope` is the one
  spelling of that word, and it stands alone because a planning round and a step series share
  nothing a list could sequence. A commit target carries parsed groups across the phase boundary:
  bare references before the first `plan@` reference form the Repo Edu group, and that reference and
  every reference after it form the plan group. Each request group keeps its repository and
  references as typed; `default-target.ts` adds the resolved short references the filename uses. A
  commit-shaped plan stem keeps `.md` to identify it as a plan. Plan arguments drop `.md` and
  `-widen` and refuse paths with a stem example. `resolvePlan` accepts the active artifact at the
  plan root and reports an archived plan as unavailable for audit. `requiredActivePlan` accepts only
  the active artifact. It keeps path validation common while `close`, `settle`, `ready` and
  `implement` supply their own reason when no active plan exists. The audit workflow owns Git
  resolution and inclusive-range admission. `default-target.ts` captures each request group's
  starting HEAD once before round files are allocated and resolves every typed reference against it
  to the six-character name the filename uses, refusing a reference that names no commit before any
  round file is claimed. The runner passes those resolved groups unchanged and rejects multiple
  auditor entries for commit targets, which run once without a trajectory glance or watch.
- `default-target.ts` owns the round a plan argument or no target selects, under
  [Plan targets](#plan-targets), so the plan's history rather than a typed word decides between
  planning and implementation. It reads both histories. Each repository's own Git order decides
  whether its marker follows its newest hosted step. `stemCommits` merges the histories by date only
  when the runner chooses the newest active plan. Without a target it skips plans without an active
  artifact. It resolves the active plan before reading its step list, so a missing plan says so, and
  supplies the absolute plan path before any assistant starts. The `plan` scope selects a planning
  audit before the landed-step check, so it reads neither history nor list. Before any step lands,
  the bare plan selects a planning audit without reading that list. Concrete step scopes return
  after the landed-step check without reading the list, one target per scope in the order given, so
  every round still runs on one scope and keeps that scope's files, records and round data.
  `resolveTargets` returns that ordered list. For a commit target it also captures each repository's
  starting HEAD once and resolves each group's references to their six-character names. A commit
  target is a list of one. For a bare plan once a step has landed, `plan-steps.ts` supplies every
  listed step, hosting repo and audit range. Loose forms find each hosted step, its repo's newest
  step and its newest `implemented` marker. When every hosted share has landed and each marker is
  newer than its repo's latest hosted step, the bare plan resolves to the listed audit ranges in
  order followed by the full listed range. A sentence listing only that full range resolves it
  once. Otherwise it names pending steps by repo and every missing or stale marker. It does not skip
  a listed range because an implementation-audit record already exists for it. `defaultPlan`
  applies the same plan rule alone for the `plan` command and a `close` given no stem. The home
  `/brief-plan` and `/close` run `plan` for an omitted stem.
  The implement command reuses this per-repo progress reader without applying
  bare-plan audit selection.
- `command.ts` owns the command grammar, startup and final reporting, including the `--auditor` and
  `--first` options. It reads both values with the queue's entry grammar and refuses a list with no
  entries. `--first` takes exactly one entry and is refused beside `--auditor`, because the list's
  first entry already names the first round. The round is the command itself, taking the target as
  its own arguments. Its subcommands are `models`, `brief`, `settle`, `ready`, `implement`, `close`,
  `plan`, `name`, `paths`, `delete-reports`, `mark`, `episode` and `deferrals`. Help lists the
  round, `models`, `brief`, `settle`, `ready`, `implement`, `close` and `plan`, the commands a user
  runs. `models` reads its retained data and current coder list before assistant startup or release
  resolution. The hand-run launchers call `name`, `paths`, `delete-reports`, `episode` and
  `deferrals`, and the reopen step calls `mark`, so help hides them. `plan` prints the plan an
  omitted target selects, as its absolute path, and writes nothing, so a user can see it before a
  round or close takes it. `close` resolves its plan and open deferrals before startup, then runs
  the close phase alone with its own log. The `deferrals` command prints the active plan's open set
  through the shared owner. It exists only for the hand-run implementation audit and close, so help
  hides it beside `episode` and the other launcher interfaces. The `episode` command prints the
  requested line range from joined watch evidence produced by the shared reader and formatter, with
  its returned range and current total. Every call rebuilds the view. It performs no release
  resolution, assistant startup or file writes. The `name` command claims a round and prints its
  claim, workflow, working checkout and audit arguments. Its required `--auditor` is the hand-run
  session's full tag, including `u`, checked separately from a round's model request. The `paths`
  command prints the workflow, working checkout and argument paths for an existing report as a JSON
  object. It reads the report opening's named workflow to select its kind. Both commands bypass
  assistant startup and release resolution; `paths` writes nothing. The `delete-reports` command
  uses the same deletion function as the coordinator and starts no assistant or release resolution.
  `settle` and `ready` resolve the active plan that `plan` prints when no stem is given and run only
  the lifecycle Git owner. The hidden `mark` command claims an active plan's next round number for
  an empty `reopen` marker and prints its path, with no release resolution or assistant. So the
  program carries an action handler, Commander adds no `help` command, and each command's own `-h`
  prints its help. A bare command line prints that help; options without a target take
  `defaultTarget`. `implement` requires its named active plan's assigned ready marker before
  assistant startup. It uses the assigned coder for every selected pending step and verifies the
  landed share subjects after each worker before continuing. It also owns the round sequence and its
  counter. Without `--auditor`, an active plan target runs an automatic series. The `--first`
  selection runs first, or the configured default without it, then each judge answer names the next
  assistant or an ending. A `random` default resolves its opener for each scope's series on a coin.
  Only that first round carries the selection's fields. The series writes no queue and ends on
  settle or stop, the configured maximum, a failure, an unanswered ruling, a red watch or a phase
  change. Before an automatic implementation series starts, the runner computes the open set and
  chains one scoped planning round for plan-bound deferrals. After each finished
  implementation-audit round, it computes the set again. It chains the planning round only when the
  series remains eligible to continue to its judge. A red implementation watch or a plan phase
  change caused by the implementation fix leaves the deferral open, prints it and stops the series.
  The chain uses the deferring round's assistant, claims its own planning-round number, takes no
  implementation-series turn and ends the implementation series when it fails, awaits a ruling,
  changes phase or receives a red watch. Every automatic series ending on a plan prints the
  remaining open deferrals or says there are none. A round that changes the plan's phase finishes
  without a judge answer. Commit targets run once, on the `--first` selection when given. With
  `--auditor`, the first entry runs first and the remaining entries on a plan target seed its
  editable queue. A clean audit removes queued entries that resolve to that round's assistant, model
  and effort. Other settings remain. A fix that lands a clean record removes none. Failure, a round
  requiring a ruling, a red watch or an empty queue stops the manual sequence, and the queue file is
  deleted however the sequence ends. Each manual round prints the queue's path and contents when it
  opens. Each automatic round prints its judge answer and reason and repeats the reason in the line
  that ends the series or opens the next round, so the log and the terminal's last lines both carry
  the recommendation. A resolved scope list, whether typed or derived from a completed plan's audit
  ranges, runs one series per scope in list order. Each scope opens as its own series: the opener is
  chosen again, `--first` opens every scope and the round count starts over. A judge stop or the
  maximum ends only that scope and the next one is announced. A failure, an unanswered ruling, a red
  watch or a plan phase change ends the whole list and names the scopes that did not run. After
  target resolution, the list is refused beside `--auditor`, whose queue belongs to one target and
  whose pairing with the scopes would need a second reading, and beside `name`, which claims one
  round. Each round records its own file pair and the coordinator has no filesystem side effects: it
  opens one output per round, retires the previous one first, and reads updates and settings once
  for the whole run before opening any files. Startup messages go only to the terminal; the run log
  begins with the models table. A chained round carries its place in its title and independently
  claims the next number for its target. Required write failures stop phase progression. If
  recording itself fails, the emergency channel still reports the known session and recovery
  command.
- `queue.ts` owns the shared entry splitter and the queue file's contents. Commit references, plan
  scopes, `--auditor`, `--first` and queue files admit entries separated by commas, spaces or line
  breaks. Auditor entries are each read by `parseAuditor` and keep the user's spelling, so a rewrite
  changes only which entries remain. It resolves each entry through the same phase settings and
  startup model selection as the round, so ending signals
  compare the exact assistant, model and effort rather than the entry's spelling. The runner reads
  the file only between rounds, so an edit made during a round applies from the next one. A missing
  file reads as an empty queue. A malformed entry stops the sequence with an error naming the file
  and the entry.
- `contract.ts` invokes the same assistant and output boundaries with a probe prompt on the built-in
  default selection. It requires successful and deliberately failed shell calls before replacing any
  selected fixtures. The Claude probe also ends a turn on a background command and the recorder
  requires that second turn, so the recording pins one result per turn. A second probe resumes the
  first session and requires token usage from both invocations. It invokes no workflow and
  refreshes only this package's recordings.

The coordinator has no process, filesystem or terminal side effects of its own.
Its dependencies supply those operations explicitly. A returned phase failure
stops the sequence. A rejected phase invocation also stops it without retrying;
the invocation owner must release its resources before rejecting.

`phase.ts` owns workflow and launcher selection. Audit, vet, rebuttal and fix use the single
launcher set under the plan checkout's `home/`; their workflow follows the round's kind. Brief
and watch have no launchers; the runner supplies their Repo Edu workflows directly. Implement also
has no launcher and uses Repo Edu's worker-only workflow. Judge and close
also have no launchers and their workflows live in the plan checkout, because series choice and
loop-close are plan doctrine.
`phaseSkills` names each phase's skill folder and launchers. The brief phase's skill is
`brief-round`, so its name stays apart from the home `/brief-plan`.
Planning sessions work in the plan checkout; implementation and commit sessions work in Repo Edu.
Every round file lives at the plan root. The runner names all input and output paths before the
audit. The runner saves audit, vet and rebuttal final responses; the brief session writes its own
document and the watch returns its document for the runner to publish. The judge returns its one
answer to the runner. Report phases finish only when their supplied output exists and is non-empty.
Claude receives the peer checkout as an additional directory; recovery commands restore the working
directory.

Workflows own findings, authority, gates and phase outcomes. The shared
Runner result rule in
`../../.agents/references/round-protocol.md#runner-result` defines their
meaning. Phase results carry only status and reason. The runner reads reports,
vet twins and the fix's landed subjects for routing and completion checks. It also reads
each commit group's starting HEAD before naming, resolves the typed references
against it for the filename, and reads the log the glance counts; the audit
workflow resolves the audited scope against that carried starting HEAD. Keep
assistant adapters independent of the product LLM adapters.

## Round files

`round-paths.ts` owns every round filename and order number. Files live at the
plan repo root and use
`<target>-<round>-<order>-<kind>.<tag>.<ext>`. Markdown documents use `.md`;
the transcript and standalone brief logs use `.log`. Five forms omit the tag:
the number claim, the settle and reopen markers, the handoff and the
target-wide queue. The plan doctrine owns the handoff's six-character commit
name.

| Order | Kind | Files |
| --- | --- | --- |
| 0 | claim | Empty number reservation, no tag |
| 0 | settle, reopen | Empty plan phase-change markers, no tag |
| 1 | round | Transcript and log |
| 2 | audit | Report |
| 3 | vet | Vet twin |
| 4 | rebut | Rebuttal twin |
| 5 | fix | Reserved, no report |
| 6 | brief | Brief and standalone log |
| 7 | ruling | Ruling |
| 8 | glance | Reserved, no report |
| 9 | watch | Watch |

Skipped phases leave gaps. A plan audit target ends in `-plan`; an
implementation target ends in `-impl-<a>..<b>`, with step and round numbers
padded to at least two digits. A single step repeats its endpoint. A commit
target opens with the fixed word `commit-`, so every commit audit sits together
in a sorted file list as plan targets do under their stem. Each group's label
is its first reference with every commit resolved to the six-character name the
plan doctrine fixes for the handoff, `HEAD` and `HEAD-<n>` included and a range
keeping its `..`, followed by `-plus-<n>` for a list after that reference. The
resolved form, never the typed spelling, names the file, so one commit scope
keeps one filename and one round sequence however its commits were typed. The
first plan reference's `plan@` prefix stays out of its label. Group labels join
with `+` in command-line order.

Later phases preserve the report's target and round. Their tag names their own
writer under Repo Edu's **Commit Capability Tag**, not the report's auditor.
The transcript and its log use the auditor tag. A hand-run session resolves its
own model and effort before asking the runner for a path. The runner resolves
every file-writing phase's tag before opening output.

`round-data.ts` owns `<stem>-plan-rounds.json` and
`<stem>-impl-rounds.json`. They are checked, gitignored arrays keyed by target
and round number. Each entry records the resolved scope, settings, phases,
landed commits, findings, status and judge answer. Each phase carries the
model and effort the tool reported and the launched selection the settings
named. The writer publishes a
complete replacement through a temporary file. Loop-close moves existing files
beside the archived plan. These are machine artifacts and are never edited by
hand.

The implement command retains one log and one possible ruling beside the plan
root as `<stem>-impl-<step>-implement.<tag>.log` and
`<stem>-impl-<step>-implement-ruling.<tag>.md`. These are phase files, not audit
round files. A fresh worker owns each step log.

## Phase routing

`requests.ts` resolves every workflow header and supplies its listed files
whole. `round-paths.ts` supplies each phase's absolute arguments in this order:

- audit: report output, then either a plan with an optional implementation
  scope and open-deferral object, a plan with an open-deferral object for a
  chained planning round, or one structured object per commit group carrying
  its repository, typed references, starting HEAD and the resolved short
  references the filename uses
- vet: report input, vet output
- rebuttal: report input, vet input, rebuttal output
- fix: report input, then existing vet and rebuttal inputs, followed by the
  same open-deferral object for a chained planning or plan-scoped
  implementation round
- implement: plan, one-based step number, remaining hosting repo shares,
  resolved model release and launched effort; the ruling path is supplied
  separately and reused when the same worker resumes
- brief: transcript input, brief output
- watch: no path arguments; the prompt separately supplies the evidence
- close: plan, capability tag, model record, open-deferral object and optional
  abort reason

The runner saves audit, vet and rebuttal final text without the parsed phase
result line. It then reads the report under the round grammar and fails the
round when the report's `Target:` line does not repeat the target it supplied
to the audit, before any later phase starts, so a vet never has to ask which
target a report judged. The brief writes its supplied output. The watch returns Markdown
and its grade; `round.ts` publishes the admitted document and cadence entry. A
fix or implementation worker receives its ruling path separately and reuses it
when the same session resumes. An implementation resume carries the user's
reply but no time value.

Hand-run phases use the same resolver. `name [target] [scope-or-commits...]
--auditor <full tag>` claims a new round and prints `cwd`, `workflow`, `claim`
and ordered `arguments`. `paths <vet|rebut|fix> [report]` prints `cwd`,
`workflow` and ordered `arguments` for an existing round. Vet and rebuttal also
take `--writer <full tag>`. With no input, `paths` selects the most recently
modified eligible report at the plan root: the other assistant's for vet, the
current assistant's for rebuttal and either assistant's for fix. It keeps the
newest matching review twin unless `--vet` or `--rebut` selects one. Neither
command loads settings or starts an assistant, and `paths` writes nothing.

Work in the printed checkout and follow the printed workflow. Planning phases
run in the plan checkout; implementation and commit phases run in Repo Edu.
Never claim a new number to continue an existing round.

## Plan targets

`default-target.ts`, `target.ts` and `plan-steps.ts` resolve plan targets. The
[round grammar](../../.agents/references/round-grammar.md#implementation-plan-step)
owns the parsed step form. The plan's first implementation-step list and joined
stem history decide what a bare plan name means:

- Before any step lands, it selects a planning audit.
- After every listed share lands and each hosting repo's newest `implemented`
  marker is newer than its newest hosted step, it reads the fixed `Audit
  ranges:` sentence in **Execution and audits**. It selects each listed range
  in order and then the full range from step 1 through the last listed step. A
  sentence listing only the full range selects it once.
- Otherwise resolution stops and names every pending share and missing or stale
  marker. The user may name a concrete step or range to audit before whole-plan
  completion.

A concrete step scope selects an implementation audit and is refused before
any step lands. A list of step scopes, as in `pnpm audit-round <stem> 2,3-5,6-7`,
selects one implementation audit per scope and runs an automatic series on each
in list order. The completed bare name uses the same path for the plan's listed
ranges and its final full range. It skips no listed range because that range
has an earlier implementation-audit record. Once a step has landed, no
unscoped invocation selects a planning audit. The scope word `plan`, as in
`pnpm audit-round <stem> plan`,
selects the planning audit whatever has landed, without reading the step list.
It continues the plan's `-plan` round series and data file, so the round lands
the ordinary `plan-audit` record. The plan doctrine's
[Ready marker](../../../plan/CLAUDE.md#ready-marker) owns when the user
reaches for it. With no target, the runner selects the active artifact whose
stem commit is newest across both repos. `plan` prints that selected plan
without writing anything.

## Report lifecycle

A finished fix causes the coordinator to delete that round's audit, vet and
rebuttal files after it validates the landed records. Other outcomes retain
them. `delete-reports <target>-<round>` gives a hand-run completion the same
deletion owner. It uses the filename parser, lists each deletion and fails when
no report matches. Claims, markers, transcripts, logs, retained round data,
briefs, rulings, watches and other rounds remain.

A clean plan-target audit lands its record through `clean.ts` and retains the
report. A clean commit target lands no record. Loop-close separately archives
the plan and removes its sidecars under the plan repo workflow.

## Commands

### Model settings

Edit `tools/audit-round/settings.json` to change model selection for runs from
either checkout. Changes apply to the next invocation. This local file is
gitignored. When it is missing, the runner creates it from
[default-settings.json](default-settings.json), the version-controlled
defaults. An invalid file stops the command with a validation error and is
left unchanged.

- `defaultAuditor` selects Claude or Codex when neither `--auditor` nor `--first` is given.
  `random` flips a coin for the opener in each scope's series, so neither assistant always takes
  the first look at a target; the round data still records that choice as settings-chosen.
- `maximumAutomaticRounds` limits an active plan's automatic series, counting
  its first round.
- `strengthModels` maps each assistant's base and top tiers to a model name.
  The same names classify reported models for capability tags. A family alias
  such as `opus` follows the CLI's current release; a full model name pins it.
  The settings header shows the release either one resolves to.
- `defaults` names each assistant's default model and effort outright. A phase
  field that says `default` reads it, and `--auditor claude` or `--auditor
  codex` runs the audit on it. Neither CLI's own model configuration is ever
  read, so this file alone decides what every phase runs on.
- `coders` is a non-empty ordered list. Each coder names its assistant, full
  model and effort. Ready advances from the newest earlier assigned plan and
  wraps at the end. A one-entry list always selects that coder.
- `phases` sets each phase's model and effort. Each assistant's audit selection
  is one `{ model, effort }` object. Each field
  names a value or says `default`; `null` is refused. A named model must suit
  the selected CLI.
- Audit and vet each have separate Claude and Codex selections, so changing
  auditor in a chain keeps each CLI on its own model. Rebuttal shares the
  audit selection. The vet uses the other assistant. The document phases,
  judge and close each select their assistant, whoever audited. Fix uses the
  plan's ready assignment, or the first coder when the target has none.
- A field supplied by `--auditor` or `--first` wins over the corresponding
  audit setting. Other fields use this file.
- The names `claude` and `codex`, given to `--auditor` or `--first`, run the
  audit and rebuttal on that assistant's `defaults`, bypassing its audit pin
  in this file. Each list entry selects its own settings independently. Other
  phases keep their configured selections. Letter tags may omit fields and
  inherit them from that assistant's audit selection.

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
pnpm audit-round example 2,3-5,6-7
pnpm audit-round example 3 --auditor a -v
pnpm audit-round example 3 --auditor atx
pnpm audit-round task-modifier 1-4 --auditor claude
pnpm audit-round task-modifier --auditor codex
pnpm audit-round example plan --auditor claude
pnpm audit-round example 3 --auditor codex,claude,claude
pnpm audit-round example 3 --auditor "atx, obm"
pnpm audit-round example 1-4 --first codex
pnpm audit-round example 3 --no-watch
pnpm audit-round example 3 --brief
pnpm audit-round HEAD-1
pnpm audit-round HEAD-2..HEAD
pnpm audit-round HEAD plan@HEAD
pnpm audit-round --auditor codex
pnpm audit-round brief example-impl-03..03-01-1-round.otm.md
pnpm audit-round brief
pnpm audit-round models
pnpm audit-round plan
pnpm audit-round settle example
pnpm audit-round settle
pnpm audit-round ready example
pnpm audit-round ready
pnpm audit-round implement example
pnpm audit-round implement example 2-4
pnpm audit-round close example
pnpm audit-round close
pnpm audit-round close example --aborted "The check cost more than it gave."
pnpm audit-round name example 3 --auditor oth
pnpm audit-round name --auditor oth
pnpm audit-round paths vet example-impl-03..03-01-2-audit.oth.md --writer abx
pnpm audit-round paths rebut example-impl-03..03-01-2-audit.oth.md --writer otm
pnpm audit-round paths fix example-impl-03..03-01-2-audit.oth.md
pnpm audit-round delete-reports example-impl-03..03-01
pnpm audit-round mark reopen
pnpm audit-round episode example --lines 1-200
pnpm audit-round episode HEAD-2 --lines 201-400
pnpm audit-round:contract
pnpm audit-round:contract codex
```

The round names the report, vet, rebuttal, brief, ruling and watch before the
audit starts. It writes the tagless claim, transcript and log at the plan root.
A round on an active plan also updates `<stem>-plan-rounds.json` or
`<stem>-impl-rounds.json` there. Closed-plan data remains archive evidence.
Phase files use
`<target>-<round>-<order>-<kind>.<tag>.<ext>` under
[Round files](#round-files). Each phase receives its complete inputs under
[Phase routing](#phase-routing); the watch has no path argument because the
runner owns both writes.

`models` reads every retained round-data file and both Git histories. It prints
auditors, then coders. Each section opens with the graded comparison of current
rows and states each current thin row's shortage once per work class. It gives
a recommendation only where the current rows have the required sample count,
their observed ranges separate and yield does not conflict with a clear time
lead. The tables keep every recorded model visible. Auditor rows split
settings-opened, later and manual rounds by audit class and show audit plus
rebuttal time, accepted and dropped A/B findings, tokens and vet settings.
Coder rows show admitted plan count, yield and time per step, spread, worst
plan, dropped findings, implementation-fix tokens and excluded plans. A coder
lead is withheld when its spread or worst plan is worse than another current
ranked coder's. The command renders Markdown, starts no assistant and writes no
round file or round data. Like other commands that read settings, it creates a
missing `settings.json` from the defaults.

`name` prints one JSON object with `cwd`, `workflow`, `claim` and `arguments`.
The arguments hold the report path followed by the resolved plan and scope, or
the commit groups with their captured starting heads.
It creates only the claim. It does not load settings or start an assistant. Its argument grammar
is the same as the automated round, from either checkout. A plan argument or no target resolves
under [Plan targets](#plan-targets).

`paths <vet|rebut|fix> [input]` resolves a later manual phase and prints its working checkout,
workflow and arguments as one JSON object. Vet and rebuttal take `--writer <full tag>` from
the current session. Fix writes no phase report and needs no writer tag. Without an input, the
command selects the most recently modified eligible file at the plan root. Several reviews of
that round resolve to the newest unless `--vet <file>` or `--rebut <file>` selects one. The
command writes nothing and never
claims another number. [Phase routing](#phase-routing) owns the manual
invocation details.

`settle [stem]` takes an active widening plan, or the plan `plan` prints when
no stem is named. It refuses any other current filename and a target plan with
untracked, staged or unstaged changes. It renames the plan onto its bare name,
commits only that rename as `<stem>/settle: settle the plan's shape`, then
claims and prints the empty settle marker beside the commit. Unrelated work in
the plan checkout remains untouched. It loads no settings and starts no
assistant.

`ready [stem]` takes an active settled plan through the same resolution and
plan-file preflight. It refuses a widening plan and a stem whose history
already carries a ready marker. It advances through `coders`, after the newest
earlier assigned ready marker, and records the assigned coder in the body of
`<stem>/ready: declare the plan ready for implementation` with an empty commit
that preserves unrelated staged work. It reads settings but starts no assistant
process or release lookup.

`implement <stem> [scope]` requires an active plan with an assigned `ready`
marker. It parses the plan's implementation steps and scans each hosting
repo's log independently. It starts one fresh worker per selected step that
still has a missing share, in step order, on the assigned coder's resolved
release and effort. A ruling reply resumes that worker without adding a time
argument. A failed worker, unanswered ruling or missing landed share stops
before the next step and prints the worker's recovery command. Once all shares
hosted by a repo have landed, the runner writes that repo's `implemented`
marker. The command retains one phase log per started step.

`close [stem]` closes a plan's loop under the plan repo's
[loop-close workflow](../../../plan/.agents/skills/close/references/workflow.md). It takes an active
plan's stem, or the plan `plan` prints when none is named, and refuses an archived plan as already
closed. Without `--aborted` it also refuses a plan whose stem scan holds no `ready` marker, before
any assistant starts, because the unmarked archive form records shipped work. `--aborted <reason>`
archives an episode that never shipped and passes the reason for its README. One session, on the
`close` settings, moves the plan, rewrites the links to it, writes each repo's `closed` commit,
moves its round-data files into the archive folder and deletes the topic's sidecars. It works in the
plan checkout and writes only `<stem>-close.<tag>.log` beside the plan root's other runner files.
The runner resolves the plan's open deferrals before the session starts and supplies them in its
phase arguments. Where close would need the user's answer, including permission to archive with an
open deferral, it fails with the question, and its printed resume command continues that session.

`deferrals [stem]` prints one active plan's open deferrals through the shared owner. It resolves the
same default plan as close when the stem is omitted. It starts no assistant, performs no release
resolution and writes nothing. The command is hidden because only the hand-run implementation
audit and close workflows need the list before their sessions start.

`delete-reports` deletes the audit and twins for its exact target and round at the
plan root and lists each deleted file. It fails when no report matches. Claims, markers and
runner documents remain.

`mark reopen [stem]` claims the next plan-round number of an active plan, or of
the plan `plan` prints when none is named, writes the empty
`<stem>-plan-<round>-0-reopen.md` at the plan root and prints its path. The
marker takes a number so a file list shows where the reopen fell among the
rounds. The plan repo's
[Artifact lifecycle](../../../plan/CLAUDE.md#artifact-lifecycle) owns when each marker is
written; the command loads no settings and starts no assistant.

`episode [stem-or-commit] --lines <start>-<end>` prints one one-based inclusive
line range from the current indented watch evidence view. It resolves the
target before reading the range: omission selects the newest topic across both
repos, a commit anchors its hosting repo and HEAD forms mean Repo Edu. The first
line states the returned range and the view's current total line count. An
out-of-range request reports `none` and returns no evidence lines. Each call
reads both histories and current round data again. It starts no assistant and
writes no file, cache entry or snapshot.

The brief writes a plain-words twin only after the full fix has completed, then prints the saved
document in the terminal. Only `--brief` runs it, for every round, without changing the watch. A
clean audit records its outcome directly and retains the report, without review or fix sessions. An
automatic clean round still runs its judge. A fix that stops for a ruling adds a ruling twin. A
finished plan round with audit findings ends with a glance at the commit record, and a due glance
adds a `-watch.md` document. The watch keeps its own history in the shared cache, which is how its
cadence survives between rounds, and `--no-watch` skips both. `brief` accepts an earlier transcript
at the plan root, or takes the most recently modified one when none is named. It reads its kind from
the transcript title, writes beside it without claiming a new number and overwrites its standalone
log on each run. Without `--auditor`, an active plan runs an automatic series from the `--first`
selection or the configured default, follows each fresh judge answer and stops at settle, stop or
its maximum without writing a queue. A settle answer prints its reason and leaves the widening plan
unchanged for the user to settle or keep widening. A detailing stop whose reason recommends ready
leaves the settled plan unchanged for the user to mark ready or keep detailing. Commit targets run
once. A scope list runs that series once per scope in list order, each scope on its own target, and
stops the whole list only where a series needs the user: a failure, an unanswered ruling, a red
watch or a plan phase change. `--auditor` accepts one selection or a sequence on the named plan
scope, separated by commas or spaces. Repeated entries request separate rounds. The entries after
the current round wait in `<target>-queue.md` at the plan root. Edit it to add, remove or reorder
rounds; the runner reads it between rounds and deletes it when the sequence ends. An empty or
deleted file ends the sequence after the current round. Every completed automatic round prints its
judge answer and reason, keeps them in the round transcript and repeats the reason in the series
ending or the next round's opening line. In a manual series, a clean audit skips queued entries with
the same resolved assistant, model and effort; other settings remain. Failure or leaving a ruling
without a reply stops either sequence. A submitted reply resumes the fix, then the sequence after
the round completes. Each header records the round's start time; filenames carry no timestamp.

Before an automatic implementation series starts, the runner chains one
planning round when the shared owner finds an open deferral into the plan repo.
After each finished implementation-audit round, it computes the open set again.
It chains the planning round only when the series will continue to its judge. A
red implementation watch or a plan phase change caused by the implementation
fix leaves the deferral open, prints it and stops the series. The planning round
receives only those deferrals, runs before the implementation judge and does not
count against the implementation-series maximum. Every automatic series ending
then prints the remaining open deferrals or says there are none.

Before each plan-scoped implementation audit, the runner supplies the open
deferrals into Repo Edu to its audit and fix phases. Those items add Repo Edu to
the judged repo set for their named corrections. A hand-run audit reads the same
owner through the hidden `deferrals` command. The audit report opening names
each supplied item whose correction already holds. Findings name the missing
items. A clean round cites satisfied items. A fix reads both report parts and
cites each item it applies or drops.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use child processes and the recordings under
`src/__tests__/fixtures`. Ordinary tests make no live model calls.

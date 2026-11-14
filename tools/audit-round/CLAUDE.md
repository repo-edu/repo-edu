# CLAUDE.md

This is the private planning and implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal and fix sequence, the reply a fix's open item
  needs, the watch that follows a finished planning or plan-scoped implementation round and the
  fixed decision that routes an automatic series. It retains the audit result and report as local
  values. Audit, vet, rebuttal and fix start fresh. A clean audit completes directly through
  `clean.ts` without vet, rebuttal, fix, glance or watch; an automatic series still applies its
  decision rules. The coordinator reads the report through `report.ts` to decide whether it is
  clean. A vet that accepted every finding skips the rebuttal the same way, because the auditor has
  nothing to answer; the fix then reads the report with its vet twin alone. The coordinator reads
  the twin through `vet.ts` to decide whether every finding was accepted from its verdict lines.
  Rebuttal uses the audit's resolved model and effort, including `--auditor` or `--first` fields,
  because it is the auditor's answer. Its workflow grounds answers in current sources. The settings
  file holds the planning and implementation work classes, the assistants that write documents and
  the default-auditor rule. Each work class owns its auditor list. Planning also owns its fixer and
  implementation owns its coder list. The audit target picks the work class and fixer, as
  [Model settings](#model-settings) routes each target.
  The fix receives a ruling output path separately from its report
  arguments. It writes the final ruling and checks it for clarity before returning `needs-ruling`.
  The runner checks that file, then waits for the user's answer under `ruling-wait.ts`; its notice
  says whether the fix uses the auditor's model, the vet's model or neither. A contested verdict
  goes to the user when the report or revised vet tier is A or B. The answer names `vet`,
  `auditor`, `neither` or `not yet` for each such finding, with a reason where a winner was named,
  and the free reply. It retains each winner and reason on the
  finding and passes them to the resumed fix. Every fix child receives the finding numbers still
  without winners in `COMMIT_OPEN_CONTESTS`; the shared commit hook refuses a commit while that
  value is non-empty, and the coordinator refuses a finished fix while any remain. A missing or
  empty ruling fails the fix with its
  recovery session. The same fix session resumes in the background with that reply. Further open
  decisions repeat this route and ask only for the findings still without winners. A completed fix
  follows the same report deletion, commit checks and watch as an uninterrupted fix. Ending the
  wait with Ctrl-C retains the round files and ends the auditor sequence. An open serious
  contest prints a runner recovery command. That route reloads the in-progress
  round, stored winners and the fix session, then re-enters this same loop. It
  appends the retained log and transcript. A submitted reply lets a completed
  round continue any remaining auditor entries. Further open decisions replace
  the ruling in that same session under
  [Writing a ruling](../../.agents/skills/fix/references/ruling.md). No separate
  ruling phases run. `runWatch` owns the watch that follows a round: the glance decides
  from the commit record and the watch's own history whether a watch is due, and only a due glance
  runs `watch` to return the finished document and grade. The audited plan's stem comes from
  `planStem` and selects both the glance record and joined watch evidence. Only a due glance
  computes and formats the Git episode and the plan's existing round-kind data files, once after the
  fix. Only the writer's prompt receives the snapshot separately from its empty phase-argument list.
  The glance is a dependency the runner supplies from `glance.ts`, not a phase, so a not-due round
  starts no session for it. The watch writer owns both the judgement and final wording. Its model
  and effort live in `settings.json`. The watch runs only after a plan round with audit findings
  that finished, because a round awaiting a ruling has not proved its work landed; nothing is lost,
  since the glance counts audit correction commits and not rounds. A round given no watch target,
  which is what `--no-watch` does, consults no glance at all. The watch reads the Git record and
  retained round data, so `runWatch` passes it no transcript or report. The watch-specific result
  returns its Markdown, parsed grade and the final compaction count owned by `RoundOutput`.
  `runWatch` rejects a compacted result before writing, then saves an admitted document before
  atomically replacing only its episode's cadence entry. A failed document write skips the record
  write. A failed record write leaves the valid document and earlier record in place. A finished
  round reports the returned grade, and the command runner ends the auditor sequence on red, so no
  queued round starts before the user acts on the watch. Before the watch, `round.ts` publishes the
  settled findings as the current `in-progress` round-data entry. After the fix, it resolves the
  plan's current filename. A widening fix must end with the grammar's settling line, which replaces
  the audit report's closing line as the entry's retained settling recommendation, because the fix
  ends the round and has answered every ruling it asked; a fix outside widening must return none.
  The watch still runs when the fix changed the plan's phase, but the series decision does not.
  After any other non-red round in an automatic series, the runner applies the three fixed rules in
  `judge.ts`. A plan target supplies its round-kind data and episode commits. A commit target
  supplies only its round data. The series pool is the target work class's auditor list. A read is
  current only after
  the latest settle, reopen, plan step, plan-file edit outside a round or audit with a real bug.
  Once every pool entry has a current read, widening follows its retained settling line, detailing
  answers ready before the ready marker and every other series answers stop. Otherwise the runner
  selects the pool entry without a current read that read the scope least recently. The output
  stores the answer, reason and ordered resolved pool in the final entry. Manual queues apply no
  automatic decision. The round records both repositories' HEADs before the fix, reads the landed
  records and validates every subject under its repository's grammar. A plan target keeps only the
  records whose subject carries its stem, because another plan's round may land in the same checkout
  while the fix runs. A plan target fails when a finished fix landed no commit. A commit target may
  land nothing, and a finished clean commit entry settles the runner's read without a landed record.
  Reader failures retain the owning phase and its session for recovery. The coordinator deletes the
  report set after these checks. Other outcomes retain the set. `runClose` runs the loop-close phase
  alone on its own settings. It passes the active plan, the capability tag and model record its
  commits carry, the open deferrals resolved before assistant startup and any abort reason. A
  finished close that left its plan in the active folder fails, because the move is the close. After
  that check the runner itself moves the plan's round-data files beside the archived plan and
  commits them through `lifecycle.ts`, as a second `<stem>/closed` record with the same tag and
  model record. The session does not move them: the files are gitignored while they sit in
  `active/`, so a session that forgot them lost the plan's whole round account to the next hand
  clean-up. A plan with no round data commits nothing. The printed `Committed` line names that
  commit.
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
  the user's `settle` and `ready` calls, whether the `settle` and `ready`
  commands or the run record them, plus each hosting repo's runner-written
  `implemented` marker and the close's round-data archive commit. That commit
  finds the one archived plan with the stem, moves each existing round-data
  file from `active/` into its folder with a plain rename and commits only
  those paths. No archived plan, or more than one, fails the close. It refuses an untracked,
  staged or unstaged target plan while leaving unrelated work alone. Settle
  commits only the widening rename before claiming its marker. Ready shares
  the `git commit --only --allow-empty` route with direct clean completion and
  validates the committed plan's steps and audit ranges, advances through
  `implementation.coders` and writes the assignment in its marker. Both routes
  keep the plan checkout's normal hooks enabled. An implemented marker carries
  the assigned coder's resolved model record and capability tag.
- `implement.ts` owns the assigned-ready gate, optional step scope, per-repo
  landed-share scan and sequential worker loop. It starts one fresh worker for
  each selected step with pending shares. A ruling resumes only that worker.
  A failed worker or missing share stops before the next step and retains its
  recovery session. A recovery binds at most one resumed session to the step
  it served. It uses that session only while Git shows the step selected and
  pending; otherwise the session stays unused and the remaining pending steps
  start fresh workers. After the loop, each hosting repo with every share
  landed receives its current `implemented` marker.
- `implement-output.ts` resolves the assigned coder's release, effort, tag and
  model record once. It names one retained log and ruling path per step. A
  recovery appends to that step's log, so the log keeps the failed turn.
- `plan-steps.ts` reads the first ordered list below the depth-2
  `Implementation plan` heading. It requires each item to open with a bold
  title and one closed host sentence, then returns the steps and their hosting
  repos in list order. It also reads the `Audit ranges:` sentence under the
  depth-3 `Execution and audits` subsection and requires its scopes to tile the
  listed steps in order.
- `report.ts` uses `mdast-util-from-markdown` to read the document-level opening and finding fields.
  The first grammar-owned field heading ends the opening; other level-2 headings stay inside it, so
  presentation depth cannot hide the workflow, target or judged repositories from the reader.
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
  answer lines and ignores every other line. A `Revise to [<tier>]` suffix records a changed tier;
  an unchanged tier stays plain `Revise`. It requires verdicts for the report's finding numbers
  in order and rebuttal answers for each revise, drop and ruling verdict. It refuses by name an
  answer numbered for an accepted finding, so a misnumbered answer fails on its own line rather
  than as a missing one. Only Accept verdicts skip
  the rebuttal. Both readers are supplied through `RoundDependencies`, alongside the HEAD and
  subject reads.
- `phase.ts` owns who runs each phase of a round and on what, and the capability tag's whole
  vocabulary in both directions: the letters a subject spells a phase with and `parseAuditor`, which
  reads each assistant name or partial tag in the `--auditor` list and the `--first` selection.
  Assistant names select the assistant's default selection. The
  three alphabets share no letter, so a partial tag says which fields it named. `roundPhases` is the
  one owner of the round's phases: it resolves the assistant's selection once for audit and
  rebuttal, the runner invokes from the value it returns and the run's settings header prints the
  same value, so what a round says it ran on is what it ran with. `roundFixer` is the one owner of
  who fixes a round; `command.ts` reads a ready assignment only for an implementation plan target
  and passes it in. `closePhase` names the loop-close
  on its own settings, because the close belongs to no auditor. Every phase names a model and an
  effort; a field that says
  `default` reads the assistant's default selection, so neither CLI's own configuration enters.
  `settings.json` owns the two work classes, phase selections, the default selections and the model
  tier table. `targetWorkClass` is the one owner of the target classification. Planning targets and
  plan-only commit targets select planning. Implementation targets and any commit target with a
  Repo Edu group select implementation.
  `settings.ts` loads and validates it once at command entry, independently of the working
  directory. That configuration is passed through routing, output naming and commit stamps.
  A listed auditor, a coder and the planning fixer carry both fields, each resolved at load when it
  says `default`.
  `--auditor` and `--first` override each field they name,
  using the configured tier table for its model, and a field nothing names reads the assistant's
  defaults. Listed auditors and command-line overrides bind the audit and rebuttal together,
  because the rebuttal is the auditor's answer. Each named field carries what named it, including
  which of the two options a tag came from, so the report never guesses, and either CLI accepts one.
  It also defines the private inputs and results for assistant invocations, and the shared workflow
  and launcher selectors, and owns which phases' texts enter the round transcript: audit, vet,
  rebuttal and fix. The ruling and watch are separate documents. The runner's
  automatic-series answer is terminal output and retained data, not a phase or assistant turn. The
  launcher and commit-record set stays the four recorded phases. The fix writes the ruling; the
  watch runs once the transcript holds the round. Assistant boundaries own processes,
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
- `judge.ts` builds bounded automatic-series evidence and applies the three fixed rules in
  `STOP-CONDITIONS.md`. A plan target supplies all of the stem's planning and implementation round
  data plus its episode commits. A commit target supplies only its round data. A read is settled
  when its findings have outcomes and it has a landed record, except that a finished or current
  clean commit round needs none. The current `in-progress` entry is eligible. The latest event is a
  settle, reopen, plan step, plan-file edit outside a round or audit with a real bug. A real bug is
  an accepted A in widening and an accepted A or B elsewhere. A hand-run audit represented only by
  Git still contributes its event. A retained real-bug round takes its event time from its latest
  landed record commit, so an overlapping audit that started before the fix is not current. Reads
  that started after the latest event are current. A read belongs to the pool entry its audit
  launched on, as the round data's seat records it, because a CLI may report another model or
  effort than it was asked for. When every pool entry has a current read,
  widening follows the current round's parsed settling line,
  detailing answers ready before the ready marker and every other series answers stop. Otherwise it
  selects the pool entry without a current read that read the scope least recently, with list order
  breaking a never-read tie, so the auditor of this round goes last. The same decision function
  serves `replay.ts`, which reads each answer stored without a pool as the assistant-keyed rules
  that produced it. `openingAuditor` applies rule 3
  when a series opens: when the retained data holds a current read of the target by one pool
  entry and none by another, the series opens on an entry without one, so a rerun after a
  failed round continues where the series stood. With no current read at all, or one for every
  entry, the configured default opens, because the rules give that round no reader and the user
  asked for one. `auditorText` owns the answer's `<assistant> <model> <effort>` spelling.
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
  stamp repeats neither, and requires a model line otherwise. It refuses a commit when
  `COMMIT_OPEN_CONTESTS` names serious findings that still need the user's winner. It also refuses a
  single-model record whose effort disagrees with the tag, a step record
  without active implementation time and a ready marker without its coder.
  `commit-msg-main.ts` is the
  entry both repositories' hooks run, `<repo-edu|plan> <message file>`; a refusal names the grammar
  file.
- `assistant.ts` owns one invocation's session identity, final text and turn evidence. A session
  is one or more turns and ends with its process: Claude's print mode emits one result per turn,
  a background task or subagent wakes the session for a further turn, and while a subagent is
  pending the CLI defers the results and flushes them at exit behind an empty result of no turns.
  The phase's final text is the last turn's text. A model sometimes leaves the result line off a
  finished response, and that miss would fail a round whose work was complete. So when the process
  ends on a response without the line, the invocation resumes the same session once and asks it to
  end again. The request repeats no phase work, and the new response becomes the phase's final
  text. A second response without the line fails the phase with its session. A line that is
  present but malformed fails at once. The contract recorder supplies no such request, so each
  recording stays one invocation. After the process ends with at least one turn,
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
- `ruling-wait.ts` owns a ruling's wait under the ruling-answer plan's Decisions 2 and 3. While
  a fix or implementation worker waits for a ruling, the run listens on one Unix domain socket in
  the `rulings` folder under the cache root and serves two `node:http` requests: what is open, and
  the answer. The socket's name is a short hash of the plan stem or commit label the run serves,
  because a socket path is limited to 103 bytes on macOS and 107 on Linux. The run removes any
  file at its own path before it listens, because a killed run never closes its server and its
  file would block every later wait on the target. When two runs of one target wait at once, the
  later one takes the name and ending the earlier one removes the later one's file; that outcome
  is accepted. The one `zod` schema covers the waiting ruling and the answer document, and the
  winner words are `round-data.ts`'s list plus `not yet`. The module owns the one check for a
  complete answer: each open finding gets a winner with a one-line reason or `not yet`, which
  takes no reason, and the free reply may be empty only when every open finding has a winner. An
  implementation ruling has no finding, so its answer is the reply. The run replies accepted or
  refused with every missing part named, and a refusal keeps it waiting. The hidden `ruling` and
  `answer` commands are only carriers: they find the waiting runs through the folder, count a
  socket that refuses the connection as no run and take the one run that waits when no target is
  named. The module also starts `claude --desktop` in the folder of the work, as the runtime
  configures the Claude executable. A failed start prints one line and the wait goes on. The
  runner's signal ends the wait unanswered. The assistant never inherits the terminal, and reply
  recording completes before the fix can resume.
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
  `--model` and `--effort`. A fix awaiting a ruling and a failure both carry
  their phase, so continuation and recovery use the model the round ran that
  phase on. The serious-contest recovery command names the report and fix
  session as quoted runner arguments. Claude uses
  `--permission-mode auto` in release resolution and every session entry. `requests.ts` also
  supplies each fresh phase's selected workflow and whole files listed by the workflow's `reads`
  header. Header paths resolve from the workflow file. `vfile-matter` parses the header and `zod`
  checks its shape. Listed workflows supply their own reads recursively, with each source included
  once. Audit, vet, rebuttal and fix also receive their home launcher. The watch has no
  launcher; its workflow header lists the `simple` definition directly. The close has no launcher
  either, and its prompt names a loop-close rather than a round phase. Resumed sessions receive no
  files again. The request for a missing result line opens as every phase prompt does, so the
  session reads it as an unattended phase. It asks for the complete response again, because the
  runner reads only the last turn's text.
  Root instructions are not listed. Both assistants receive their phase prompts on
  standard input. Codex command-line arguments contain no prompt text, including on resume, so
  joined evidence is not limited by the operating system's per-argument size. The same collected
  file list produces a separate log prompt containing source paths with an omission notice in place
  of file contents.
- `output.ts` owns terminal presentation and incremental run recording. A run description names the
  run, lists the phases it may run and locates its files: every round records a log and transcript,
  a round on an active plan updates one machine-readable per-plan data file, and a commit audit
  updates its label's machine-readable commit data file. A close records only
  `<stem>-close.<tag>.log` in the active folder. The close's run also yields the tag and model
  record its session hands its commits. It uses `round-paths.ts` for file names and round identity.
  It validates all file-writing phase tags before `run-files.ts` exclusively creates the tagless
  claim, then opens the transcript and log. The claim remains after success or failure, and a
  conflict stops without retrying. Each entry carries its phase, so the settings header reports the
  model and effort that phase will run on, each in its own aligned column. It names what set each of
  them: `--auditor` or `--first`, `audit-round auditors` for a listed auditor,
  `audit-round settings` for the phase's own pin, or `audit-round defaults` when the phase says
  `default`. A phase whose two fields came from different places names both, model first. A pinned
  model reads as the release its CLI resolved it to at startup, so every row names a release. The
  output holds its round mark and current phase timing. It keeps context observations and each
  started phase's model selection, time, tokens, peak context and compaction count. It warns once
  when audit, vet, rebuttal or fix first compacts. The watch returns the final count to `round.ts`,
  which fails a compacted result with the evidence size and the need for one uncompacted session. A
  phase starts with its launch selection, then its CLI's model feedback replaces it. Each finished
  invocation adds its elapsed time to the phase's time. Both assistants' latest session totals
  replace the earlier reading, so a resumed fix counts each token once. Each phase prints its
  per-model input, cached input and output totals beside its elapsed time. Commit stamps use those
  phase selections and add a time line for the audit, vet and rebuttal that finished. Every status
  stamp shows three assistant times, as `[fix] 01:00  round 03:05  run 42:10`: the phase's, the
  round's and the runner invocation's. Every logged tool line opens with its step's own time, the
  assistant time since the previous tool line or since the phase start for the first, followed by
  the round's and the invocation's totals. The run's ending lines repeat the invocation's reading,
  so it survives the last stamp. Minutes count on past the hour, as `102:10`, so every reading keeps
  one shape. `run-clock.ts` owns what those readings count. `runCommand` creates one clock per
  invocation and hands it to every output, so a chained run's rounds, implementation and close share
  it. Each output takes its round mark at construction. A round measures its assistants, so time the
  user holds is not the run's. Printing the ruling notice opens a wait and an accepted answer or an
  ended wait closes it. Each phase, each round and the invocation read the same waiting total
  through their own mark, so a wait leaves all three alike and one rule serves every reading. The
  readings are display only; round data keeps per-phase milliseconds and no run total. Two baselines
  measure context growth: a written status stamp reports the tokens added since the previous written
  stamp, and a logged tool line reports the tokens added since the previous tool line, beside the
  time since it. Both chain into the totals beside them; a fresh phase starts its stamp baseline at
  zero and a resumed phase reports no first change. `round-data.ts` owns the checked JSON schemas,
  the atomic replace-or-append writer, the disproved-finding writer, the read of one plan's existing
  round-kind files from one selected active or archive folder and the commit-series readers. The
  series decision reads one active commit series. The replay reads every active commit series. Each
  file is an object whose `rounds` list holds the round entries. Plan files also hold the user's
  later rulings in `disproved`. An attached ruling names whether the finding or its non-accepting
  vet verdict was wrong; an older attached ruling without that field means the finding. The series
  runner reads commit files before reruns and the runner reads them after automatic rounds. Commit
  files have no `disproved` list. A finding review carries its report number, report tier, verdict
  and optional changed vet tier; retained finding data stores those values and the rebuttal answer.
  A serious contest may also store the user's winner and reason. A planning entry's required
  `settling` field keeps the widening round's settling recommendation as it stands when the round
  ends: the fix's settling line, or the audit report's closing settling line when the clean audit
  ran no fix; detailing entries use `""`. The planning, implementation and commit files each hold a
  time-ordered entry per round. A commit entry also records its original groups, advancing groups
  and judged repos. An entry records state, settings, chosen auditor and source, the seat its audit
  launched on, phase measurements including peak context and compactions, landed commits, finding
  review and outcome data and any series answer. New automatic rounds also store the ordered
  resolved pool used for that answer. `RoundOutput` writes the settled findings as `in-progress`
  before later phases, then replaces the entry with its final state. The writer checks the whole
  object and publishes it by temporary file rename. `run-files.ts` completes each required write
  before returning to the invocation; no complete transcript accumulates in memory. `terminal.ts`
  renders assistant Markdown through the `pi-tui` Markdown component at the current terminal width,
  preserving paragraph spacing, nested lists and source finding numbers. It uses cyan for inline
  code without background blocks and honours `NO_COLOR`. It writes the rendered document directly
  and uses log-update only for the live status line, so permanent text is not wrapped twice.
  Redirected output retains the original Markdown. The log records each tool invocation once, with
  shell wrappers removed and no event envelopes or result payloads. Invocation lines stay complete
  in the log; assistant texts stay complete in Markdown. Only terminal tool lines shorten. The
  terminal omits the final `PHASE RESULT` control line; the transcript retains it. `beginRuling`
  releases the live status display and prints the ruling notice in place of the ruling's text: the
  round or step, the target, the ruling file, the findings that need a winner, whose model runs the
  fix and the `/ruling <target>` line to type in the desktop app. `endRuling` excludes the user's
  waiting time and records an accepted reply in the log and transcript before any resumed process
  starts. Assistant replies use the normal phase output, so launch prompts stay in the log and never
  reach the terminal. Supplied instruction files appear there by path only; their full contents go
  to the assistant. Each assistant's reported model line is followed by the model-change notice from
  `model-change.ts` when that comparison differs.
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
- `models.ts` owns the model read-out and its core and optional detail sections. `model-evidence.ts`
  reads checked round data once in the active folder and closed-plan archives, records each auditor
  sample's plan and whether it is that class's first complete round on the plan, then joins the
  step, ready and closed records from both Git histories. `model-comparison.ts` owns the same-plan
  comparison, the floor, opener bounds and the direct range comparisons that remain for coders. An
  auditor gets a row in each class where it has a complete round, and a coder gets a row once one of
  its plans is admitted; a model known only through excluded plans or the other class prints no zero
  row, because the excluded-plans section or the other table already names it. Planning and
  implementation auditors have separate tables. An auditor row compares only plans where another
  auditor has a complete round. Each side's per-round figure divides its kept A and B findings by
  its rounds over all those plans, and the count cell beside it shows that division. Averaging per
  plan first was rejected: a plan with one round would then weigh as much as a plan with nine, and
  the figure could no longer be checked in its row. No evaluation or recommendation is printed,
  because the sorted table and its time column already state the order. A row with fewer than five
  shared plans is printed in a second table below the main one, so the main table's top row is the
  best of the models with enough plans. Each table sorts by the gap between the two per-round
  figures, then by time. Planning also reports an opener count when it differs from its even share
  by more than a tenth of the row's shared plans and by at least two. Current auditors get
  correctable bullets above the main table; other auditors share one line below the last table.
  Auditor cost remains the mean audit and rebuttal time over every complete round. Kept, dropped,
  downgraded and disproved findings are exclusive counts; wrong claims is the last three as a
  percentage of all four across those rounds. A later finding ruling removes a kept finding from
  coder evidence. A later vet ruling moves a dropped or downgraded finding to kept for the auditor
  and coder. Under `--all`, planning and implementation each gain a measured-data table with one row
  per plan and auditor. The rows contain rounds, all four finding outcomes and mean minutes per
  round, sorted by plan and then model. A detached disproved finding creates a zero-round row when
  its auditor has no round on that plan. These tables precede the excluded plans. Coder yield
  comparisons use one closed plan per example. The archived plan supplies the listed steps, every
  hosted share must have a readable model record and the whole-plan audit must follow the final
  share. A missing archived plan and a step list the current grammar cannot read are separate
  exclusion reasons, because the read-out names what it found and never rewrites the archive.
  Records admit a plan without a ready assignment when they name one model and effort. An
  assignment, when present, must match on assistant and effort; its model may be a family alias the
  implement worker resolved at run time, so the records' release is not compared with it and a
  mismatch is its own exclusion reason. A readable step record without active time falls back to the
  span from the ready marker or previous step to that step's later share commit. A two-repo span
  counts once. A plan with a step time that neither source gives is excluded with its own reason, so
  every admitted plan supplies both its yield and its time and a row holds one sample list.
  Incomplete or mixed records move to the excluded-plans section. Time adds step and
  implementation-fix time and excludes planning fixes. Mean comes from `simple-statistics`. Direct
  observed-range comparisons own the clear-cut recommendation. Every row that reaches its minimum
  enters it. The coder table sorts by accepted findings per step, fewest first, then by time. A
  winning coder outside `implementation.coders` is named as such. Later finding rulings print per
  auditor as a numbered table that shows each reason's first sentence, because a full reason wraps
  the terminal table into an unreadable grid. Later vet rulings print newest first in one table
  after them, with an auditor column. A numbered list of the full reasons follows each table,
  numbered across the section so each ruling keeps one number. Excluded plans, grouped by reason
  with their recorded models, print only under `--all`, because a reader comparing models does not
  need the measured rows or plans that supplied no evidence every time. The command starts no
  assistant and writes no round file or round data. Like other commands that read settings, it
  creates a missing `settings.json` from the defaults.
- `round-paths.ts` owns the file-name grammar, target names, round allocation candidates, existing
  document resolution and report deletion for both entry routes. A plan target's name carries
  `-plan` or `-impl-<scope>` after the stem, matching the `plan-audit` and `impl-audit-<scope>`
  commit roles. A round's title opens with its kind and scope, such as `Plan audit of <plan>` or
  `Implementation audit of <plan>, steps 1-6`. It derives each commit group label from its original
  ordered exact set: one commit uses its six-character ID and a longer set uses
  `<oldest>..<newest>`. It joins group labels with `+` and scans the active folder for the next
  target-wide number. Later rounds keep that bounded label while their report target advances.
  Automated rounds supply every phase path. A manual audit names only its claim and report; later
  manual phases retain that report's round and name their output with the current session's writer
  tag. `manualPhasePaths` returns the ordinary phase arguments and finds review inputs only within
  the exact round at the report's root. With no input, it selects the most recently modified
  eligible document in the active folder: the other assistant's audit for vet, the current
  assistant's audit for rebuttal or either assistant's audit for fix. Several reviews of one round
  resolve the same way unless one is selected. `deleteRoundReports` deletes only audit, vet and
  rebuttal files for that exact round, using recorded filenames without consulting model settings,
  and returns their names. Round data does not participate in numbered allocation. `queueFile` names
  a manual series' `<target>-queue.md` beside its rounds. It carries no round number because it
  belongs to the whole sequence: one path stays valid across rounds, so an editor holding it open
  keeps editing the file the runner reads.
- `context.ts` resolves the installed Repo Edu checkout, its sibling plan checkout and that
  checkout's `active/` folder, which holds every active plan and round file. It reads no invoking
  directory and carries no round kind.
- `target.ts` owns the argument grammar for automated rounds and `name`. `targetRequest` reads a
  plan stem with an optional scope, or commit references, which are a complete target. A plan's
  scope is the word `plan` for its planning round, or step scopes in audit order, each a step or an
  increasing range, separated by commas or spaces as auditor entries are; `planningScope` is the one
  spelling of that word, and it stands alone because a planning round and a step series share
  nothing a list could sequence. A commit target carries parsed groups across the phase boundary:
  bare references before the first `plan@` reference form the Repo Edu group, and that reference and
  every reference after it form the plan group. Each request group keeps its repository and
  references as typed. `default-target.ts` resolves each original reference, admits only an
  increasing typed range and adds the ordered exact full commit set and the resolved short
  references the filename uses. `command.ts` builds each later exact set from those original
  commits and the earlier landed fixes. A
  commit-shaped plan stem keeps `.md` to identify it as a plan. Plan arguments drop `.md` and
  `-widen` and refuse paths with a stem example. `resolvePlan` accepts the active artifact in the
  active folder and reports an archived plan as unavailable for audit. `requiredActivePlan` accepts
  only the active artifact. It keeps path validation common while `close`, `settle`, `ready` and
  `implement` supply their own reason when no active plan exists. `default-target.ts` captures each
  request group's starting HEAD once before round files are allocated. It resolves every typed
  reference against that head, refuses a reference that names no commit and admits only an
  increasing inclusive range. Groups, references and endpoints resolve one at a time in typed
  order, so a refusal names the first bad reference and leaves no Git read running in a checkout.
  The original exact groups own the label. Each audit phase group
  carries those original commits beside its advancing exact set. Commit targets run without a
  trajectory glance or watch.
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
  starting HEAD once and resolves each group's ordered exact commit set. A commit target is a list
  of one. For a bare plan once a step has landed, `plan-steps.ts` supplies every
  listed step, hosting repo and audit range. Loose forms find each hosted step, its repo's newest
  step and its newest `implemented` marker. When every hosted share has landed and each marker is
  newer than its repo's latest hosted step, the bare plan resolves to the listed audit ranges in
  order followed by the full listed range. A sentence listing only that full range resolves it
  once. Otherwise it names pending steps by repo and every missing or stale marker. It does not skip
  a listed range because an implementation-audit record already exists for it. `defaultPlan`
  applies the same plan rule alone for the `plan` command and a `close` given no stem. The home
  `/brief-plan` runs `plan` for an omitted stem, and `/close` runs `close` itself.
  The implement command reuses this per-repo progress reader without applying
  bare-plan audit selection. `lifecycleStage` reads the stage the run starts at from the same state:
  a `-widen` filename is widening, a settled plan whose plan-repo stem commits hold no `ready`
  record is detailing, and a ready plan is implementation until every hosted share has landed with
  a current marker, then the audit range series. An implemented plan starts at the close once the
  newest round on its full step range carries a runner stop and no file-changing stem commit in
  either repo has landed since that round started, other than the round's own. That stop judged
  every step's current code, so the listed ranges have nothing left to read, and empty clean
  records change no code. Without the check, a rerun after a finished range series audits every
  range again before the close. No run file keeps a second copy of that state.
- `command.ts` owns the command grammar, startup and final reporting, including the `--auditor` and
  `--first` options. It reads both values with the queue's entry grammar and refuses a list with no
  entries. `--first` takes exactly one entry and is refused beside `--auditor`, because the list's
  first entry already names the first round. A `--first` entry that does not resolve to a listed
  auditor is refused before any round, because the series ends on the listed auditors' reads alone.
  The run is the command itself, taking the plan stem as its own argument; `round` runs one audit
  round or series on a target. A run option given before a subcommand is refused, because the run
  owns it and no subcommand reads it; options go after the subcommand. Its subcommands are `models`,
  `replay`, `disprove`, `settle`, `ready`, `implement`, `close`, `round`, `plan`, `name`, `paths`,
  `resume-fix`, `delete-reports`, `mark`, `episode`, `deferrals`, `ruling` and `answer`. Help lists
  the run, `round`, `models`, `replay`, `disprove`, `settle`, `ready`, `implement`, `close` and
  `plan`, the commands a user runs. `models` reads its retained data and `implementation.coders`
  before assistant startup or release resolution. `replay` reads the retained plan-series answers
  and every active commit-series answer. It applies the same fixed decision function without
  starting an assistant. The hand-run launchers call `name`, `paths`, `delete-reports`, `episode`
  and `deferrals`, the `/ruling` chat calls `ruling` and `answer`, and the reopen step calls `mark`,
  so help hides them. `ruling [target]` prints what the waiting run asks and the answer form.
  `answer [target] <file>` carries one JSON answer document to the waiting run, prints its reply and
  exits 1 on a refusal. Both start no assistant, read no settings and write no file. The printed
  serious-contest recovery command calls the hidden `resume-fix` route. It resolves the retained
  report set and in-progress round entry, refuses a round without an open serious contest, restores
  earlier phase records and resumes the saved fix session through the ordinary coordinator. `plan`
  prints the plan an omitted target selects, as its absolute path, and writes nothing, so a user can
  see it before a round or close takes it. `close` resolves its plan and open deferrals before
  startup, then runs the close phase alone with its own log. The `deferrals` command prints the
  active plan's open set through the shared owner. It exists only for the hand-run implementation
  audit, so help hides it beside `episode` and the other launcher interfaces. The `episode` command
  prints the requested line range from joined watch evidence produced by the shared reader and
  formatter, with its returned range and current total. Every call rebuilds the view. It performs no
  release resolution, assistant startup or file writes. The `name` command claims a round and prints
  its claim, workflow, working checkout and audit arguments. Its required `--auditor` is the
  hand-run session's full tag, including `u`, checked separately from a round's model request. The
  `paths` command prints the workflow, working checkout and argument paths for an existing report as
  a JSON object. It reads the report opening's named workflow to select its kind. Both commands
  bypass assistant startup and release resolution; `paths` writes nothing. The `delete-reports`
  command uses the same deletion function as the coordinator and starts no assistant or release
  resolution. `disprove` resolves one active or archived plan's round data, checks an attached
  finding or records the manually named auditor of a detached finding, writes through the shared
  atomic writer and commits only an archived file. `--vet` requires a non-accepting vet verdict on
  the attached finding and is refused beside `--by`. It starts no assistant and reads no settings.
  `settle` and `ready` resolve the active plan that `plan` prints when no stem is given and run only
  the lifecycle Git owner. The run resolves its named active plan and the stage `lifecycleStage`
  reads before startup, then reads settings and releases once and calls the stage functions the
  single commands use, in lifecycle order: the series, `settlePlan`, the series, `readyPlan`, the
  implementation, the range series and the close. The user's invocation is the settle, ready and
  close call given in advance, so a runner `settle` or `ready` ending and a range series that ended
  without needing the user move on to the next stage. After `settlePlan` or `readyPlan` the run
  reads the next stage through `lifecycleStage`, because a plan reopened after its ready marker
  keeps the marker and goes on to the implementation or the range series. Every other ending, a
  refused lifecycle call included, ends the run. Each stage keeps its own files, logs and printed
  lines; the run adds one line per stage start and one ending line naming the stage it ended in, the
  stages it completed and that a rerun continues from the plan's state. It takes `-v` and no round
  option, so every series it opens uses the ordinary opener, the glance and the watch. The hidden
  `mark` command claims an active plan's next round number for an empty `reopen` marker and prints
  its path, with no release resolution or assistant. So the program carries an action handler,
  Commander adds no `help` command, and each command's own `-h` prints its help. A bare command line
  prints that help; options without a target take `defaultTarget`. `implement` requires its named
  active plan's assigned ready marker before assistant startup. It uses the assigned coder for every
  selected pending step and verifies the landed share subjects after each worker before continuing.
  It also owns the round sequence and its counter. Without `--auditor`, an active plan or commit
  target runs an automatic series. The `--first` selection runs first. Without it, `openingAuditor`
  reads the target's retained data and opens on a listed auditor without a current read when another
  has one, and the configured default entry opens otherwise. Then each runner answer names the next
  series-pool entry or an ending. The pool is the auditor list of the target's work class. A `first`
  default opens on the first entry and a `random` default picks an entry for each scope's series.
  The series writes no queue and ends on settle, ready or stop, the configured maximum, a failure,
  an unanswered ruling, a red watch or a phase change. It returns that ending as a value: `settle`
  or `ready` for the runner's lifecycle answer, `ended` for a runner stop, the maximum or an emptied
  manual queue, and `stopped` for an ending that needs the user, so a reader never parses the
  printed lines. Before an automatic implementation series starts, the runner computes the open set
  and chains one scoped planning round for plan-bound deferrals. After each finished
  implementation-audit round, it computes the set again. It chains the planning round only when the
  series remains eligible to continue to its decision. A red implementation watch or a plan phase
  change caused by the implementation fix leaves the deferral open, prints it and stops the series.
  The chain uses the default entry from `planning.auditors`, including that entry's model and
  effort. It claims its own planning-round number, takes no implementation-series turn and ends the
  implementation series when it fails, awaits a ruling, changes phase or receives a red watch. Every
  automatic series ending on a plan prints the remaining open deferrals or says there are none. A
  round that changes the plan's phase finishes without a series answer. Commit targets use the same
  fixed rules and maximum. Before each later commit round, the runner adds landed fixes to the exact
  scope and advances each repository head while retaining the original label. With `--auditor`, the
  first entry runs first and the remaining entries seed its editable queue. A clean audit removes
  queued entries that resolve to that round's assistant, model and effort. Other settings remain. A
  fix that lands a clean record removes none. Failure, a round requiring a ruling, a red watch or an
  empty queue stops the manual sequence, and the queue file is deleted however the sequence ends.
  Each manual round prints the queue's path and contents when it opens. Each automatic round prints
  its runner answer and reason and repeats the reason in the line that ends the series or opens the
  next round, so the log and the terminal's last lines both carry the recommendation. A resolved
  scope list, whether typed or derived from a completed plan's audit ranges, runs one series per
  scope in list order. Each scope opens as its own series: the opener is chosen again, `--first`
  opens every scope and the round count starts over. Every ending but `stopped` ends only that scope
  and the next one is announced. A failure, an unanswered ruling, a red watch or a plan phase change
  ends the whole list and names the scopes that did not run. After target resolution, the list is
  refused beside `--auditor`, whose queue belongs to one target and whose pairing with the scopes
  would need a second reading, and beside `name`, which claims one round. Each round records its own
  file pair and the coordinator has no filesystem side effects: it opens one output per round,
  retires the previous one first, and reads updates and settings once for the whole run before
  opening any files. Startup messages go only to the terminal; the run log begins with the models
  table. Every round's title carries the number it claimed for its target, so a rerun's first round
  names the round its data records; a chained round claims the next number for its own target.
  Required write failures stop phase progression. If recording itself fails, the emergency channel
  still reports the known session and recovery command.
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
the invocation owner must release its resources before rejecting. The
invocation owner's one request for a missing result line is not a retry: it
repeats no phase work, and the coordinator sees only the invocation's result.

`phase.ts` owns workflow and launcher selection. Audit, vet, rebuttal and fix use the single
launcher set under the plan checkout's `home/`; their workflow follows the round's kind. The watch
has no launcher; the runner supplies its Repo Edu workflow directly. Implement also has no launcher
and uses Repo Edu's worker-only workflow. Close also has no launcher and its workflow lives in the
plan checkout. The automatic-series decision is runner code and has no workflow or assistant
selection. `phaseSkills` names each phase's skill folder and launchers. Planning sessions work in
the plan checkout; implementation and commit sessions work in Repo Edu. Every round file lives in
the plan checkout's `active/` folder. The runner names all input and output paths before the audit.
The runner saves audit, vet and rebuttal final responses, and the watch returns its document for the
runner to publish. Report phases finish only when their supplied output exists and is non-empty.
Claude receives the peer checkout as an additional directory; recovery commands restore the working
directory.

Workflows own findings, authority, gates and phase outcomes. The shared
Runner result rule in
`../../.agents/references/round-protocol.md#runner-result` defines their
meaning. Phase results carry only status and reason. The runner reads reports,
vet twins and the fix's landed subjects for routing and completion checks. It also reads
each commit group's starting HEAD before naming, resolves the typed references
against it for the filename, validates any typed inclusive range and reads the
log the glance counts. For later commit rounds, the runner builds each exact
set from the original commits and earlier landed fixes. Keep assistant
adapters independent of the product LLM adapters.

## Round files

`round-paths.ts` owns every round filename and order number. Files live in the
plan checkout's `active/` folder, beside the active plans, and use
`<target>-<round>-<order>-<kind>.<tag>.<ext>`. Markdown documents use `.md`;
the transcript's log uses `.log`. Five forms omit the tag:
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
| 7 | ruling | Ruling |
| 8 | glance | Reserved, no report |
| 9 | watch | Watch |

Skipped phases leave gaps. A plan audit target ends in `-plan-audit`; an
implementation audit target ends in `-impl-audit-<a>..<b>`, with step and round
numbers padded to at least two digits. A single step repeats its endpoint. Both
targets use the commit role of their records, as step logs use `impl-<n>`, so a
sorted file list keeps a plan's step logs, implementation audits and plan
audits in three separate groups. A commit
target opens with the fixed word `commit-`, so every commit audit sits together
in a sorted file list as plan targets do under their stem. Each group's original
ordered exact set owns its label: one commit uses its six-character ID and a
longer set uses `<oldest>..<newest>`. The resolved set, never the typed spelling,
names the file, so a range and its forward or reversed full list keep one label
and round sequence. Group labels join with `+` in repository order. Later
rounds keep the original label while the report target names the advancing
exact set.

Later phases preserve the report's target and round. Their tag names their own
writer under Repo Edu's **Commit Capability Tag**, not the report's auditor.
The transcript and its log use the auditor tag. A hand-run session resolves its
own model and effort before asking the runner for a path. The runner resolves
every file-writing phase's tag before opening output.

`round-data.ts` owns `<stem>-plan-rounds.json`, `<stem>-impl-rounds.json` and
`<commit-label>-rounds.json`. They are checked, gitignored objects with a `rounds` list keyed by
target and round number. Plan files also carry a `disproved` list of later user rulings. Each round
records the resolved scope, settings, phases, landed commits, findings, status and series answer. A
finding records a changed vet tier only when its `Revise to [<tier>]` line differs from the report
tier. New automatic rounds also record the ordered resolved pool used for that answer. A commit
entry additionally records its original groups, advancing groups and judged repos. Each disproved
entry records its date and full reason, then either its target, round and finding numbers with the
side the ruling disproves, or the manually named auditor model and effort. An attached entry without
a side predates the field and disproves the finding. Each phase carries the model and effort the
tool reported and the launched selection the settings named. The writer publishes a complete
replacement through a temporary file. Loop-close moves existing files beside the archived plan. A
commit file stays beside its round files in `active/` until those files are removed by hand. The
replay reads it. Plan readers and the model read-out ignore it. These are machine artifacts and are
never edited by hand.

The implement command retains one log and one possible ruling in the active
folder as `<stem>-impl-<step>-implement.log` and
`<stem>-impl-<step>-implement-ruling.<tag>.md`. These are phase files, not audit
round files. The log name carries no tag. Settings may change the coder's tag
between a failed run and its recovery, and the log opening already records the
model. A fresh worker owns each step log and starts it empty. A recovery
reopens it for appending through `RunPaths.reopenLog`, the only append route in
`run-files.ts`, and writes a new invocation opening before the resumed phase.
The one log then shows the failed turn, the recovery and the later ending in
order.

## Phase routing

`requests.ts` resolves every workflow header and supplies its listed files
whole. `round-paths.ts` supplies each phase's absolute arguments in this order:

- audit: report output, then either a plan with an optional implementation
  scope and open-deferral object, a plan with an open-deferral object for a
  chained planning round, or one structured object per commit group carrying
  its repository, references, starting HEAD, advancing exact commit set,
  original commit set and resolved short references
- vet: report input, vet output
- rebuttal: report input, vet input, rebuttal output
- fix: report input, then existing vet and rebuttal inputs, followed by the
  same open-deferral object for a chained planning or plan-scoped
  implementation round and a contest object when the rebuttal contested a
  verdict whose report or revised vet tier is A or B; the first call carries
  finding numbers and resumed calls also carry recorded winners and reasons.
  The fix child's `COMMIT_OPEN_CONTESTS` environment value carries the numbers
  that still lack winners. An empty value lifts the commit block.
- implement: plan, one-based step number, remaining hosting repo shares,
  resolved model release and launched effort; the ruling path is supplied
  separately and reused when the same worker resumes
- watch: no path arguments; the prompt separately supplies the evidence
- close: plan, capability tag, model record, open-deferral object and optional
  abort reason

The runner saves audit, vet and rebuttal final text without the parsed phase
result line. It then reads the report under the round grammar and fails the
round when the report's `Target:` line does not repeat the target it supplied
to the audit, before any later phase starts, so a vet never has to ask which
target a report judged. The watch returns Markdown
and its grade; `round.ts` publishes the admitted document and cadence entry. A
fix or implementation worker receives its ruling path separately and reuses it
when the same session resumes. An implementation resume after a ruling carries
the user's reply. One after a failed worker carries the generic continuation
and no reply. Neither carries a time value.

Hand-run phases use the same resolver. `name [target] [scope-or-commits...]
--auditor <full tag>` claims a new round and prints `cwd`, `workflow`, `claim`
and ordered `arguments`. `paths <vet|rebut|fix> [report]` prints `cwd`,
`workflow` and ordered `arguments` for an existing round. Vet and rebuttal also
take `--writer <full tag>`. With no input, `paths` selects the most recently
modified eligible report in the active folder: the other assistant's for vet, the
current assistant's for rebuttal and either assistant's for fix. It keeps the
newest matching review twin unless `--vet` or `--rebut` selects one. Neither
command loads settings or starts an assistant, and `paths` writes nothing.

Work in the printed checkout and follow the printed workflow. Planning phases
run in the plan checkout; implementation and commit phases run in Repo Edu.
Never claim a new number to continue an existing round.

`resume-fix <report> <session-id>` is the runner-owned continuation for an open
serious contest. It reloads the retained audit, vet and rebuttal files and the
matching round entry. For an existing ruling, the runner prints its notice and
waits for the `/ruling` answer before the fix resumes. If
the stopped fix wrote none, the runner resumes it first. Stored winners are
passed back to every resumed fix and unresolved numbers remain in
`COMMIT_OPEN_CONTESTS`.

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
It continues the plan's `-plan-audit` round series and data file, so the round lands
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
rulings, watches and other rounds remain.

A clean plan-target audit lands its record through `clean.ts` and retains the
report. A clean commit target lands no record. Loop-close separately archives
the plan and removes its sidecars under the plan repo workflow.

## Commands

### Model settings

Edit `tools/audit-round/settings.json` to change model selection for runs from
either checkout. Changes apply to the next invocation. This local file is
gitignored. It is JSON with comments: `//` and `/* */` comments and trailing
commas are allowed, so an alternative selection can stay commented out beside
the live one, and editors already open a file named `settings.json` that way.
When it is missing, the runner creates it from
[default-settings.json](default-settings.json), the version-controlled
defaults, as plain JSON. An invalid file stops the command with a validation
error and is left unchanged.

- `defaultAuditor` selects which entry in the target work class's auditor list opens a series when
  neither `--auditor` nor `--first` is given and the retained data gives rule 3 no opener. `first`
  opens on the first entry. `random` picks one entry for each scope's series, so no listed auditor
  always takes the first look at a target; the round data still records that choice as
  settings-chosen.
- `maximumAutomaticRounds` limits an active plan or commit target's automatic series, counting
  its first round.
- `strengthModels` maps each assistant's base and top tiers to a model name.
  The same names classify reported models for capability tags. A family alias
  such as `opus` follows the CLI's current release; a full model name pins it.
  The settings header shows the release either one resolves to.
- `defaults` names each assistant's default model and effort outright. A phase
  or list field that says `default` reads it, and `--auditor claude` or
  `--auditor codex` runs the audit on it. Neither CLI's own model configuration
  is ever read, so this file alone decides what every phase runs on.
- A list field's or `planning.fixer`'s `default` resolves when the file
  loads. The series pool, the `models` read-out, a fix and a ready marker
  therefore all name the resolved selection. A ready marker keeps the coder it
  recorded when `defaults` changes later.
- `planning.auditors` and `implementation.auditors` are non-empty ordered lists. Each entry names
  its assistant, a model and an effort, such as Claude Fable at high and Claude Opus at xhigh;
  either field may say `default`. An automatic series opens from the target work class's list and
  picks every later entry from that list. Planning targets and plan-only commit targets use
  `planning.auditors`. Implementation targets and commit targets with any Repo Edu group use
  `implementation.auditors`. Two models of one vendor are two entries, and each needs its own
  current read before the series ends. A `--first` selection must resolve to an entry in that
  target's list. A one-entry list runs every settings-chosen round in its class on that entry.
- `planning.fixer` names the assistant, model and effort that fix a planning round or a plan-only
  commit audit. Either field may say `default`.
- `implementation.coders` is a non-empty ordered list of implementation coders. Each coder
  names its assistant, model and effort, and either field may say `default`.
  `ready` gives each new plan the coder that follows the one recorded in the
  most recent ready marker. After the last coder it starts again at the first.
  With no earlier coder to follow, or one no longer in the list, it takes the
  first coder. A one-entry list always selects that coder. The plan's coder writes every step
  and every implementation-audit fix of the plan.
- `phases` sets the model and effort of the vet, document phases and close. Each field names a value
  or says `default`; `null` is refused. A named model must suit the selected CLI. The old top-level
  `auditors` and `coders` fields and `phases.planningFix` are refused like any other invalid file;
  rewrite it or delete it to regenerate the defaults.
- The vet has separate Claude and Codex selections and uses the other
  assistant, so no assistant vets its own report. Rebuttal shares the audit's
  selection. The document phases and close each select their
  assistant, whoever audited.
- The audit target picks the fixer, even when an implementation audit also
  fixes stale plan text. A planning round, before or after
  `ready` and including one chained for a plan-bound deferral, fixes on
  `planning.fixer`, because it edits the plan rather than code and its fix
  enters no coder evidence. An implementation target fixes on the plan's ready
  assignment. A commit target whose groups are all in the plan repo fixes on
  `planning.fixer`; one with a Repo Edu group fixes on the first implementation coder,
  because its correction may change code and it has no ready assignment. An
  implementation target without an assignment also takes the first coder.
- The names `claude` and `codex`, given to `--auditor` or `--first`, run the
  audit and rebuttal on that assistant's `defaults`. Letter tags name a tier
  from `strengthModels` and an effort; a field a tag omits reads that
  assistant's `defaults`. Each `--auditor` entry selects its own settings
  independently, and other phases keep their configured selections. A chained deferral round uses
  the entry that `defaultAuditor` selects from `planning.auditors`, including its model and effort.

Tests supply an independent configuration through `configured-runner.ts` and
`fixtures/settings.json`. Neither changes to the local file nor changes to
the built-in defaults change the test inputs. Settings tests cover loading,
generation and validation separately.

### Invocation

Run from either checkout with authenticated `claude` and `codex`
commands available. Terminal Markdown rendering is bundled with the runner and needs no separate
executable. Set `NO_COLOR=1` to disable colour. Redirected output retains the original Markdown.

On macOS `main.ts` starts `caffeinate -i -w <runner pid>` before any command runs, because an
unattended run otherwise stops once the display sleeps on battery and no app holds the Mac awake.
The hold ends with the runner process however it exits. A failed start prints one warning and the
command continues. Linux takes no hold.

The terminal renderer is `@earendil-works/pi-tui`, replacing Glow. The accepted presentation keeps
tables aligned, preserves paragraph and nested-list spacing and uses cyan code references without
heavy background blocks. Preserve these qualities when changing terminal rendering.

```bash
pnpm audit-round round example 1-3
pnpm audit-round round example 2,3-5,6-7
pnpm audit-round round example 3 --auditor a -v
pnpm audit-round round example 3 --auditor atx
pnpm audit-round round task-modifier 1-4 --auditor claude
pnpm audit-round round task-modifier --auditor codex
pnpm audit-round round example plan --auditor claude
pnpm audit-round round example 3 --auditor codex,claude,claude
pnpm audit-round round example 3 --auditor "atx, obm"
pnpm audit-round round example 1-4 --first codex
pnpm audit-round round example 3 --no-watch
pnpm audit-round round HEAD-1
pnpm audit-round round HEAD-2..HEAD
pnpm audit-round round HEAD plan@HEAD
pnpm audit-round round --auditor codex
pnpm audit-round models
pnpm audit-round models --all
pnpm audit-round replay
pnpm audit-round disprove example example-plan-audit 2 1 "The claim did not hold."
pnpm audit-round disprove example example-plan-audit 2 1 --vet "The vet verdict did not hold."
pnpm audit-round disprove example example-plan-audit --by "gpt-5.6-sol xhigh" "The finding predates the data."
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
pnpm audit-round example
pnpm audit-round example -v
pnpm audit-round name example 3 --auditor oth
pnpm audit-round name --auditor oth
pnpm audit-round paths vet example-impl-audit-03..03-01-2-audit.oth.md --writer abx
pnpm audit-round paths rebut example-impl-audit-03..03-01-2-audit.oth.md --writer otm
pnpm audit-round paths fix example-impl-audit-03..03-01-2-audit.oth.md
pnpm audit-round resume-fix example-impl-audit-03..03-01-2-audit.oth.md <session-id>
pnpm audit-round delete-reports example-impl-audit-03..03-01
pnpm audit-round mark reopen
pnpm audit-round episode example --lines 1-200
pnpm audit-round episode HEAD-2 --lines 201-400
pnpm audit-round ruling
pnpm audit-round ruling example
pnpm audit-round answer example answer.json
pnpm audit-round:contract
pnpm audit-round:contract codex
```

The round names the report, vet, rebuttal, ruling and watch before the
audit starts. It writes the tagless claim, transcript and log in the active folder.
A round on an active plan updates `<stem>-plan-rounds.json` or
`<stem>-impl-rounds.json` there. A commit round updates
`<commit-label>-rounds.json`. Closed-plan data remains archive evidence.
Phase files use
`<target>-<round>-<order>-<kind>.<tag>.<ext>` under
[Round files](#round-files). Each phase receives its complete inputs under
[Phase routing](#phase-routing); the watch has no path argument because the
runner owns both writes.

`models` reads every retained round-data file and both Git histories. It prints planning auditors,
implementation auditors, coders and disproved findings. Under `--all` it also prints planning and
implementation rounds by plan before the excluded plans. Each auditor section prints its main table
and, when a model has fewer than five shared plans, a second table for those models below it. It
prints no evaluation and no recommendation. Each auditor table divides each side's kept findings by
its rounds over the shared plans, shows both counts, and sorts by the gap between the two per-round
figures, then by time. A plan with one auditor enters neither side. Planning rows whose opening
rounds differ from an even share by both report bounds print either as a correctable bullet above
the main table or, when `planning.auditors` cannot run them, in one line below the last
table. Auditor time and wrong claims still cover every complete round in the class. Coder
comparisons keep their direct observed-range rule, three-plan floors and recommendation. The coder
table shows plans, steps, kept A/B findings, kept per step and time per step. A missing step time
uses the span from the ready marker or previous step, with a two-repo step ending at its later share
commit. A plan whose step time cannot be read is an excluded plan. The disproved section shows
finding rulings in a numbered table per auditor. One table of vet rulings follows them, newest first
and with its own auditor column. Every table shows each reason's first sentence, then the full
reasons as a numbered list below it, numbered across the section. The excluded-plans section groups
plans by reason and names their recorded models; it prints only under `--all`. The command renders
Markdown, starts no assistant and writes no round file or round data. Like other commands that read
settings, it creates a missing `settings.json` from the defaults.

`replay` reads every active and archived plan's retained round data and every active commit-series
file. It applies the same automatic-series decision function to each stored answer and prints the
computed answer, stored answer, next round's findings and whether the row is in the fixed corpus.
Its ordinary totals cover every stored answer and count commit series as their own phase. Its fixed
Baseline totals exclude commit series and use plan entries started before `2026-11-08T18:53:13Z`
with the historical pool fixed by the deterministic-judge plan. The command starts no assistant and
writes nothing.

`name` prints one JSON object with `cwd`, `workflow`, `claim` and `arguments`.
The arguments hold the report path followed by the resolved plan and scope, or
the commit groups with their captured starting heads.
It creates only the claim. It does not load settings or start an assistant. Its argument grammar
is the same as the automated round, from either checkout. A plan argument or no target resolves
under [Plan targets](#plan-targets).

`paths <vet|rebut|fix> [input]` resolves a later manual phase and prints its working checkout,
workflow and arguments as one JSON object. Vet and rebuttal take `--writer <full tag>` from
the current session. Fix writes no phase report and needs no writer tag. Without an input, the
command selects the most recently modified eligible file in the active folder. Several reviews of
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
already carries a ready marker. It advances through `implementation.coders`, after the newest
earlier assigned ready marker, and records the assigned coder in the body of
`<stem>/ready: declare the plan ready for implementation` with an empty commit
that preserves unrelated staged work. It reads settings but starts no assistant
process or release lookup.

`implement <stem> [scope] [-v] [--resume <step>:<session-id>]` requires an
active plan with an assigned `ready` marker. It parses the plan's
implementation steps and scans each hosting repo's log independently. It starts
one fresh worker per selected step that still has a missing share, in step
order, on the assigned coder's resolved release and effort. A ruling reply
resumes that worker without adding a time argument. A failed worker,
unanswered ruling or missing landed share stops before the next step. Once all
shares hosted by a repo have landed, the runner writes that repo's
`implemented` marker. The command retains one phase log per started step.

A failed worker or missing landed share with a known session prints the entry
that owned the worker, with `--resume <step>:<session-id>` naming the step and
its session. That entry is `pnpm audit-round implement <stem> [scope]` or the
bare `pnpm audit-round <stem>`, with `-v` when it was typed. A failure without
a session prints no runner command, and the ordinary rerun remains. An
unanswered ruling prints the worker's assistant recovery command instead: the
user answers in that session and reruns the runner. The printed command reads
Git first and resumes the session with the generic continuation, on the same
coder and release a fresh worker would get. It uses the session only while
that step is selected and has a pending share. Otherwise it says the session
stays unused. Fresh workers then take the remaining pending steps and the entry
continues as typed. No recovery file exists, and the runner never retries a
failed worker on its own.

`<stem> [-v] [--resume <step>:<session-id>]`, the bare command, takes an active plan from the stage
its state calls for through its close: a `-widen` plan opens the widening series, a settled plan
without a ready marker the detailing series, a ready plan with a pending share or a missing or stale
marker the implementation and an implemented plan the audit range series, which the close follows.
An implemented plan whose full step range has settled starts at the close: the newest round on that
range carries a runner stop, and no file-changing stem commit has landed since it started, other
than the round's own. Invoking
it is the user's settle, ready and close call, so the run settles on the runner's widening
`settle` answer, marks the plan ready on the runner's detailing `ready` answer and closes after a
range series that needed nobody, through the same lifecycle functions and commit forms as `settle`,
`ready` and `close`. Any other ending ends the run with the stage's own lines and recovery command,
then one line naming the stage it ended in and the stages it completed. Running the same command
again continues from where the plan stands; no run file or cursor exists. The run takes `-v`, the
implementation recovery option `--resume` and no round option: every series it opens starts with the
ordinary opener and runs the glance and the watch. A resumed session attaches only
when the run starts in the implementation; a run starting in another stage says the session stays
unused. A user who wants another opener, no watch or a read between stages runs the stage
commands.

`disprove <stem> <target> <round> <finding> <reason>` resolves a finding in the plan's checked round
data and writes the user's date and full reason. Adding `--vet` before the reason records that a
non-accepting vet verdict was wrong and the finding stood instead. It is refused for an accepted
finding and beside `--by`. A rerun on the same target, round and finding replaces that entry,
including a ruling in the other direction.
`disprove <stem> <target> --by "<model> <effort>" <reason>` records a finding that retained round
data does not hold and creates the round-kind file when it does not exist; each such ruling appends,
because two unrecorded findings by one auditor may both be real. An active plan's ignored file in
the active folder remains uncommitted for loop-close. An archived plan's file is committed alone as
the tag-free `<stem>/disprove:` form with the reason as its body. An attached vet ruling names
`vet finding` in that subject. The command starts no assistant and reads no settings.

`close [stem]` closes a plan's loop under the plan repo's
[loop-close workflow](../../../plan/.agents/skills/close/references/workflow.md). It is the one
entry to loop-close; the home `/close` and `$close` launchers run it. It takes an active
plan's stem, or the plan `plan` prints when none is named, and refuses an archived plan as already
closed. Without `--aborted` it also refuses a plan whose stem scan holds no `ready` marker, before
any assistant starts, because the unmarked archive form records shipped work. `--aborted <reason>`
archives an episode that never shipped and passes the reason for its README. One session, on the
`close` settings, moves the plan, rewrites the links to it, writes each repo's `closed` commit and
deletes the topic's sidecars. It works in the plan checkout and writes only `<stem>-close.<tag>.log`
beside the active folder's other runner files. Once the session has moved the plan, the runner moves
the plan's round-data files into the same archive folder and commits them as its own `<stem>/closed`
record, so the files never depend on the session remembering them. A close named for a plan already
under `archive/` whose round data still sits in `active/` does only that move and starts no
session: a resumed close session moved the plan without the runner there, so the rerun finishes the
close. It stamps the commit from the close selection alone. Without such leftover data an archived
plan is refused as already closed. The runner resolves the plan's
open deferrals before the session starts and supplies them in its phase arguments. Where close would
need the user's answer, including permission to archive with an open deferral, it fails with the
question, and its printed resume command continues that session.

`deferrals [stem]` prints one active plan's open deferrals through the shared owner. It resolves the
same default plan as close when the stem is omitted. It starts no assistant, performs no release
resolution and writes nothing. The command is hidden because only the hand-run implementation
audit workflow needs the list before its session starts.

`delete-reports` deletes the audit and twins for its exact target and round in the
active folder and lists each deleted file. It fails when no report matches. Claims, markers and
runner documents remain.

`ruling [target]` and `answer [target] <file>` are the `/ruling` chat's two carriers to a run that
waits for a ruling, as `ruling-wait.ts` owns them. The chat follows
[Answering a ruling](../../.agents/skills/fix/references/answer.md). With no target they take the
one run that waits and refuse when none or several wait. A chat's sandbox refuses Unix sockets, so
the user's Claude Code settings list `pnpm audit-round ruling`, `pnpm audit-round ruling *` and
`pnpm audit-round answer *` under `sandbox.excludedCommands`. Without those entries both commands
fail inside the sandbox with an `EPERM` error.

`mark reopen [stem]` claims the next plan-round number of an active plan, or of
the plan `plan` prints when none is named, writes the empty
`<stem>-plan-audit-<round>-0-reopen.md` in the active folder and prints its path. The
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

A clean audit records its outcome directly and retains the report, without
review or fix sessions. An automatic clean round still applies the series
rules. A fix that stops for a ruling adds a ruling twin. If a serious contest
remains open, its stop or failure prints the runner's `resume-fix` command. The
recovered fix uses the same retained round and completion path. A finished plan
round with audit findings ends with a glance at the commit record, and a due
glance adds a `-watch.md` document. The watch keeps its own history in the shared cache, which is
how its cadence survives between rounds, and `--no-watch` skips both. Without `--auditor`, an active
plan or commit target runs an automatic series from the `--first` selection when supplied, which
must name a listed auditor. Without it, a listed auditor without a current read opens when another
has one. The configured default opens otherwise. The series follows each runner answer and stops at
settle, ready, stop or its maximum without writing a queue. A settle answer ends the series with the
settle command to run and leaves the widening plan unchanged for the user to settle or keep
widening; its reason stays in the round. A detailing ready answer ends the series with the ready
command to run and leaves the settled plan unchanged for the user to mark ready or keep detailing.
Under the run both lines still print and the run records the call itself. A commit series has no
lifecycle answer or watch; the runner stops it or chooses another listed auditor. A scope list runs
that series once per scope in list order, each scope on its own target, and stops the whole list
only where a series needs the user: a failure, an unanswered ruling, a red watch or a plan phase
change. `--auditor` accepts one selection or a sequence on the named plan scope or commit series,
separated by commas or spaces. Repeated entries request separate rounds. The entries after the
current round wait in `<target>-queue.md` in the active folder. Edit it to add, remove or reorder
rounds; the runner reads it between rounds and deletes it when the sequence ends. An empty or
deleted file ends the sequence after the current round. Every completed automatic round prints its
runner answer and reason, stores them in retained data and repeats the reason in the series ending
or the next round's opening line. In a manual series, a clean audit skips queued entries with the
same resolved assistant, model and effort; other settings remain. Failure or leaving a ruling
without a reply stops either sequence. A submitted reply resumes the fix, then the sequence after
the round completes. Each header records the round's start time; filenames carry no timestamp.

Before an automatic implementation series starts, the runner chains one
planning round when the shared owner finds an open deferral into the plan repo.
After each finished implementation-audit round, it computes the open set again.
It chains the planning round only when the series will continue to its decision. A
red implementation watch or a plan phase change caused by the implementation
fix leaves the deferral open, prints it and stops the series. The planning round
receives only those deferrals, runs before the implementation series decision and does not
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

# Ownership

| Files | Own | Described in |
| --- | --- | --- |
| `main.ts` | The process entry: the macOS sleep hold, the stop signals and the ruling dialog it supplies | [Invocation](../CLAUDE.md#invocation), [Ruling wait](rounds.md#ruling-wait) |
| `command.ts` | The command grammar, startup and final reporting, the round sequence on a target with its counter and the split call's stage | [Commands](commands.md), [split](commands.md#split), [Commit targets](targets-and-files.md#commit-targets), [The evidence commit](targets-and-files.md#the-evidence-commit), [The series move](targets-and-files.md#the-series-move), [Series](series.md#series), [Selections](sessions.md#selections), [Time readings](output.md#time-readings), [Full-screen view](model-read-out.md#full-screen-view) |
| `context.ts` | The installed Repo Edu checkout and its two sibling checkouts | [Invocation](../CLAUDE.md#invocation) |
| `target.ts` | The argument grammar for rounds | [Plan targets](targets-and-files.md#plan-targets), [Commit targets](targets-and-files.md#commit-targets), [Clean audits](rounds.md#clean-audits), [Watch](watch.md#watch) |
| `default-target.ts` | The round a plan argument or no target selects, the resolution of commit references and the stage a run starts at | [Plan targets](targets-and-files.md#plan-targets), [Commit targets](targets-and-files.md#commit-targets), [The run](commands.md#the-run) |
| `plan-steps.ts` | The read of a plan's step list and audit ranges | [Plan targets](targets-and-files.md#plan-targets) |
| `round.ts` | The fixed phase sequence of a round, the questions the user answers before the fix, the reply a fix's open item needs, the watch that follows a round, the call of the series decision and the close's run | [Round sequence](rounds.md#round-sequence), [Winners and rulings](rounds.md#winners-and-rulings), [Watch](watch.md#watch), [Stopped rounds](targets-and-files.md#stopped-rounds), [close](commands.md#close) |
| `clean.ts` | Direct completion when the audit report has no findings | [Clean audits](rounds.md#clean-audits) |
| `report.ts`, `vet.ts`, `ruler-report.ts` | The schemas and writers of the audit, vet, rebuttal and ruler reports | [Report results](rounds.md#report-results) |
| `phase-result-schema.ts` | Structured phase result admission and the schemas for the watch and closing notes | [One invocation](sessions.md#one-invocation), [Watch](watch.md#watch), [After the fix](rounds.md#after-the-fix) |
| `finding-tokens.ts` | The rating and location token definitions that the audit result, the record bullet reader and round data share | [Audit report](rounds.md#audit-report), [Record bullets](commit-hooks.md#record-bullets), [Round data](targets-and-files.md#round-data) |
| `phase.ts`, `settings.ts` | Who runs each phase and on what, the capability tag's vocabulary, workflow selection and the loaded settings | [Selections](sessions.md#selections), [Startup](sessions.md#startup), [Model settings](commands.md#model-settings), [Report results](rounds.md#report-results), [The ruler](rounds.md#the-ruler), [Manual queue](series.md#manual-queue), [Watch](watch.md#watch) |
| `judge.ts`, `replay.ts` | The automatic-series evidence, the three fixed rules and their replay | [Automatic series](series.md#automatic-series), [replay](commands.md#replay) |
| `queue.ts` | The shared entry splitter and the queue file's contents | [Manual queue](series.md#manual-queue) |
| `open-deferrals.ts` | One active plan's open deferrals | [Open deferrals](series.md#open-deferrals) |
| `glance.ts` | The rule that decides whether the watch is due, and the write of the cadence entry | [Watch](watch.md#watch) |
| `episode.ts`, `episode-log.ts`, `episode-facts.ts` | Episode membership and history facts for the glance and the watch evidence | [Episode evidence](watch.md#episode-evidence), [No target](targets-and-files.md#no-target) |
| `ruling-wait.ts` | A ruling's wait, the check of its answer and the ruling dialog | [Ruling wait](rounds.md#ruling-wait) |
| `round-paths.ts` | The file-name grammar, target names, round numbers and titles, the match of one plan's or one commit series' round files, the commit-series archive folder and each split's folder | [Round files](targets-and-files.md#round-files), [Phase routing](../CLAUDE.md#phase-routing), [The close move](targets-and-files.md#the-close-move), [The series move](targets-and-files.md#the-series-move), [Manual queue](series.md#manual-queue) |
| `round-data.ts` | The checked round-data schemas, readers and writers, the split rule and highest grade, and which statuses mean a stopped round | [Round data](targets-and-files.md#round-data), [Where a range list starts](targets-and-files.md#where-a-range-list-starts), [Stopped rounds](targets-and-files.md#stopped-rounds), [Winners and rulings](rounds.md#winners-and-rulings), [Ranges](model-read-out.md#ranges), [Vetter pairs](model-read-out.md#vetter-pairs) |
| `run-files.ts` | The exclusive creation of the claim and every required file write | [Numbers and claims](targets-and-files.md#numbers-and-claims), [Step logs](targets-and-files.md#step-logs), [Output](output.md) |
| `evidence.ts` | The writes that change the evidence checkout | [Report lifecycle](targets-and-files.md#report-lifecycle) |
| `lifecycle.ts` | The plan-file preflight and the Git operations for settle, ready, the `implemented` marker and the close's round-data commit, and the checks that a planning round's plan and a close's plan move are committed | [settle](commands.md#settle), [ready](commands.md#ready), [implement](commands.md#implement), [close](commands.md#close), [Plan targets](targets-and-files.md#plan-targets), [The run](commands.md#the-run) |
| `plan-links.ts` | The rewrite of the Markdown links that settle points at the plan's new name | [settle](commands.md#settle) |
| `implement.ts`, `implement-output.ts` | The implementation of plan steps and their output files | [implement](commands.md#implement), [Step logs](targets-and-files.md#step-logs) |
| `subject.ts`, `commit-msg.ts`, `commit-msg-main.ts`, `findings.ts`, `sequence.ts` | The commit subject reader, the record bullet reader and the commit hook's rule | [Commit hooks](commit-hooks.md#commit-hooks) |
| `listed-files.json` | Each repository's listed files | [Listed files](commit-hooks.md#listed-files) |
| `startup.ts`, `requests.ts` | The cache root, the update checks, release resolution, and every phase's arguments and prompt | [Phase routing](../CLAUDE.md#phase-routing), [Assistant sessions](sessions.md#assistant-sessions), [Ruler report](rounds.md#ruler-report), [The watch record](watch.md#the-watch-record) |
| `assistant.ts`, `claude.ts`, `codex.ts`, `codex-session.ts`, `gemini.ts`, `cli-process.ts` | One assistant invocation, its decoders and its child process | [Invocation](../CLAUDE.md#invocation), [Assistant sessions](sessions.md#assistant-sessions) |
| `feedback.ts` | The selection, event, output and recorder types that the assistant sessions and the output share | [Selections](sessions.md#selections), [Startup](sessions.md#startup), [One invocation](sessions.md#one-invocation), [Recorder slots](output.md#recorder-slots), [Measurements](output.md#measurements) |
| `output.ts`, `run-clock.ts`, `terminal.ts`, `model-change.ts` | Terminal presentation, run recording, the number and files of every round, time readings and the model-change notice | [Output](output.md), [Where a range list starts](targets-and-files.md#where-a-range-list-starts), [Numbers and claims](targets-and-files.md#numbers-and-claims), [Round data](targets-and-files.md#round-data), [Stopped rounds](targets-and-files.md#stopped-rounds), [close](commands.md#close), [Full-screen view](model-read-out.md#full-screen-view) |
| `output-format.ts` | The text of the settings header, the time and token readings, the capability tag and the commit stamps | [Selections](sessions.md#selections), [Output](output.md), [The hook's rule](commit-hooks.md#the-hooks-rule) |
| `models.ts`, `model-evidence.ts`, `model-comparison.ts`, `pager.ts`, `pinned-headings.ts` | The model read-out and its full-screen view | [Model read-out](model-read-out.md) |
| `contract-main.ts`, `contract.ts` | The contract command's entry and the CLI contract recorder | [Contract recorder](commands.md#contract-recorder) |
| `move-list.ts`, `split-result.ts` | Readers and writers for the move list and the split command's result line | [Move list](../../../.agents/references/round-grammar.md#move-list), [Split result](../../../.agents/references/round-grammar.md#split-result) |
| `split-result-schema.ts` | The design and pick schemas and the pick report writer | [split](commands.md#split) |
| `split-answers.ts`, `split-design.ts` | Saved answers and their writers, parallel design and the pick | [Round files](targets-and-files.md#round-files), [split](commands.md#split) |
| `split.ts`, `split-attempt.ts`, `split-output.ts` | One split call: the read of the file's move list, the split lock, the attempt in a child process, the write, the checks and the commit or the restore, and the design selection and log | [split](commands.md#split), [Phase routing](../CLAUDE.md#phase-routing) |

Workflows own findings, authority, gates and phase outcomes. The shared protocol's
[Runner result](../../../.agents/references/round-protocol.md#runner-result) rule defines the
meaning of a phase result. The runner uses admitted report results and the fix's landed subjects for
routing and completion checks, and it reads the log the glance counts. The automatic-series decision
is runner code and has no workflow or assistant selection.

Keep assistant adapters independent of the product LLM adapters.

# Sessions

This file describes how the runner picks who runs a phase and how it starts and reads one assistant
session. Read [`glossaries/audit-round.md`](../../../glossaries/audit-round.md) and the runner's
[CLAUDE.md](../CLAUDE.md) first. The [Ownership](../CLAUDE.md#ownership) table there names the
source files this file describes. It follows the runner documentation's
[Document layout](../CLAUDE.md#document-layout) rule: each fact is stated once.

## Selections

`phase.ts` owns who runs each phase of a round and on what. `settings.ts` loads and validates
`settings.json` once at command entry, independently of the working directory, and that
configuration is passed through routing, output naming and commit stamps.
[Model settings](../CLAUDE.md#model-settings) describes the file's fields and which target takes
which fixer.

Every phase names a model and an effort. A field that says `default` reads the assistant's default
selection, so neither CLI's own configuration enters.

**One owner each.**

- `roundPhases` is the one owner of the round's phases. It resolves the assistant's selection once
  for audit and rebuttal and takes the panel from the target work class's `vetters` list. The
  runner invokes from the value it returns and the run's settings header prints the same value, so
  what a round says it ran on is what it ran with.
- `targetWorkClass` is the one owner of the target classification, as the glossary's
  **Work class** entry states it.
- `auditRoles` is the one reader of a work class's audit level: `planningAudit` for planning and
  `implementationAudit` for implementation.
- `roundFixer` is the one owner of who fixes a round. `command.ts` reads a ready assignment only
  for an implementation plan target and passes it in.
- `rulerPhase` names the ruler on the work class's `ruler` selection, and `watchPhase` the watch
  writer under [Watch](watch.md#watch).
- `closePhase` names the loop-close on its own settings, because the close belongs to no auditor.

**The capability tag.** `phase.ts` owns the tag's whole vocabulary in both directions: the letters
a subject spells a phase with, and `parseAuditor`, which reads each assistant name or partial tag
in the `--auditor` list and the `--first` selection. The three alphabets share no letter, so a
partial tag says which fields it named.

**Overrides.** `--auditor` and `--first` override each field they name, using the configured tier
table for its model, and a field nothing names reads the assistant's defaults. An assistant name
selects the assistant's default selection. Listed auditors and command-line overrides bind the
audit and the rebuttal together, because the rebuttal answers for the audit report. Each named
field carries what named it, including which of the two options a tag came from, so the settings
header never guesses, and either CLI accepts one.

**Transcript.** `phase.ts` owns which phases' texts enter the round transcript: audit, vet,
rebuttal, ruler and fix. `transcribed` names those phases, the four recorded phases and the ruler.
The ruling and the watch are separate documents: the fix writes the ruling.

**Workflows.** `phase.ts` owns workflow selection, and `phaseSkills` names each phase's skill
folder. It also defines the private inputs and results for assistant invocations and the shared
workflow selector.

- The workflow of audit, vet, rebuttal, ruler and fix follows the round's kind.
- The watch uses Repo Edu's workflow, and implement uses Repo Edu's worker-only workflow.
- The close's workflow lives in the plan checkout.

## Assistant sessions

Assistant boundaries own processes, stream validation, session observations and phase output.
They return only after accounting for the process, the streams and the required record writes. A
failure retains the known session identity, including a resumed session whose new invocation
reported no identity.

### Startup

`startup.ts` owns where the `audit-round` cache lives, through `resolveCacheRoot`, and holds its
update dates. Both update checks precede release resolution.

- Codex compares its installed version with the standalone installer's release channel before
  running its updater. A current or newer installation is kept.
- An update is successful only when a fresh version read reaches the checked release or a newer
  one. Installer output is retained for failure diagnostics, since its success banner does not
  prove a version change.
- Failed checks and unverified updates leave the date unstamped, so the next run retries.

Release resolution asks Claude for the release of each model a round's phases may pin, as
`namedModels` derives them from `roundPhases`, because a family alias names whichever release is
current. Codex runs a named model under that name. Claude control requests start no LLM turn.

### Arguments and prompts

`requests.ts` owns the headless and manual recovery arguments.

- Every Codex phase and resume command carries `--approve-for-me`.
- Every phase carries its model and reasoning effort. Codex takes them before any subcommand, so a
  resumed phase keeps them, and Claude takes `--model` and `--effort`.
- Claude uses `--permission-mode auto` in release resolution and every session entry.
- A fix awaiting a ruling and a failure both carry their phase, so continuation and recovery use
  the model the round ran that phase on.

`requests.ts` also supplies each fresh phase's selected workflow and the whole files listed by the
workflow's `reads` header.

- Header paths resolve from the workflow file. `vfile-matter` parses the header and `zod` checks
  its shape.
- Listed workflows supply their own reads recursively, with each source included once.
- No phase receives a launcher: the audit, vet, rebuttal, ruler, fix and watch workflow headers
  list the `simple` definition directly. The close's prompt names a loop-close rather than a round
  phase.
- Root instructions are not listed.
- Resumed sessions receive no files again.

Both assistants receive their phase prompts on standard input. Codex command-line arguments
contain no prompt text, including on resume, so joined evidence is not limited by the operating
system's per-argument size. The same collected file list produces a separate log prompt, which
holds source paths with an omission notice in place of file contents.

### One invocation

`assistant.ts` owns one invocation's session identity, final text and turn evidence.

A session is one or more turns and ends with its process. Claude's print mode emits one result per
turn, a background task or subagent wakes the session for a further turn, and while a subagent is
pending the CLI defers the results and flushes them at exit behind an empty result of no turns.
The phase's final text is the last turn's text.

**A missing result line.** A model sometimes leaves the result line off a finished response, and
that miss would fail a round whose work was complete.

- When the process ends on a response without the line, the invocation resumes the same session
  once and asks it to end again. The request repeats no phase work, and the new response becomes
  the phase's final text.
- The request opens as every phase prompt does, so the session reads it as an unattended phase. It
  asks for the complete response again, because the runner reads only the last turn's text.
- A second response without the line fails the phase with its session.
- A line that is present but malformed fails at once.
- The contract recorder supplies no such request, so each recording stays one invocation.

**Saving.** After the process ends with at least one turn, the invocation saves audit, vet,
rebuttal and ruler reports from the final text without the result line. A failed write fails the
phase before progression. The watch's result is handled under [Watch](watch.md#watch).

**Measurements.** Context and token measurements pass directly to the output observer. Both
assistants replace the phase total with the session's newest running total. The Claude and Codex
decoders validate the fields they consume.

### Claude and Codex readings

- `claude.ts` reads `modelUsage` from each turn's result. Its input is
  `inputTokens + cacheReadInputTokens + cacheCreationInputTokens`, its cached input is
  `cacheReadInputTokens` and its output is `outputTokens`.
- `codex.ts` reads a top-level Codex `error` event as a notice, such as a reconnect, and returns it
  as a diagnostic line of the phase, because Codex keeps running after it. Only `turn.failed` ends
  a Codex turn with a failure, and it repeats the last notice when the turn has no error of its
  own.
- `codex-session.ts` reads the current session's appended records. A resumed fix starts at the
  file's pre-invocation end. An incomplete record stays with the reader until more bytes arrive; a
  final incomplete record fails the invocation.
- The Codex token reading uses `total_token_usage`: input already includes cached input, cached
  remains separate and output already includes reasoning.

### Child process

`cli-process.ts` owns the child's environment. It stops the child before unwinding a failed line
consumer, because Execa's iterator return awaits the child. It then awaits all readers and the
process. Process output is never accumulated by Execa. The child's commit stamps are described under
[Commit hooks](commit-hooks.md#commit-hooks), and its stop signals under
[Invocation](../CLAUDE.md#invocation).

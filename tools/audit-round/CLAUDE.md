# CLAUDE.md

This is the private planning and implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal, fix and brief sequence, the
  two ruling passes a fix's open item adds, the watch that follows a finished
  planning or plan-scoped implementation round and the chain rule. It
  retains the audit session and report as local values. Audit, vet, fix and
  brief start fresh. A clean audit skips the vet and the rebuttal, because a
  report with no findings gives the one nothing to grade and the other nothing
  to answer; the fix then lands the clean record from the report alone. The
  audit's result says whether it was clean, so the coordinator routes on it
  without reading the report. A vet that accepted every finding without a
  condition skips the rebuttal the same way, because the auditor has nothing
  to answer; the fix then reads the report with its vet twin alone. The vet's
  result says whether it accepted every finding, so the coordinator routes on
  it without reading the twin.
  Rebuttal resumes the audit session only when that session's last measurement
  leaves room for a rebuttal before the assistant summarises itself in place. A
  measured shortfall starts the rebuttal fresh, because a summarised session
  holds a summary where the evidence was. An assistant that reports no window
  reports no shortfall and keeps the resume. `round.ts` owns that rule, the
  compaction share it compares against and the rebuttal's reserve.
  Codex audits by default and always fixes and briefs. Claude writes
  both ruling passes. The brief follows the fix on either outcome and precedes
  the ruling, because the ruling starts from what the brief retells; its input
  is the round transcript, never the report, and its launcher always belongs to
  the Repo Edu root. `runBrief` runs that one phase on its own over an earlier
  transcript. Only a fix needing a ruling runs `rule` and `revise` and then
  opens an interactive session, using that fix's session identity. `rule`
  drafts the ruling and `revise` rewrites that draft in a fresh session, so the
  document the user rules from is read once by a session that did not write it.
  `runWatch` owns the watch that follows a round: `glance` decides from the
  commit record whether a watch is due, and only a due glance runs `watch`
  and a second `revise` pass over that draft. `revise` is the second pass over
  any draft twin, so it takes the workflow that owns the document's shape as
  its first argument. The watch runs only after a plan round that finished, because
  a round that handed over has not proved its work landed; nothing is lost,
  since the glance counts commits and not rounds. The watch reads the commit
  record and never the round, so `runWatch` passes it no transcript and no
  report.
  `chainDecision` owns whether a chained run audits the same scope again and
  with whom: the auditor repeats while the fix records an A or B tier, the other
  assistant then takes exactly one round, and the cap, a handover or a failure
  ends the chain. It reads the fix's own grade, never a report.
- `phase.ts` owns who runs each phase of a round and on what, and the capability tag's whole
  vocabulary in both directions: the letters a subject spells a phase with, and `parseAuditorTag`,
  which reads the partial tag `--auditor` takes. The three alphabets share no letter, so a partial
  tag says which fields it named. `roundPhases` is the one owner of the round's phases: the runner
  invokes from the value it returns and the run's settings header prints the same value, so what a
  round says it ran on is what it ran with. A phase names a model, an effort, both or neither; a
  named field runs on what it names whatever the CLI is configured to use, and an unnamed one
  follows that configuration. Two things name a field. The brief names its own model and effort,
  because it retells a finished round. `--auditor` names the auditor's model through the strength
  table, which holds one model per assistant per tier and is edited when a model family lands, and
  its reasoning effort. Both bind the audit and the rebuttal together and nothing else, because the
  rebuttal resumes the audit session and one thread cannot change model half way through. Each named
  field carries what named it, so the report never guesses, and either CLI accepts one. It also
  defines the private inputs and results for assistant invocations, and owns which phases' texts
  enter the round transcript: only audit, vet, rebuttal and fix. The brief, the two ruling passes
  and the watch are the transcript's twins, written in their own files, and the glance
  only decides; all five run once the transcript already holds the round. Assistant boundaries own
  processes, stream validation, session observations and phase output. They return only after
  accounting for the process, streams and required record writes. A failure retains the known
  session identity, including a resumed session whose new invocation reported no identity.
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
  rebuttal or interactive fix starts at the file's pre-invocation end. An
  incomplete record stays with the reader until more bytes arrive; a final
  incomplete record fails the invocation.
- `interactive.ts` records the resumed fix while Codex owns the terminal. Its
  reader and the interactive child settle together, including a final read
  after the child exits. A recording failure stops the child. The session
  decoder reads messages from display events and tools from response items,
  so duplicate records and tool results do not enter the round files.
- `startup.ts` owns where the `audit-round` cache lives and holds its update dates.
  `resolveCacheRoot` is that one owner, so the update stamps and the watch record the glance reads
  resolve the same way. The watch workflow owns `watch.json`: each episode
  records both repositories' graded heads beside one grade and horizon. The
  glance counts from the invoking repository's head only. Both update checks
  precede settings discovery. Codex compares its installed
  version with the standalone installer's release channel before running its updater. A current or
  newer installation is kept. An update is successful only when a fresh version read reaches the
  checked release or a newer one. Installer output is retained for failure diagnostics, since its
  success banner does not prove a version change. Failed checks and unverified updates leave the
  date unstamped so the next run retries. Claude control requests and the short-lived Codex settings
  connection start no LLM turn. `requests.ts` owns headless, interactive and recovery arguments,
  including `--approve-for-me` on every Codex phase and resume command and a named model and
  reasoning effort: Codex takes them before any subcommand, so a resumed phase keeps them, and
  Claude takes `--model` and `--effort`. A handed-over session and a failure both carry their phase,
  so the interactive and recovery commands resume on the model the round ran that phase on. Claude
  uses `--permission-mode auto` in settings discovery and every session entry, and that discovery
  names no model of its own.
- `output.ts` owns terminal presentation and incremental run recording. A run description names the
  run, lists the phases it may run and locates its files: a round records a log and transcript pair,
  and a brief on its own records a log beside the transcript it retells and keeps no transcript of
  its own. It builds file names under the shared
  [round protocol](../../.agents/references/round-protocol.md), resolves `HEAD` in commit targets
  and scans both repo roots for the next target-wide number. It validates all file-writing phase
  tags before `run-files.ts` exclusively creates the tagless claim, then opens the transcript and
  log. The claim remains after success or failure, and a conflict stops without retrying. Each entry
  carries its phase, so the settings header reports the model and effort that phase will run on and
  names what set each of them: a command-line flag, the phase's own pin, or the assistant's
  settings. A phase whose two fields came from different places names both, model first. The output
  holds only the run start, current phase timing, context observations and each started phase's
  model selection. A phase starts with its launch selection, then its CLI's model feedback replaces
  it. Commit stamps use those phase selections; requested aliases remain in the settings header
  and file tags. Every status stamp shows the phase's
  elapsed time and the round's total. Every logged tool line opens with its step's own time, the
  assistant time since the previous tool line or since the phase start for the first, and carries no
  total, so a stalled step shows where it stalled. `run-clock.ts` owns what those readings count. A
  round measures its assistants, so time the user holds is not the run's. The assistant's last sign
  of life opens a wait and the user's next action closes it: a user message during the interactive
  fix, and leaving that session at the end. Each phase and the run read the same waiting total
  through their own mark, so one rule serves every reading. Two baselines measure context growth: a
  written status stamp reports the tokens added since the previous written stamp, and a logged tool
  line reports the tokens added since the previous tool line, beside the time since it. Both chain
  into the totals beside them; a fresh phase starts its stamp baseline at zero and a resumed phase
  reports no first change. `run-files.ts` completes each required write before returning to the
  invocation; no complete transcript accumulates in memory. `terminal.ts` uses log-update for
  terminals and plain text for redirected output. The log records each tool invocation once, with
  shell wrappers removed and no event envelopes or result payloads. Invocation lines stay complete
  in the log; assistant texts stay complete in Markdown. Only terminal tool lines shorten.
  `prepareHandover` records the handover and releases the terminal before `openSession` inherits it.
  The interactive output continues writing the same log and transcript without touching the
  terminal. Its fix timer starts at the handover; the total still counts from the round's start,
  minus every wait. User messages and assistant replies have separate transcript labels. Both
  handover functions must reject on failure. Exiting the interactive child ends recording but does
  not prove workflow completion.
- `context.ts` resolves the installed Repo Edu checkout, its sibling plan root,
  the invoking working directory and the round kind once. Only those two roots
  may start a round. The context follows every phase and recovery session;
  workflow ownership never changes the working directory.
- `target.ts` owns target validation and the target type: a plan with optional
  steps or a non-empty list of commit references from Repo Edu and an artifact
  alone from the plan root. Planning starts reject step scopes and commit
  references before assistant startup. The audit workflow owns Git
  resolution and inclusive-range admission. The runner passes references
  unchanged and rejects `--chain` for commit targets, which run once without
  a trajectory glance or watch.
- `command.ts` owns the command grammar, startup and final reporting, including
  the capability tag `--auditor` takes and the error a malformed one reports. The round is the
  command itself, taking the target as its own arguments, and `brief` is its one subcommand. So the
  program carries an action handler, Commander adds no `help` command, and each command's own `-h`
  prints its help. A bare command line prints that help rather than reporting a missing plan. It
  also owns the chain loop, because each round records its own file pair and the coordinator has no
  filesystem side effects: it opens one output per round, retires the previous one first, and reads
  updates and settings once for the whole run before opening any files.
  Startup messages go only to the terminal; the run log begins with the models
  table. A chained round carries its place in its title and independently
  claims the next number for its target. Required write failures stop
  phase progression. If recording itself fails, the emergency channel still reports the known
  session and recovery command.
- `contract.ts` invokes the same assistant and output boundaries with a probe
  prompt. It requires successful and deliberately failed shell calls before
  replacing any selected fixtures. It invokes no workflow and refreshes only
  this package's recordings.

The coordinator has no process, filesystem or terminal side effects of its own.
Its dependencies supply those operations explicitly. A returned phase failure
stops the sequence. A rejected phase invocation also stops it without retrying;
the invocation owner must release its resources before rejecting.

The audit uses the invoking root's launcher. Its report directory selects the
vet, rebuttal and fix launchers. Shared brief, ruling and watch launchers stay
in Repo Edu. Every session keeps the invoking working directory, including
when the report or transcript belongs to the other root. Claude receives the
peer checkout as an additional directory; printed recovery commands restore
the working directory before resuming. Twin paths are phase feedback;
they never replace the audit report as the input to later phases.

Workflow launchers own findings, authority, gates and phase outcomes. The shared
Runner result rule in
`../../.agents/skills/audit/references/workflow.md#runner-result` defines their
meaning. The runner does not read plan or report contents. Its only Git read
for naming resolves `HEAD`; the audit workflow still resolves the audited
scope. Keep assistant adapters independent of the product LLM adapters.

## Commands

Run from the Repo Edu checkout root with authenticated `claude` and `codex`
commands available:

```bash
pnpm audit-round ../plan/example.md 1-3
pnpm audit-round ../plan/example.md 3 --auditor a -v
pnpm audit-round ../plan/example.md 3 --auditor atx
pnpm audit-round ../plan/example.md 3 --chain
pnpm audit-round HEAD-1
pnpm audit-round HEAD-2..HEAD
pnpm audit-round brief example-step-3-01-otm-round.md
pnpm audit-round:contract
pnpm audit-round:contract codex
```

The round writes a claim, log and transcript at the invoking root under the
shared round protocol. The audit receives the chosen target and number as its
first argument, before the target and scope or commit references as typed.
Every phase reuses that name start, even when the report goes to the plan repo.
The transcript and log carry the auditor's tag; assistant-written files carry
their own writer's tag.

The brief writes a plain-words twin. A fix that stops for a ruling adds a
ruling twin. A finished plan round ends with a glance at the commit record,
and a due glance adds a `-watch.md` document. The watch keeps its own history
in the shared cache, which is how its cadence survives between rounds.
`brief` accepts an earlier transcript at either root, writes beside it without
claiming a new number and
overwrites its standalone log on each run. `--chain` runs at most three
rounds on the named plan scope. Each header records the round's start time;
filenames carry no timestamp.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use child processes and the recordings under
`src/__tests__/fixtures`. Ordinary tests make no live model calls.

# CLAUDE.md

This is the private implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal, fix and brief sequence, the
  two ruling passes a fix's open item adds, the watch that follows a finished
  plan round and the chain rule. It
  retains the audit session and report as local values. Audit, vet, fix and
  brief start fresh.
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
  commit record whether a watch is due, and only a due glance runs `verdict`
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
- `phase.ts` owns who runs each phase of a round and on what. `roundSeating` is
  that one owner: the runner invokes from the value it returns and the run's
  seating report prints the same value, so what a round says it ran on is what
  it ran with. A seat names a model, an effort, both or neither; a named field
  runs on what it names whatever the CLI is configured to use, and an unnamed
  one follows that configuration. Three things name a field. The brief names
  its own model and effort, because it retells a finished round. `--strength`
  names the auditor's model through the strength table, which holds one model
  per assistant per tier and is edited when a model family lands. `--effort`
  names the auditor's reasoning effort. Both bind the audit and the rebuttal
  together and nothing else, because the rebuttal resumes the audit session and
  one thread cannot change model half way through. Each named field carries
  what named it, so the report never guesses, and either CLI accepts one. It
  also defines the private inputs and results for assistant invocations, a
  seat among them,
  and owns which phases' texts enter the round transcript: only audit, vet,
  rebuttal and fix. The brief, the two ruling passes and the watch's verdict
  are the transcript's twins, written in their own files, and the glance only
  decides; all five run once the transcript already holds the round.
  Assistant boundaries own processes, stream validation, session observations
  and phase output. They return only after accounting for the process, streams
  and required record writes. A failure retains the known session identity,
  including a resumed session whose new invocation reported no identity.
- `assistant.ts` owns one invocation's session identity, final text, completion evidence and last
  context measurement. One observer keeps that measurement as the feedback passes, so the round
  decides on it rather than the display. Claude and Codex decoders validate the fields they consume.
  `cli-process.ts` stops the child before unwinding a failed line consumer, because Execa's iterator
  return awaits the child. It then awaits all readers and the process. Process output is never
  accumulated by Execa.
- `codex-session.ts` reads the current session's appended records. A resumed
  rebuttal or interactive fix starts at the file's pre-invocation end. An
  incomplete record stays with the reader until more bytes arrive; a final
  incomplete record fails the invocation.
- `interactive.ts` records the resumed fix while Codex owns the terminal. Its
  reader and the interactive child settle together, including a final read
  after the child exits. A recording failure stops the child. The session
  decoder reads messages from display events and tools from response items,
  so duplicate records and tool results do not enter the round files.
- `startup.ts` owns where the `audit-round` cache lives and holds its update
  dates. `resolveCacheRoot` is that one owner, so
  the update stamps and the watch record the glance reads resolve the same way.
  Both update checks precede settings discovery. Codex compares its installed
  version with the standalone installer's release channel before running its
  updater. A current or newer installation is kept. An update is successful
  only when a fresh version read reaches the checked release or a newer one.
  Installer output is retained for failure diagnostics, since its success
  banner does not prove a version change. Failed checks and unverified updates
  leave the date unstamped so the next run retries. Claude control
  requests and the short-lived Codex settings connection start no LLM turn.
  `requests.ts` owns headless, interactive and recovery arguments, including
  `--approve-for-me` on every Codex phase and resume command and a named
  model and reasoning effort: Codex takes them before any subcommand, so a
  resumed phase keeps them, and Claude takes `--model` and `--effort`. A
  handed-over session and a failure both carry their seat, so the interactive
  and recovery commands resume on the model the round ran that seat on. Claude
  uses `--permission-mode auto` in settings discovery and every session entry,
  and that discovery names no model of its own.
- `output.ts` owns terminal presentation and incremental run recording. A run description names the
  run, seats its roles and locates its files: a round records a log and transcript pair, and a brief
  on its own records a log beside the transcript it retells and keeps no transcript of its own. A
  seat carries its phase's seating, so the settings header reports the model and effort that seat
  will run on and names what set each of them: a command-line flag, the phase's own pin, or the
  assistant's settings. A seat whose two fields came from different places names both, model
  first. The
  output holds only the run start, current phase timing and context observations. Every status stamp
  shows the phase's elapsed time and the round's total. `run-clock.ts` owns what those readings
  count. A round measures its assistants, so time the user holds is not the run's. The assistant's
  last sign of life opens a wait and the user's next action closes it: a user message during the
  interactive fix, and leaving that session at the end. Each phase and the run read the same waiting
  total through their own mark, so one rule serves every reading. Two baselines measure context
  growth: a written status stamp reports the tokens added since the previous written stamp, and a
  logged tool line reports the tokens added since the previous tool line. Both chain into the totals
  beside them; a fresh phase starts its stamp baseline at zero and a resumed phase reports no first
  change. `run-files.ts` completes each required write before returning to the invocation; no
  complete transcript accumulates in memory. `terminal.ts` uses log-update for terminals and plain
  text for redirected output. The log records each tool invocation once, with shell wrappers removed
  and no event envelopes or result payloads. Invocation lines stay complete in the log; assistant
  texts stay complete in Markdown. Only terminal tool lines shorten. `prepareHandover` records the
  handover and releases the terminal before `openSession` inherits it. The interactive output
  continues writing the same log and transcript without touching the terminal. Its fix timer starts
  at the handover; the total still counts from the round's start, minus every wait. User messages
  and assistant replies have separate transcript labels. Both handover functions must reject on
  failure. Exiting the interactive child ends recording but does not prove workflow completion.
- `target.ts` owns target validation and the target type: a plan with optional
  steps or a non-empty list of commit references. The audit workflow owns Git
  resolution and inclusive-range admission. The runner passes references
  unchanged and rejects `--chain` for commit targets, which run once without
  a trajectory glance or watch.
- `command.ts` owns the command grammar, repository paths, startup and final
  reporting, including the `--strength` and `--effort` choices the auditor's
  seat takes. The round is the command itself, taking the target as its
  own arguments, and `brief` is its one subcommand. So the program carries an
  action handler, Commander adds no `help` command, and each command's own
  `-h` prints its help. A bare command line prints that help rather than
  reporting a missing plan. It also owns the chain loop, because each round records
  its own file pair and the coordinator has no filesystem side effects: it opens
  one output per round, retires the previous one first, and reads updates and
  settings once for the whole run. A chained round carries its place in its file
  names and its title, so rounds starting in the same second stay distinct.
  Required write failures stop phase progression. If recording itself fails,
  the emergency channel still reports the known session and recovery command.
- `contract.ts` invokes the same assistant and output boundaries with a probe
  prompt. It requires successful and deliberately failed shell calls before
  replacing any selected fixtures. It invokes no workflow and refreshes only
  this package's recordings.

The coordinator has no process, filesystem or terminal side effects of its own.
Its dependencies supply those operations explicitly. A returned phase failure
stops the sequence. A rejected phase invocation also stops it without retrying;
the invocation owner must release its resources before rejecting.

The audit report's directory selects every later phase's launcher owner. The
working directory remains the Repo Edu root, including when rebuttal resumes a
session whose report belongs to the plan repo. Twin paths are phase feedback;
they never replace the audit report as the input to later phases.

Workflow launchers own findings, authority, gates and phase outcomes. The shared
Runner result rule in
`../../.agents/skills/audit/references/workflow.md#runner-result` defines their
meaning. The runner does not read plan or report contents and performs no Git
operations. Keep assistant adapters independent of the product LLM adapters.

## Commands

Run from the Repo Edu checkout root with authenticated `claude` and `codex`
commands available:

```bash
pnpm audit-round ../plan/example.md 1-3
pnpm audit-round ../plan/example.md 3 --auditor claude -v
pnpm audit-round ../plan/example.md 3 --strength high --effort xhigh
pnpm audit-round ../plan/example.md 3 --chain
pnpm audit-round HEAD-1
pnpm audit-round HEAD-2..HEAD
pnpm audit-round brief ROUND-example-step-3-claude-2026-09-12T22-17-38.md
pnpm audit-round:contract
pnpm audit-round:contract codex
```

The round writes a `ROUND-` log and Markdown pair at the Repo Edu root, and
its brief phase writes the pair's plain-words twin with `-brief` before the
extension. A fix that stops for a ruling adds the `-ruling` twin beside them.
A plan round that finished ends with a glance at the commit record, and a due
glance adds the `-verdict` twin carrying the trajectory watch. The watch also
keeps its own history in the shared cache, which is how its cadence survives
between rounds.
`brief` writes the plain-words twin for an earlier transcript, logging beside
it. `--chain` runs at most three rounds on the one plan scope the user named and
never changes that scope; each round adds `-round-<n>` to its pair. Each
header names the round's start time.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use child processes and the recordings under
`src/__tests__/fixtures`. Ordinary tests make no live model calls.

# CLAUDE.md

This is the private implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers. The separate Bash runner belongs to the sibling plan repo.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal, fix and brief sequence. It
  retains the audit session and report as local values. Audit, vet, fix and
  brief start fresh.
  Rebuttal resumes the audit session only when that session's last measurement
  leaves room for a rebuttal before the assistant summarises itself in place. A
  measured shortfall starts the rebuttal fresh, because a summarised session
  holds a summary where the evidence was. An assistant that reports no window
  reports no shortfall and keeps the resume. `round.ts` owns that rule, the
  compaction share it compares against and the rebuttal's reserve.
  Codex audits by default and always fixes. Claude always briefs. The brief
  follows the fix on either outcome and precedes a ruling handover, because the
  ruling is read from it; its input is the round transcript, never the report,
  and its launcher always belongs to the Repo Edu root. `runBrief` runs that
  one phase on its own over an earlier transcript. Only a fix needing a ruling
  opens an interactive session, using that fix's session identity.
- `phase.ts` defines the private inputs and results for assistant invocations
  and owns which phases' texts enter the round transcript: every phase but the
  brief, which retells the transcript in its own file.
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
- `startup.ts` shares the existing `audit-round` cache dates with the Bash
  runner. Both update attempts precede settings discovery. Claude control
  requests and the short-lived Codex settings connection start no LLM turn.
  `requests.ts` owns headless, interactive and recovery arguments, including
  `--approve-for-me` on every Codex phase and resume command. Claude uses
  `--permission-mode auto` in settings discovery and every session entry.
- `output.ts` owns terminal presentation and incremental run recording. A run description
  names the run, seats its roles and locates its files: a round records a log and transcript
  pair, and a brief on its own records a log beside the transcript it retells and keeps no
  transcript of its own. The output holds only the run start, current phase timing and
  context observations. Every status stamp shows the phase's elapsed
  time and the round's total. Two baselines measure context growth: a written status stamp reports
  the tokens added since the previous written stamp, and a logged tool line reports the tokens added
  since the previous tool line. Both chain into the totals beside them; a fresh phase starts its
  stamp baseline at zero and a resumed phase reports no first change. `run-files.ts` completes each
  required write before returning to the invocation; no complete transcript accumulates in memory.
  `terminal.ts` uses log-update for terminals and plain text for redirected output. The log records
  each tool invocation once, with shell wrappers removed and no event envelopes or result payloads.
  Invocation lines stay complete in the log; assistant texts stay complete in Markdown. Only
  terminal tool lines shorten. `prepareHandover` records the handover and releases the terminal
  before `openSession` inherits it. The interactive output continues writing
  the same log and transcript without touching the terminal. Its fix timer
  starts at the handover; the total still counts from the round's start. User
  messages and assistant replies have separate transcript labels. Both
  handover functions must reject on failure. Exiting the interactive child
  ends recording but does not prove workflow completion.
- `command.ts` owns the `round` and `brief` subcommands, repository paths,
  startup and final reporting. `round` is the default, so a bare plan argument
  still runs a round. Required write failures stop phase progression. If recording itself fails,
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
pnpm audit-round brief ROUND-TS-example-step-3-claude-2026-09-12T22-17-38.md
pnpm audit-round:contract
pnpm audit-round:contract codex
```

The round writes a `ROUND-TS-` log and Markdown pair at the Repo Edu root, and
its brief phase writes the pair's plain-words twin with `-brief` before the
extension. `brief` writes that twin for an earlier transcript, logging beside
it. Each header identifies the TypeScript implementation. The command remains
independent of the installed Bash `audit-round` command, its source and its
tests in the plan repo. Both share the CLI update dates and workflow documents.
Neither selects or invokes the other.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use TypeScript child processes and independently owned recordings
under `src/__tests__/fixtures`. Ordinary tests make no live model calls.

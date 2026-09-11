# CLAUDE.md

This is the private implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers. The separate Bash runner belongs to the sibling plan repo.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal and fix sequence. It retains the
  audit session and report as local values. Audit, vet and fix start fresh.
  Rebuttal resumes the audit session only when that session's last measurement
  leaves room for a rebuttal before the assistant summarises itself in place. A
  measured shortfall starts the rebuttal fresh, because a summarised session
  holds a summary where the evidence was. An assistant that reports no window
  reports no shortfall and keeps the resume. `round.ts` owns that rule, the
  compaction share it compares against and the rebuttal's reserve.
  Codex audits by default and always fixes.
  Only a fix needing a ruling opens an
  interactive session, using that fix's session identity.
- `phase.ts` defines the private inputs and results for assistant invocations.
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
- `codex-usage.ts` reads the current session's appended records. A resumed
  rebuttal starts at the file's pre-invocation end. An incomplete record stays with the reader
  until more bytes arrive; a final incomplete record fails the invocation.
- `startup.ts` shares the existing `audit-round` cache dates with the Bash
  runner. Both update attempts precede settings discovery. Claude control
  requests and the short-lived Codex settings connection start no LLM turn.
  `requests.ts` owns headless, interactive and recovery arguments, including
  `--approve-for-me` on every Codex phase and resume command. Claude uses
  `--permission-mode auto` in settings discovery and every session entry.
- `output.ts` owns terminal presentation and incremental run recording.
  It holds only the round start, current phase timing and context
  observations. Every status stamp shows the phase's elapsed time and the
  round's total. `run-files.ts` completes each required write before returning
  to the invocation; no complete transcript accumulates in memory. `terminal.ts` uses log-update for terminals
  and plain text for redirected output. The log records each tool invocation
  once, with shell wrappers removed and no event envelopes or result payloads.
  Invocation lines stay complete in the log; assistant texts stay complete in
  Markdown. Only terminal tool lines shorten.
  `prepareHandover` records the handover and releases the terminal before
  `openSession` inherits it. Both functions must reject on failure.
- `command.ts` owns arguments, repository paths, startup and final reporting.
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
pnpm audit-round:contract
pnpm audit-round:contract codex
```

The round writes a `ROUND-TS-` log and Markdown pair at the Repo Edu root.
Each header identifies the TypeScript implementation. The command remains
independent of the installed Bash `audit-round` command, its source and its
tests in the plan repo. Both share the CLI update dates and workflow documents.
Neither selects or invokes the other.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use TypeScript child processes and independently owned recordings
under `src/__tests__/fixtures`. Ordinary tests make no live model calls.

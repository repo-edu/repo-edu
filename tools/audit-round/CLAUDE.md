# CLAUDE.md

This is the private implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers. The separate Bash runner belongs to the sibling plan repo.

## Ownership

- `round.ts` owns the fixed audit, vet, rebuttal and fix sequence. It retains the
  audit session and report as local values. Audit, vet and fix start fresh;
  rebuttal resumes the audit session. Only a fix needing a ruling opens an
  interactive session, using that fix's session identity.
- `phase.ts` defines the private inputs and results for assistant invocations.
  Assistant boundaries own processes, stream validation, session observations
  and phase output. They return only after accounting for the process, streams
  and required record writes. A failure retains the known session identity,
  including a resumed session whose new invocation reported no identity.
- `assistant.ts` owns one invocation's session identity, final text and completion
  evidence. Claude and Codex decoders validate the fields they consume.
  `cli-process.ts` stops the child before unwinding a failed line consumer,
  because Execa's iterator return awaits the child. It then awaits all readers
  and the process. Process output is never accumulated by Execa.
- `codex-usage.ts` reads the current session's appended records. Rebuttal starts
  at the file's pre-invocation end. An incomplete record stays with the reader
  until more bytes arrive; a final incomplete record fails the invocation.
- `startup.ts` shares the existing `audit-round` cache dates with the Bash
  runner. Both update attempts precede settings discovery. Claude control
  requests and the short-lived Codex settings connection start no LLM turn.
  `requests.ts` owns headless, interactive and recovery arguments, including
  `--approve-for-me` on every Codex phase and resume command.
- The output boundary owns terminal presentation and incremental run recording.
  `prepareHandover` records the handover and releases the terminal before
  `openSession` inherits it. Both functions must reject on failure.

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

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use TypeScript child processes and independently owned recordings
under `src/__tests__/fixtures`. Ordinary tests make no live model calls.

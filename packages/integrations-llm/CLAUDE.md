# CLAUDE.md

Provider adapters for the `LlmTextClient` contract from
`@repo-edu/integrations-llm-contract`, plus the dispatcher.

## Responsibility

- `src/index.ts`: dispatcher (`createLlmTextClient`) routing by
  `LlmModelSpec.provider`.
- `src/claude/*`: Claude prompt/reply adapter
  (`createClaudeLlmTextClient`) with API-key Messages SDK and subscription CLI
  transports. The CLI receives a narrow launch capability from its Node host;
  it never creates or owns a direct child process.
- `src/codex/*`: Codex prompt/reply adapter
  (`createCodexLlmTextClient`). The host-side client owns request admission and
  streamed public events. It reports request start, the matching protocol
  result or proof loss to the injected owned tree. The child-process lifetime
  controller owns the run outcome. The one-shot Codex SDK host process owns one
  SDK turn and is the only consumer of raw SDK events. Auth, trace, usage and
  error mapping remain separate owners.

## Rules

- Adapters do not perform SDK initialization in their factory function. Lazy
  initialization at first call so an SDK-less environment can still import
  the dispatcher.
- Adapters classify SDK errors into `LlmError`. Every adapter-populated
  `LlmError` includes `context.provider` and the effective `context.authMode`.
- An aborted Codex turn throws a `DOMException` named `AbortError`. The
  application layer maps this to public cancellation.
- Subscription Claude keeps prompt, stream and terminal-result meaning here.
  It reports work start after the prompt is handed over and reports the
  terminal stream result unchanged. A broken result path becomes proof loss.
  Error-output read failures are secondary diagnostics. No Claude path ranks
  or composes run failures.
- The injected owned tree confirms its full process tree before returning the
  controller's unknown, cancelled, failed or completed outcome. A failed
  outcome keeps the target's message. The adapter maps that message to an
  `LlmError` with the provider and auth mode; it does not choose the run
  outcome.
- Codex auth builds immutable SDK options with a complete invocation-scoped
  child environment. Subscription mode omits `CODEX_API_KEY`, and every mode
  omits `ELECTRON_RUN_AS_NODE`. Never mutate `process.env` around a Codex turn.
- The public Codex client never imports or starts the SDK in its host process.
  It launches one fixed Codex SDK host process through an injected capability
  and uses framed JSON-RPC over standard streams. Connection loss after request
  start is an unknown outside outcome, not a target result. The SDK host
  process's error output is kept, not drained away, and a bounded amount of it
  goes into the reported loss, because it is the only account of why the SDK
  host process died.
- Codex prompt/reply calls start every call in a fresh `os.tmpdir()` directory
  with `sandboxMode: "read-only"`, `approvalPolicy: "never"`,
  `networkAccessEnabled: false`, `webSearchMode: "disabled"`, and a prompt-only
  preamble.
- Browser-incompatible: depends on Node-only SDKs. Keep all adapter use behind
  Node hosts.

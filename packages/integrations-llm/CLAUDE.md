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
  (`createCodexLlmTextClient`). The host-side client owns request admission,
  streamed public events and known-versus-unknown outcome truth. The one-shot
  Codex SDK host process owns one SDK turn and is the only consumer of raw SDK
  events. Auth, trace, usage and error mapping remain separate owners.

## Rules

- Adapters do not perform SDK initialization in their factory function. Lazy
  initialization at first call so an SDK-less environment can still import
  the dispatcher.
- Adapters classify SDK errors into `LlmError`. Every adapter-populated
  `LlmError` includes `context.provider` and the effective `context.authMode`.
- An aborted Codex turn throws a `DOMException` named `AbortError`. The
  application layer maps this to public cancellation.
- Subscription Claude keeps prompt, stream and terminal-result meaning here.
  The injected host launch owns the process tree and confirms it stopped before
  the adapter reports a local failure or returns early.
- A Claude turn can fail in more than one way at once, so one owner ranks those
  failures and no path may re-decide the ranking. The classified turn failure
  comes first, because it carries the guidance such as the login message. An
  owned tree that could not be confirmed gone comes next, because no turn is
  successful while that is true. An error output that could not be read comes
  last, because it is still the only account of that run. The highest-ranked
  failure present is the one the application receives, every other failure
  present is attached to it as a cause, and the reported failure always carries
  the provider and auth mode.
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

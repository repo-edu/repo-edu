# CLAUDE.md

Provider adapters for the `LlmTextClient` contract from
`@repo-edu/integrations-llm-contract`, plus the dispatcher.

## Responsibility

- `src/index.ts`: dispatcher (`createLlmTextClient`) routing by
  `LlmModelSpec.provider`.
- `src/claude/*`: Claude prompt/reply adapter
  (`createClaudeLlmTextClient`) with API-key Messages SDK and subscription CLI
  transports.
- `src/codex/*`: Codex prompt/reply adapter
  (`createCodexLlmTextClient`). Its turn owner is the only consumer of raw SDK
  events. Auth, trace, usage and error mapping remain separate owners.

## Rules

- Adapters do not perform SDK initialization in their factory function. Lazy
  initialization at first call so an SDK-less environment can still import
  the dispatcher.
- Adapters classify SDK errors into `LlmError`. Every adapter-populated
  `LlmError` includes `context.provider` and the effective `context.authMode`.
- An aborted Codex turn throws a `DOMException` named `AbortError`. The
  application layer maps this to public cancellation.
- Codex auth builds immutable SDK options with a complete invocation-scoped
  child environment. Subscription mode omits `CODEX_API_KEY`. Never mutate
  `process.env` around a Codex turn.
- Codex prompt/reply calls start every call in a fresh `os.tmpdir()` directory
  with `sandboxMode: "read-only"`, `approvalPolicy: "never"`,
  `networkAccessEnabled: false`, `webSearchMode: "disabled"`, and a prompt-only
  preamble.
- Browser-incompatible: depends on Node-only SDKs. Keep all adapter use behind
  Node hosts.

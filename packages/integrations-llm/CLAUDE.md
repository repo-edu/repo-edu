# CLAUDE.md

Provider adapters for the `LlmTextClient` contract from
`@repo-edu/integrations-llm-contract`, plus the dispatcher.

## Responsibility

- `src/index.ts`: dispatcher (`createLlmTextClient`) routing by
  `LlmModelSpec.provider`.
- `src/claude/*`: Claude prompt/reply adapter
  (`createClaudeLlmTextClient`) and the Claude-internal coding-agent function
  (`runClaudeCoder`).
- Codex adapter ships in [plan-codex-provider.md](../../plan/plan-codex-provider.md);
  for now `createCodexLlmTextClient` is a stub that throws `LlmError("other", …)`.

## Rules

- Adapters do not perform SDK initialization in their factory function. Lazy
  initialization at first call so a Codex-less environment can still import
  the dispatcher.
- Adapters classify SDK errors into `LlmError`. Every adapter-populated
  `LlmError` includes `context.provider` and the effective `context.authMode`.
- The Claude-internal coder surface (`runClaudeCoder`) is exported from the
  package's `./claude` subpath only — it is **not** part of the contract and
  has no Codex equivalent.
- Browser-incompatible: depends on Node-only SDKs. Keep all adapter use behind
  Node hosts.

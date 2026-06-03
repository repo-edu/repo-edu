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
  (`createCodexLlmTextClient`), trace/usage helpers, and guarded fixture-coder
  runner (`runCodexFixtureCoder`).
- `src/env.ts`: shared `applyEnvOverrides` helper used by Codex to toggle
  provider env vars per call without leaking edits across calls.

## Rules

- Adapters do not perform SDK initialization in their factory function. Lazy
  initialization at first call so an SDK-less environment can still import
  the dispatcher.
- Adapters classify SDK errors into `LlmError`. Every adapter-populated
  `LlmError` includes `context.provider` and the effective `context.authMode`.
- The Codex fixture-coder surface (`runCodexFixtureCoder`) is an implementation
  helper, not part of the provider-neutral contract. Claude fixture coding
  lives in the dev-only `@repo-edu/claude-coder` package.
- Codex prompt/reply calls start every call in a fresh `os.tmpdir()` directory
  with `sandboxMode: "read-only"`, `approvalPolicy: "never"`,
  `networkAccessEnabled: false`, `webSearchMode: "disabled"`, and a prompt-only
  preamble.
- Codex fixture-coder calls run in the provided repo with
  `sandboxMode: "workspace-write"`, `approvalPolicy: "never"`,
  `networkAccessEnabled: false`, `webSearchMode: "disabled"`, and guardrails
  for command/tool/file-change events.
- Browser-incompatible: depends on Node-only SDKs. Keep all adapter use behind
  Node hosts.

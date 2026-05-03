# CLAUDE.md

Provider adapters for the `LlmTextClient` contract from
`@repo-edu/integrations-llm-contract`, plus the dispatcher.

## Responsibility

- `src/index.ts`: dispatcher (`createLlmTextClient`) routing by
  `LlmModelSpec.provider`.
- `src/claude/*`: Claude prompt/reply adapter
  (`createClaudeLlmTextClient`) and the Claude-internal coding-agent function
  (`runClaudeCoder`).
- `src/codex/*`: Codex prompt/reply adapter
  (`createCodexLlmTextClient`). Prompt/reply only — Codex never edits a
  workspace and has no `mc` (coder) equivalent.
- `src/env.ts`: shared `applyEnvOverrides` helper used by both adapters to
  toggle provider env vars per call without leaking edits across calls.

## Rules

- Adapters do not perform SDK initialization in their factory function. Lazy
  initialization at first call so an SDK-less environment can still import
  the dispatcher.
- Adapters classify SDK errors into `LlmError`. Every adapter-populated
  `LlmError` includes `context.provider` and the effective `context.authMode`.
- The Claude-internal coder surface (`runClaudeCoder`) is exported from the
  package's `./claude` subpath only — it is **not** part of the contract and
  has no Codex equivalent.
- The Codex adapter starts every call in a fresh `os.tmpdir()` directory
  with `sandboxMode: "read-only"`, `approvalPolicy: "never"`,
  `webSearchMode: "disabled"`, and a prompt-only preamble — the SDK does
  not expose a tool-disable switch, so the boundary is enforced by
  configuration plus prompt instruction.
- Browser-incompatible: depends on Node-only SDKs. Keep all adapter use behind
  Node hosts.

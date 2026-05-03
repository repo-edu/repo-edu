# CLAUDE.md

Pure TypeScript types defining the `LlmTextClient` interface for prompt/reply
LLM operations.

## Purpose

Declares the provider-neutral contract used by Claude, Codex, and any future
provider:

- `LlmModelSpec` — provider + family + modelId + effort
- `LlmUsage` — token / wall / auth-mode usage record
- `LlmTextClient` with a single `generateText` method
- `LlmError` taxonomy for rate limits, quota, auth, network, other

`supportedLlmProviders` constant: `["claude", "codex"]`.

## Rules

- Browser-safe: no Node/Electron imports.
- Zero implementation — types, the `LlmError` class, and constants only.
- Prompt/reply only. No coding-agent surface — that lives Claude-internal in
  `@repo-edu/integrations-llm`.
- Implementations live in `@repo-edu/integrations-llm`.

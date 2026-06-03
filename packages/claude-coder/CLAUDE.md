# CLAUDE.md

Dev-only Claude Code fixture coder package.

## Responsibility

- Owns the proprietary `@anthropic-ai/claude-agent-sdk` dependency and its
  agentic `query()` path.
- Exposes only `runClaudeCoder`, `CLAUDE_CODER_DEFAULT_MAX_TURNS` and
  `ClaudeCoderRequest` for `@repo-edu/fixture-engine`.
- Keeps the copied agent-SDK stream parser, usage, trace, auth and env helpers
  frozen for fixture generation.

## Rules

- Private package only. Do not import this package from shipped apps,
  `@repo-edu/integrations-llm`, or browser-safe packages.
- Do not add prompt/reply text-client code here; shipped prompt/reply Claude
  integration belongs in `@repo-edu/integrations-llm`.
- Do not re-export provider SDK types. Keep the public surface on
  `@repo-edu/integrations-llm-contract` types.

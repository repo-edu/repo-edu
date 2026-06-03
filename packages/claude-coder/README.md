# @repo-edu/claude-coder

Private dev-only package for fixture generation.

This package is the intended sole home of `@anthropic-ai/claude-agent-sdk`,
which is proprietary and includes non-redistributable Claude Code runtime
assets. It is not part of the shipped desktop or CLI prompt/reply LLM closure.

The public surface is deliberately narrow:

- `runClaudeCoder`
- `CLAUDE_CODER_DEFAULT_MAX_TURNS`
- `ClaudeCoderRequest`

Prompt/reply Claude integration for released RepoEdu apps lives in
`@repo-edu/integrations-llm`.

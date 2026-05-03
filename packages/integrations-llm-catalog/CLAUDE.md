# CLAUDE.md

Browser-safe data + lookup for the curated LLM model catalog used by the
fixture engine and the renderer.

## Purpose

- `FixtureModelSpec` extends `LlmModelSpec` from
  `@repo-edu/integrations-llm-contract` with display name, version tag, and
  pricing card (USD per million tokens, including cached input).
- Curated short-code table (`1` / `21..23` / `2` / `31..35` / `3` for Claude;
  Codex `c1` / `c2` / `c3` lands with the Codex provider plan).
- `parseShortCode(code, phase)` resolver with provider gating for the coder
  phase (`mc` accepts only providers in `codingAgentProviders`).
- `modelCode(spec)` returns the canonical short code; `archivalModelCode`
  appends the per-model `versionTag` for filesystem naming.
- `parseRepoDirCode(dirName)` widened regex matching both old (`m22-o1`)
  and new (`m22-46-o1`) shapes.
- `tokenCostUsd(spec, usage)` USD computation with cached-input rate.
- Provider/auth-mode-aware USD rendering (`$1.23` for API,
  `~$1.23` for subscription, `usd: —` when pricing is absent).

## Rules

- Browser-safe: zero Node/Electron imports.
- Depends on `@repo-edu/integrations-llm-contract` for types only.
- Pricing rates live in `pricing.ts` and are pinned by a snapshot test;
  vendor changes require updating both the catalog and the snapshot.

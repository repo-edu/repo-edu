# CLAUDE.md

AI-driven generator of realistic student-repo fixtures used by the analysis
features (`@repo-edu/fixture-engine`). A TypeScript orchestrator owns the plan
and the loop; the LLM is only invoked for parts that need creative judgement
(project ideation, plan authoring, per-commit "coder" output, evaluation).

The CLI lives in `tools/fixture-cli` (`pnpm fixture`) — that thin entry calls
`runFixtureCli(argv, roots)` from this package. See
[`src/README.md`](src/README.md) for the user-facing CLI docs (subcommands,
postfix encoding, sweep mode, `_log.md`/`_trace.md` outputs).

## Responsibility

- `fixture.ts` — subcommand dispatcher (`project|plan|repo|sweep|evaluate|init`)
  and per-stage orchestration.
- `cli.ts` — argument parsing, help, `Opts` type, model-code resolution via
  `@repo-edu/integrations-llm-catalog`.
- `constants.ts` + `defaults.ts` — hardcoded bounds and merging of
  `.fixture-settings.jsonc` (including a runtime-roots indirection so
  consumers can point fixtures at any directory).
- `state.ts` — `.fixture-state.json` cursor (last project + plan pointers).
- `planner.ts` / `coder.ts` / `review.ts` / `evaluate.ts` — the LLM-driven
  phases, all routed through `llm-client.ts` (a thin wrapper over the
  contract `LlmTextClient`; Claude coder rounds use `runClaudeCoder` from
  `@repo-edu/claude-coder`, Codex coder rounds use strict JSON-patch replies
  that this package validates and applies).
- `repo-context.ts` — embeds current repo snapshot and target file contents for
  coder prompts.
- `cohort-team-source.ts` — resolves demo cohort team-source JSON used when
  seeding docs fixtures.
- `sampler.ts`, `markers.ts`, `sweep-buckets.ts` — deterministic sampling
  utilities; tests pin the distributions.
- `prompts/`, `coder-agreement.md` — prompt templates and shared coder working
  agreement. Curated docs-demo project specs live under
  `apps/docs/src/fixtures/projects/`.

## Rules

- Node-only: uses filesystem/process/git side effects, provider prompt/reply
  adapters via `@repo-edu/integrations-llm`, and the dev-only Claude Code coder
  via `@repo-edu/claude-coder` — never depend on this package from
  browser-safe code.
- Talk to prompt/reply LLMs only through the contract types in
  `@repo-edu/integrations-llm-contract` and the dispatcher in
  `@repo-edu/integrations-llm`. Claude fixture coder rounds go through
  `@repo-edu/claude-coder`. Do not import provider SDKs directly here.
- Pricing/model lookups go through `@repo-edu/integrations-llm-catalog`
  (`parseShortCode`, `modelCode`, `tokenCostUsd`).
- Keep Codex patch parsing/path validation in `llm-client.ts`; prompts may
  request JSON, but safety checks belong in code.
- Output writes go under the runtime `FIXTURES_DIR` configured by
  `setFixtureRuntimeRoots(...)` — never assume the workspace layout.
- Determinism: every random choice flows through a seeded sampler so re-runs
  with the same settings produce the same plan/repo postfixes.
- Keep the public surface minimal: `runFixtureCli`, `setFixtureRuntimeRoots`,
  `FixtureRuntimeRoots`, `FixtureError`, `packageId`. Engine internals are
  not exported.

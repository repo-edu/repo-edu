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
  contract `LlmTextClient`).
- `sampler.ts`, `markers.ts`, `sweep-buckets.ts` — deterministic sampling
  utilities; tests pin the distributions.
- `prompts/`, `coder-agreement.md`, `coder-agreement-ai.md`, `projects/`,
  `sweeps/` — prompt templates and curated project / sweep specifications.

## Rules

- Node-only: imports `@anthropic-ai/claude-agent-sdk` (and the Codex SDK via
  `@repo-edu/integrations-llm`) — never depend on this package from
  browser-safe code.
- Talk to LLMs only through the contract types in
  `@repo-edu/integrations-llm-contract` and the dispatcher in
  `@repo-edu/integrations-llm`. Do not import provider SDKs directly here.
- Pricing/model lookups go through `@repo-edu/integrations-llm-catalog`
  (`parseShortCode`, `modelCode`, `archivalModelCode`, `tokenCostUsd`).
- Output writes go under the runtime `FIXTURES_DIR` configured by
  `setFixtureRuntimeRoots(...)` — never assume the workspace layout.
- Determinism: every random choice flows through a seeded sampler so re-runs
  with the same settings produce the same plan/repo postfixes.
- Keep the public surface minimal: `runFixtureCli`, `setFixtureRuntimeRoots`,
  `FixtureRuntimeRoots`, `FixtureError`, `packageId`. Engine internals are
  not exported.

# CLAUDE.md

Read [`glossaries/child-process-lifetime.md`](../../glossaries/child-process-lifetime.md) before
working in this package.

AI-driven generator of realistic student-repo fixtures used by the analysis
features (`@repo-edu/fixture-engine`). A TypeScript orchestrator owns the plan
and the loop; the LLM is only invoked for parts that need creative judgement
(project ideation, plan authoring, per-commit "coder" output, evaluation).

The CLI lives in `tools/fixture-cli` (`pnpm fixture`) — that thin entry calls
`runFixtureCli(argv, roots)` from this package. See
[`src/README.md`](src/README.md) for the user-facing CLI docs (subcommands,
postfix encoding, sweep mode, `_log.md`/`_trace.md` outputs).

## Vocabulary

These terms belong to the fixture engine alone. The root `CLAUDE.md`
**Vocabulary** entry for fixture owns the word's two senses.

- **fixture coder round**: one turn of the coder model that writes one planned
  commit of a fixture repo, as a build, review or refactor commit. A round that
  makes no commit leaves the repository at its last commit.
- **fixture repo**: this package's short name for a generated fixture
  repository: the Git repository one repo run writes inside its plan's folder,
  with that run's logs, summary and frozen settings beside it.
- **plan postfix**: the folder name a fixture plan gets. It encodes the plan
  settings that shaped the plan, such as team size, style and commit counts.
- **repo postfix**: the folder name a fixture repo gets inside its plan folder.
  It encodes the coder and reviewer models and the comment density, leaving out
  everything the project and plan folders already carry.
- **sweep mode**: a run that generates several plans or repositories in one go,
  one for each variant a sweep file lists. It is unrelated to the sweep tool's
  file-growth triage.

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
- `sampler.ts`, `markers.ts`, `sweep-buckets.ts` — deterministic sampling
  utilities; tests pin the distributions.
- `prompts/`, `coder-agreement.md` — prompt templates and shared coder working
  agreement.

## Rules

- Node-only: uses filesystem/process/git side effects, provider prompt/reply
  adapters via `@repo-edu/integrations-llm`, and the dev-only Claude Code coder
  via `@repo-edu/claude-coder` — never depend on this package from
  browser-safe code.
- Talk to prompt/reply LLMs only through the contract types in
  `@repo-edu/integrations-llm-contract` and the host-owned dispatcher in
  `@repo-edu/host-node`. Claude fixture coder rounds go through
  `@repo-edu/claude-coder`. Do not import provider SDKs directly here.
- Codex fixture turns use the shared Codex SDK host entry through the same
  child-process lifetime controller. The fixture engine never runs the Codex
  SDK in its own process.
- The fixture engine and its CLI are developer-only tools for macOS and
  Linux. They never run on Windows, so they never supply the Windows
  child-process lifetime adapter. The `developer-tool-platforms` boundary in
  `../plan/BOUNDARIES.md` records that decision.
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

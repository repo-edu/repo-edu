# CLAUDE.md

This is the Astro/Starlight docs site and browser-safe demo harness (`@repo-edu/docs`).

## Purpose

`apps/docs` serves documentation pages and mounts the real shared app (`@repo-edu/renderer-app`) against browser-safe mocks.

It is a validation target for:

- browser-safe package boundaries
- workflow alignment with desktop/cli surfaces
- docs/demo usability without Electron or Node runtime APIs

## Structure

- `src/demo-runtime.ts`: in-browser workflow runtime wiring. Binds a browser-safe mock `GitCommandPort` (driven by recorded fixtures in `src/fixtures/`) for analysis workflows, and a stub `LlmPort` that errors so examination calls surface a clear "no LLM in browser" message.
- `src/fixtures/`: recorded git/analysis fixtures (`analysis-git-fixture-types.ts`, `analysis-git-mock.ts`, `docs-fixtures.ts`, `generated-analysis-git-fixture.ts`) used by the demo runtime instead of a live repo.
- `src/components/DemoApp.tsx`, `src/components/DemoShell.tsx`: React host components for the docs demo runtime.
- `src/pages/demo-standalone.astro`: standalone page embedding the React demo.
- `src/content/docs/*`: Starlight documentation content; `astro.config.mjs` configures the site.
- `src/__tests__/`: smoke (`docs-smoke`), workflow contract alignment (`workflow-alignment`), browser/Node leakage guardrails (`browser-guardrail`), recorded-fixture integration (`fixture-workflow-integration`), runtime selection (`runtime-selection`), and the cross-runner consistency check (`test-runner-consistency`).

## Rules

- Never import Node/Electron APIs into docs code.
- Use `@repo-edu/host-browser-mock` for host behaviors.
- Keep docs runtime behavior aligned with shared workflow contracts.

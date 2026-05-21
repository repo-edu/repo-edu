# CLAUDE.md

This is the Astro/Starlight docs site and browser-safe demo harness (`@repo-edu/docs`).

## Purpose

`apps/docs` serves documentation pages and mounts the real shared app (`@repo-edu/renderer-app`) against browser-safe mocks.

It is a validation target for:

- browser-safe package boundaries
- workflow alignment with desktop/cli surfaces
- docs/demo usability without Electron or Node runtime APIs

## Structure

- `src/demo-runtime.ts`: in-browser workflow runtime wiring. Binds browser-safe mock Git/LMS/user-file ports (driven by recorded fixtures in `src/fixtures/`) for demo workflows, and a stub `LlmPort` that errors so examination calls surface a clear "no LLM in browser" message.
- `src/fixtures/`: demo cohort JSON (`demo-cohorts/*.json`), generated per-project repo-slot fixtures (`projects/*/generated/*.fixture.ts`), `recorded-repo-slots.ts`, `analysis-git-mock.ts`, and `docs-fixtures.ts` used by the demo runtime instead of live LMS/Git repos. Regenerate with `pnpm docs:record-fixtures`.
- `src/components/DemoApp.tsx`, `src/components/DemoShell.tsx`: React host components for the docs demo runtime.
- `src/pages/demo-standalone.astro`: standalone page embedding the React demo.
- `src/content/docs/*`: Starlight documentation content; `astro.config.mjs` configures the site.
- `src/__tests__/`: smoke (`docs-smoke`), workflow contract alignment (`workflow-alignment`), browser/Node leakage guardrails (`browser-guardrail`), recorded-fixture integration (`fixture-workflow-integration`), runtime selection (`runtime-selection`), roster display (`analysis-roster-display`), and the cross-runner consistency check (`test-runner-consistency`).

## Rules

- Never import Node/Electron APIs into docs code.
- Use `@repo-edu/host-browser-mock` for host behaviors.
- Keep docs runtime behavior aligned with shared workflow contracts.

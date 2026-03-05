# CLAUDE.md

This is the Astro/Starlight docs site and browser-safe demo harness (`@repo-edu/docs`).

## Purpose

`apps/docs` serves documentation pages and mounts the real shared app (`@repo-edu/app`) against browser-safe mocks.

It is a validation target for:

- browser-safe package boundaries
- workflow alignment with desktop/cli surfaces
- docs/demo usability without Electron or Node runtime APIs

## Structure

- `src/demo-runtime.ts`: in-browser workflow runtime wiring
- `src/components/DemoApp.tsx`: React host component for docs demo runtime
- `src/pages/demo-standalone.astro`: standalone page embedding the React demo
- `src/content/docs/*`: Starlight documentation content
- `astro.config.mjs`: Starlight site configuration
- `src/__tests__/docs-smoke.test.ts`: mount/smoke tests
- `src/__tests__/workflow-alignment.test.ts`: workflow contract alignment checks
- `src/__tests__/browser-guardrail.test.ts`: Node/Electron leakage guardrails

## Rules

- Never import Node/Electron APIs into docs code.
- Use `@repo-edu/host-browser-mock` for host behaviors.
- Keep docs runtime behavior aligned with shared workflow contracts.

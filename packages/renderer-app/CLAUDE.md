# CLAUDE.md

This package contains the shared React app (`@repo-edu/renderer-app`).

## Purpose

`@repo-edu/renderer-app` is environment-agnostic UI/state logic used by:

- Electron desktop (`apps/desktop`)
- docs/browser harness (`apps/docs`)

It consumes:

- `WorkflowClient` from `@repo-edu/application-contract`
- `RendererHost` from `@repo-edu/renderer-host-contract`

## Architecture

- `src/configure-app.ts`: app wiring and dependency injection
- `src/contexts/*`: workflow and renderer-host providers
- `src/stores/*`: Zustand stores — `course-store.ts` (with `course-store-selectors.ts`), `app-settings-store.ts`, `connections-store.ts`, `analysis-store.ts`, `examination-store.ts`, `operation-store.ts`, `ui-store.ts`, `toast-store.ts`
- `src/stores/slices/*`: course store slices (`roster-actions.ts`, `lifecycle.ts`, `autosave.ts`, `history.ts`, `metadata-actions.ts`); roster-actions uses domain `id-allocator` for group/member creation
- `src/components/*`: tabs, dialogs, sheets, settings panes (incl. LMS / Git / LLM connection panes; per-provider examination model picker)
- `src/components/tabs/analysis/*`: analysis UI — sidebar, author/file/blame panels, charts (Recharts), display controls; analyses can be opened standalone (no course) or under a course context
- `src/hooks/*`: app behavior hooks (`use-load-course`, `use-dirty-state`, etc.)
- `src/utils/*`: formatting, sorting, workflow helpers; `nanoid.ts` is retained only for course/analysis ID generation

## Rules

- Do not import Electron, Node, or tRPC directly into this package.
- All workflow calls must go through injected `WorkflowClient`.
- Keep store/component behavior deterministic and testable in browser contexts.

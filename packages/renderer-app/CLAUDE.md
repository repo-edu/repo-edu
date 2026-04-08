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
- `src/stores/*`: Zustand stores (course, settings, operations, ui, toasts, connections, analysis)
- `src/stores/slices/*`: course store slices (`roster-actions.ts`, `lifecycle.ts`, `autosave.ts`, `history.ts`, `metadata-actions.ts`); roster-actions uses domain `id-allocator` for group/member creation
- `src/components/*`: tabs, dialogs, sheets, settings panes
- `src/hooks/*`: app behavior hooks (`use-load-course`, `use-dirty-state`, etc.)
- `src/components/tabs/analysis/*`: analysis UI — sidebar, author/file/blame panels, charts (Recharts), display controls
- `src/utils/*`: formatting, sorting, workflow helpers; `nanoid.ts` is retained only for course ID generation (`generateCourseId`)

## Rules

- Do not import Electron, Node, or tRPC directly into this package.
- All workflow calls must go through injected `WorkflowClient`.
- Keep store/component behavior deterministic and testable in browser contexts.

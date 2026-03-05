# CLAUDE.md

This package contains the shared React app (`@repo-edu/app`).

## Purpose

`@repo-edu/app` is environment-agnostic UI/state logic used by:

- Electron desktop (`apps/desktop`)
- docs/browser harness (`apps/docs`)

It consumes:

- `WorkflowClient` from `@repo-edu/application-contract`
- `RendererHost` from `@repo-edu/renderer-host-contract`

## Architecture

- `src/configure-app.ts`: app wiring and dependency injection
- `src/contexts/*`: workflow and renderer-host providers
- `src/stores/*`: Zustand stores (profile, settings, operations, ui, toasts, connections)
- `src/components/*`: tabs, dialogs, sheets, settings panes
- `src/hooks/*`: app behavior hooks (`use-load-profile`, `use-dirty-state`, etc.)
- `src/utils/*`: formatting, sorting, workflow helpers

## Rules

- Do not import Electron, Node, or tRPC directly into this package.
- All workflow calls must go through injected `WorkflowClient`.
- Keep store/component behavior deterministic and testable in browser contexts.

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
- `src/stores/slices/*`: course store slices (`roster-actions.ts`, `lifecycle.ts`, `history.ts`, `metadata-actions.ts`); roster-actions uses domain `id-allocator` for group/member creation
- `src/persistence/*`: renderer-owned document persisters, including the shared `createPersister` machinery, settings/course persister wrappers, and bootstrap-gated registry/context.
- `src/components/*`: tabs, dialogs, sheets, settings panes (incl. LMS / Git / LLM connection panes; per-provider examination model picker)
- `src/components/tabs/analysis/*`: analysis UI — sidebar, author/file/blame panels, charts (Recharts), display controls; folder analysis uses the active-surface settings state instead of a course document
- `src/hooks/*`: app behavior hooks (`use-load-course`, `use-active-surface-navigation`, `use-analysis-context`, etc.); active-surface navigation owns course/folder switching, save-before-leave behavior, recents updates, tab fallback, and analysis-context reset
- `src/utils/*`: formatting, sorting, workflow helpers; `nanoid.ts` is retained for course ID generation

## Rules

- Do not import Electron, Node, or tRPC directly into this package.
- All workflow calls must go through injected `WorkflowClient`.
- Keep store/component behavior deterministic and testable in browser contexts.

## Persistence

- Renderer-owned documents live canonically in Zustand stores. Save workflows write snapshots to disk and report success/failure; only load workflows hydrate full documents back into memory.
- `AppRoot` installs the workflow client and renderer host, awaits `settings.loadApp`, hydrates `useAppSettingsStore`, creates the persister registry, and only then renders `AppShell`.
- Persisters live in `src/persistence/` and are singletons for the renderer lifetime. They subscribe to store snapshots, debounce writes, run one save at a time, retry retryable workflow errors, expose `flush()` / `waitForIdle()`, and write sync status back through store actions.
- Stores expose document setters plus a sync-status slice. They do not expose `save()` methods or own persistence timers.
- `course.save` may return only the host-stamped `{ revision, updatedAt }`; the course persister applies that stamp to the loaded course when the course id still matches. No save response may replace the full renderer document.
- Components use `usePersisterRegistry()` for flushes. Non-component helpers use `getPersisterRegistry()`, which throws before bootstrap completes.

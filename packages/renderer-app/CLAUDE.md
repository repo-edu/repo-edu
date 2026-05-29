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
- `src/session/*`: `SessionController`, session reducer, controller selectors and React context; owns bootstrap, active surface/tab/course, course loading, close flush and course mutation admission
- `src/stores/*`: Zustand stores — `course-store.ts` (with `course-store-selectors.ts`), `app-settings-store.ts`, `connections-store.ts`, `analysis-store.ts`, `examination-store.ts`, `operation-store.ts`, `ui-store.ts`, `toast-store.ts`
- `src/stores/slices/*`: course store slices (`roster-actions.ts`, `lifecycle.ts`, `history.ts`, `metadata-actions.ts`); roster-actions uses domain `id-allocator` for group/member creation
- `src/persistence/*`: controller-owned document persister workers, including the shared `createPersister` machinery and settings/course worker wrappers
- `src/components/*`: tabs, dialogs, sheets, settings panes (incl. LMS / Git / LLM connection panes; per-provider examination model picker)
- `src/components/tabs/analysis/*`: analysis UI — sidebar, author/file/blame panels, charts (Recharts), display controls; folder analysis uses the controller active surface instead of a course document
- `src/hooks/*`: app behavior hooks (`use-analysis-context`, course-list refresh, folder open helpers, etc.); session switching, save-before-leave behavior, recents updates and tab fallback belong to `SessionController`
- `src/utils/*`: formatting, sorting, workflow helpers; `nanoid.ts` is retained for course ID generation

## Rules

- Do not import Electron, Node, or tRPC directly into this package.
- All workflow calls must go through injected `WorkflowClient`; settings/course persistence workflow calls stay inside `src/session/*` or `src/persistence/*`.
- Renderer components invoke semantic course mutations through `SessionController`, not by selecting course-store actions directly. `setAssignmentSelection` is the direct course-store action exception because it is view state.
- Keep store/component behavior deterministic and testable in browser contexts.

## Persistence

- Renderer-owned documents live canonically in Zustand stores. Save workflows write snapshots to disk and report success/failure; only load workflows hydrate full documents back into memory.
- `RendererSessionRoot` constructs `SessionController` with the full workflow client, wires the rest of the renderer with a narrowed client, and renders `AppShell` only after controller bootstrap is ready.
- Persister workers live in `src/persistence/` and are owned by the controller. They subscribe to controller/store snapshots, debounce writes, run one save at a time, retry retryable workflow errors, expose `flush()` / `waitForIdle()`, and report sync status through the controller snapshot.
- Stores expose document setters for the controller implementation seam. They do not expose `save()` methods, own persistence timers, or own persistence sync status.
- `course.save` may return only the host-stamped `{ revision, updatedAt }`; the controller applies that stamp to the loaded course when the active worker and course id still match. No save response may replace the full renderer document.
- Components use `useSessionController()` for session flushes, navigation, active tab changes and course mutations. Non-component helpers use `getSessionController()`, which throws before the controller is installed.

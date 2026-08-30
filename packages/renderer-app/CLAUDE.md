# CLAUDE.md

This package contains the shared React app (`@repo-edu/renderer-app`).

## Purpose

`@repo-edu/renderer-app` is the sandboxed Electron renderer's shared UI and
state logic.

It consumes:

- `WorkflowClient` from `@repo-edu/application-contract`
- `RendererHost` from `@repo-edu/renderer-host-contract`

## Architecture

- `src/configure-app.ts`: app wiring and dependency injection
- `src/contexts/*`: workflow and renderer-host providers. React components use
  the context hooks. Module getters are reserved for non-component helpers.
- `src/session/*`: the `SessionController` facade and its private lifecycle,
  settings, surface-transaction, renderer-close registration and
  course-persistence owners. The root session snapshot is canonical for
  preferences, credentials and navigation.
- `src/stores/*`: Zustand stores for course content and transient or view state:
  `course-store.ts` (with `course-store-selectors.ts`), `connections-store.ts`,
  `analysis-store.ts`, `examination-store.ts`, `operation-store.ts`,
  `ui-store.ts`, `toast-store.ts`
- `src/stores/slices/*`: course store slices (`roster-actions.ts`, `lifecycle.ts`, `history.ts`, `metadata-actions.ts`); roster-actions uses domain `id-allocator` for group/member creation
- `src/persistence/*`: shared persister machinery and document-specific worker
  wrappers. Session owners construct and control the workers.
- `src/components/*`: tabs, dialogs, sheets, settings panes (incl. LMS / Git / LLM connection panes; per-provider examination model picker)
- `src/components/tabs/analysis/*`: analysis UI — sidebar, author/file/blame panels, charts (Recharts), display controls; folder analysis uses the controller active surface instead of a course document
- `src/analysis/*`: analysis-tab runtime owned by React Query — `analysis-query-client.ts` (renderer query client), `analysis-query-coordinator.tsx` (`AnalysisCoordinatorProvider`, runs discovery, snapshot-head, `analysis.run` and per-file blame through the query lifecycle), `analysis-query-keys.ts` (keys results by input identity), `analysis-transient-store.ts` (in-flight progress and cancellation), `analysis-view-models.ts`, `analysis-workflow-inputs.ts`. `App.tsx` wraps the shell in `QueryClientProvider` and `AnalysisCoordinatorProvider`. `stores/analysis-store.ts` now holds only scope-keyed view intent (repo selection, author/file filters, display and blame options); it neither runs nor caches workflows. `hooks/use-analysis-context.ts` derives the active surface, course, search folder and analysis inputs the coordinator runs against.
- `src/hooks/*`: app behavior hooks (`use-analysis-context`, course-list refresh, folder open helpers, etc.); session switching, save-before-leave behavior, recents updates and tab fallback belong to `SessionController`
- `src/utils/*`: formatting, sorting, workflow helpers; `nanoid.ts` is retained for course ID generation

## Rules

- Do not import Electron, Node, or tRPC directly into this package.
- All workflow calls must go through injected `WorkflowClient`; settings/course persistence workflow calls stay inside `src/session/*` or `src/persistence/*`.
- Components obtain `WorkflowClient` and `RendererHost` through
  `useWorkflowClient()` and `useRendererHost()`. Do not call their module
  getters during component render or effects.
- Renderer components invoke semantic course mutations through `SessionController`, not by selecting course-store actions directly. `setAssignmentSelection` is the direct course-store action exception because it is view state.
- Keep store/component behavior deterministic and testable in browser contexts.

## UI proposals

- Use only words and concepts already visible in that part of the UI. Internal
  names (types, modes, ports, template tokens) do not belong in labels. When
  the distinguishing concept is not labelled in the UI today, label it first or
  pick a distinguisher that is; when two features differ in ways the UI does
  not express, prefer separate surfaces over a toggle in one panel.
- When comparing orderings of grouped sections, judge the orderings on
  intrinsic merit and assume related action buttons reorder to match; current
  button order is never a tiebreaker.

## Persistence

- Preferences and credentials live canonically in the root session snapshot.
  Components select them through `useSessionControllerSelector` and dispatch
  semantic writes through `SessionController`. Transient verification status
  remains in `useConnectionsStore`.
- `RendererSessionRoot` constructs `SessionController` with the full workflow client, wires the rest of the renderer with a narrowed client, and renders `AppShell` only after controller bootstrap is ready.
- `SessionSettings` owns the credentials and preferences worker slots. It
  subscribes them only to committed root snapshots and admits status by active
  slot identity. `SessionPersistence` owns the active course worker.
- Desktop close disables renderer input before entering attempt-identified
  `closing`. The injected renderer host owns required close and cancellation
  registration; browser lifecycle signals do not participate.
- `course.save` may return only the host-stamped `{ revision, updatedAt }`; the controller applies that stamp to the loaded course when the active worker and course id still match. No save response may replace the full renderer document.
- Components use `useSessionController()` for session flushes, navigation, active tab changes and course mutations. Non-component helpers use `getSessionController()`, which throws before the controller is installed.

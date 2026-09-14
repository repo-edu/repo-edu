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
- `src/contexts/*`: session operation gateway and renderer-host providers.
  The workflow-named hook exposes the gateway, never the raw client. Module
  getters are reserved for non-component helpers.
- `src/session/*`: the `SessionController` facade and its private lifecycle, settings,
  surface-transaction and course-persistence owners. The root component binds the host's one close
  request to the controller. The root session snapshot is canonical for preferences, credentials and
  navigation.
- `src/session/session-operations.ts`: the only raw workflow-client holder.
  Reserves complete direct and Query-backed bodies in the existing transaction
  queue, including callbacks and semantic follow-up.
- `src/session/session-operation-inventory.ts`: exhaustive workflow and direct
  action classes. Read-only results that supply command input remain session-changing.
- `src/stores/*`: Zustand stores for course content and transient or view state:
  `course-store.ts` (with `course-store-selectors.ts`), `connections-store.ts`,
  `analysis-store.ts`, `examination-store.ts`, `operation-store.ts`,
  `ui-store.ts`, `toast-store.ts`
- `src/stores/slices/*`: course store slices (`roster-actions.ts`, `lifecycle.ts`, `history.ts`,
  `metadata-actions.ts`); roster-actions uses domain `id-allocator` for group/member creation
- `src/persistence/*`: shared persister machinery and document-specific worker
  wrappers. Session owners construct and control the workers.
- `src/components/*`: tabs, dialogs, sheets, settings panes (incl. LMS / Git / LLM connection panes;
  per-provider examination model picker)
- `src/components/tabs/analysis/*`: analysis UI — sidebar, author/file/blame panels, charts
  (Recharts), display controls; folder analysis uses the controller active surface instead of a
  course document
- `src/analysis/analysis-query-client.ts`: Query cache for analysis results. Analysis results
  are aggregates and stay for the session. Blame results carry every source line with its
  author and commit summary, so they are kept up to a line budget and the oldest unobserved
  ones are evicted first; the constant states its reason in course terms. The user ruled on
  2026-09-12 that the log-based analysis is prefetched across the cohort, so a selected
  repository shows at once, and that blame runs on demand for the selected repository only,
  because it is the heavier pass over the same files. The user replaced the earlier 1 GB byte
  budget on 2026-09-14 because its number was never measured and its estimator serialised
  every result as it landed.
- `src/analysis/analysis-query-coordinator.tsx`: starts bodies and observes their cached
  results. `App.tsx` installs its `AnalysisCoordinatorProvider` inside `QueryClientProvider`.
- `src/analysis/analysis-source-runner.ts`: owns snapshot-head, repository analysis and blame
  fetches. One background body covers the whole source and the selected repository's line
  authorship. Every reservation entering behind it stops it, whatever start control asked for
  it, and a later start skips the repositories already cached.
- `src/analysis/analysis-query-bodies.ts`: owns the discovery fetch body.
- `src/analysis/analysis-query-keys.ts`: keys cached results by input identity.
- `src/analysis/analysis-transient-store.ts`: holds live progress.
- `src/analysis/analysis-view-models.ts`: derives the displayed analysis results.
- `src/analysis/analysis-workflow-inputs.ts`: prepares workflow inputs.
- `src/stores/analysis-store.ts`: holds view choices per source or result, including repository
  selection, author and file filters, display options and blame options. It neither runs
  workflows nor caches their results.
- `src/hooks/use-analysis-context.ts`: derives the active surface, course, search folder and
  analysis inputs for the coordinator.
- `src/hooks/*`: app behaviour hooks (`use-analysis-context`, course-list refresh, folder open
  helpers, etc.); session switching, save-before-leave behaviour, recents updates and tab fallback
  belong to `SessionController`
- `src/utils/*`: formatting, sorting, workflow helpers; `nanoid.ts` is retained for course ID
  generation

## Rules

- Do not import Electron, Node or tRPC directly into this package.
- All feature workflow calls go through `SessionOperationGateway`. Settings
  and course persistence calls stay inside session and persistence owners.
- `useWorkflowClient()` returns the operation gateway. Keep result publication
  inside its reserved body with `scope.publish` and asynchronous follow-up with
  `scope.follow`. A promise callback after retirement cannot mutate session state.
- Query fetches and mutations start inside reserved bodies. The reservation owns the
  cancellation of its host work from the moment it is queued, and the body awaits
  semantic follow-up. React Query owns the cache and publishes results to its watchers.
  Components use disabled watchers and start a body when their input becomes ready.
  No render, effect or Query observer may start or stop host work; a stop goes through
  the gateway, which reverts the query instead of failing it.
- A reservation declares whether it is work the user asked for or background work the
  owner started on the user's behalf. Restart cost decides that declaration and the work
  owns it, never the control that started it: work is background when a later start reaches
  the same state from the cache, so stopping it costs only what was in flight. The repository
  analysis pass is background at every start site, Run and Re-run included; a folder search is
  work the user asked for at every start site. Every accepted reservation stops live
  background work. Work the user asked for keeps its turn until it finishes or the user
  stops it.
- Command reservation freezes every semantic edit and persistence-worker start
  until retirement. Store actions and native edits obey the same gate; do not
  add field-specific exceptions, semantic refs or competing state owners.
- Renderer components invoke semantic course mutations through `SessionController`, not by selecting
  course-store actions directly. View actions also pass the global semantic
  freeze through the operation owner.
- Keep store/component behaviour deterministic and testable in browser contexts.

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
- `RendererSessionRoot` supplies ordinary and exclusive clients to
  `SessionController`, which gives them to `SessionOperations`. It exposes only
  the operation gateway to features and renders `AppShell` after bootstrap is ready.
- `SessionSettings` owns the credentials and preferences worker slots. It
  subscribes them only to committed root snapshots and admits status by active
  slot identity. `SessionPersistence` owns the active course worker.
- Desktop close disables input and queues one host-requested preparation body.
  Its queue turn stops worker starts, settles accepted saves, claims eligible
  dirty snapshots and applies committed stamps. Ready acknowledgement never
  restores the session. Browser lifecycle signals do not participate.
- Commands stop worker starts before intent, prepare persistence after host
  acceptance and capture immutable input after applying stamps. Authoritative
  settlement applies before acknowledgement, host release and retirement.
  Course-changing commands apply the application's complete committed course;
  features cannot merge their partial results. Confirmation-expiry unknown
  settles without a result or course transition and never retries the action.
- `course.save` may return only the host-stamped `{ revision, updatedAt }`; the controller applies
  that stamp to the loaded course when the active worker and course id still match. No save response
  may replace the full renderer document.
- Components use `useSessionController()` for session flushes, navigation, active tab changes and
  course mutations. Non-component helpers use `getSessionController()`, which throws before the
  controller is installed.

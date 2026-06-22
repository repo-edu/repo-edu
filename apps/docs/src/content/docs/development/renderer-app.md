---
title: Renderer App
description: State management, table patterns, undo/redo, and UI conventions in the shared React frontend
---

The `@repo-edu/renderer-app` package is the shared React frontend used by both the Electron desktop app and the browser-based docs demo. It is environment-agnostic — it never imports Node, Electron, or transport-specific code. Instead, it receives a `WorkflowClient` and a `RendererHost` at initialization and uses them for all I/O.

## Dependency injection

The app requires two dependencies provided by the host environment:

- **WorkflowClient** — executes workflows (course load, roster import, repo create, etc.)
- **RendererHost** — provides UI capabilities like file pickers, directory selection, and opening external URLs

These are injected at startup through `RendererSessionRoot()`. The root constructs a `SessionController` with the full workflow client, then calls `configureApp()` with a narrowed `WorkflowClient<AppWorkflowId>` for the rest of the renderer. React code receives the narrowed client through context (`useWorkflowClient()`, `useRendererHost()`), and non-React helpers can use the same narrowed module-level getters (`getWorkflowClient()`, `getRendererHost()`).

```typescript
// At mount time (desktop or docs)
<RendererSessionRoot workflowClient={workflowClient} rendererHost={rendererHost} />

// In React components
const client = useWorkflowClient()
await client.run("course.list", undefined)

// In non-React helpers
const client = getWorkflowClient()
await client.run("course.list", undefined)
```

`SessionController` performs the session bootstrap before `AppShell` renders: it loads app credentials and preferences, hydrates editable stores, restores the active surface and course, creates the controller-owned persister workers, and only then lets the application shell observe ready session state.

## State management with Zustand

Most application state lives in [Zustand](https://zustand-demo.pmnd.rs/) stores — lightweight, subscription-based stores that sit outside the React component tree. Components subscribe to specific slices of state through selectors, which means they only re-render when the data they actually use changes. The analysis tab is the exception: its server state (repository discovery, snapshot heads, statistics, and blame) lives in React Query rather than a store — see [Analysis server state](#analysis-server-state) below.

### Store inventory

| Store | Responsibility |
|-------|---------------|
| `SessionController` | Live session state: bootstrap, active surface/tab/course, course load status, close flush, sync status, and admission for course mutations. |
| `useCourseStore` | The loaded course document: roster, groups, assignments, metadata, validation state, and undo/redo history. |
| `useCredentialsStore` | Persisted LMS, Git and LLM connections plus active credential ids. |
| `useAppSettingsStore` | Persisted preferences: active surface/tab snapshots, appearance, recents, model preferences, and column visibility/sizing. |
| `useUiStore` | Ephemeral UI state: which dialogs are open, course-list cache, sidebar state. |
| `useOperationStore` | Repository operation staging and progress tracking. |
| `useToastStore` | Toast notification queue with auto-dismiss. |
| `useConnectionsStore` | Transient LMS, Git and LLM connection verification status. |
| `useAnalysisStore` | Scope-keyed analysis-tab view intent: repo selection, author and file filters, display mode, and blame options. |
| `useExaminationStore` | Examination-tab session state: per-source generation and lookup requests, streamed questions, and archive entries. |

### Analysis server state

The analysis tab does not keep its workflow results in a Zustand store. `src/analysis/` wires a React Query client (`analysis-query-client.ts`) and a coordinator (`analysis-query-coordinator.tsx`) that run repository discovery, snapshot-head resolution, `analysis.run`, and per-file blame through the query lifecycle, keyed by input identity. `useAnalysisStore` holds only the view intent that selects what to run, and `useExaminationStore` holds examination session state alongside it. Closing the app drops the in-memory query data; nothing analysis-related is cached to disk. See [Analysis Execution](/repo-edu/development/analysis-caching/) for the full runtime and snapshot rules.

### Slice composition

The course store is the largest store and is composed from feature slices that share internal state:

```typescript
export const useCourseStore = create<CourseState & CourseActions>()(
  immer((set, get) => {
    const internals = { markCourseMutated }

    const history = createHistorySlice(set, get, internals)
    internals.mutateRoster = history.mutateRoster

    return {
      ...initialState,
      ...history.actions,
      ...createRosterActionsSlice(set, get, internals),
      ...createMetadataActionsSlice(set, get, internals),
      ...createLifecycleSlice(set, get),
    }
  }),
)
```

Each slice is a factory function that receives `set`, `get`, and shared `internals` where needed. This keeps individual slices focused while allowing cross-cutting concerns like "mark checks dirty after any roster mutation" to work without circular dependencies.

### Immutable updates with Immer

All Zustand stores use the [Immer](https://immerjs.github.io/immer/) middleware. This means state updates are written as direct mutations on a draft object, but the actual store state is never mutated — Immer produces a new immutable snapshot behind the scenes.

```typescript
set((draft) => {
  draft.course.roster.students.push(newMember)
})
```

This is important because React relies on reference equality to detect changes. Without immutable updates, components would not know when to re-render.

## Undo/redo with Immer patches

Roster mutations (adding members, moving groups, editing fields) support undo and redo. This is implemented using Immer's `produceWithPatches`, which returns both the next state and the structural patches that describe the change.

When a roster mutation occurs:

1. `produceWithPatches` applies the mutation and captures both `patches` (forward) and `inversePatches` (reverse).
2. The patches are stored in a history stack alongside a human-readable description.
3. Undo applies `inversePatches` to the current roster, moving the entry to a future stack.
4. Redo applies `patches` from the future stack back to the roster.

```typescript
const [nextRoster, patches, inversePatches] = produceWithPatches(
  state.course.roster,
  mutator,
)
// patches: what changed (forward)
// inversePatches: how to reverse it
```

The history stack has a fixed size limit. Any new mutation clears the future stack, so redo is only available for the most recent linear sequence of undos. Non-roster changes (course metadata, settings) are not tracked in undo history.

## TanStack Table integration

Roster and group tables use [TanStack React Table](https://tanstack.com/table/latest) for column definitions, sorting, filtering, row selection, and column resizing. The pattern across tables is consistent:

### Row data preparation

Tables pre-compute a flat row data array from store state using `useMemo`. This decouples the table from the store's nested structure and ensures the table only recomputes when its inputs change.

### Column definitions

Columns are defined with `createColumnHelper<RowType>()` and include:

- `accessorFn` to extract cell values from row objects
- Custom `sortingFn` using domain-aware comparators (locale-sensitive text, numeric counts)
- Custom cell renderers for editable cells, status badges, action menus
- `size` and `minSize` for resizable columns

### Progressive multi-column sorting

Tables support two-level sorting: clicking a column header makes it the primary sort (ascending), clicking again toggles to descending, and the previous primary sort becomes the secondary sort. This is implemented through a custom `getNextProgressiveSorting` utility rather than TanStack's built-in sort toggle.

### Column persistence

Column visibility and sizing are persisted to `useAppSettingsStore` so they survive across sessions. The preferences persister observes these changes and debounces writes.

### Editable cells

Table cells that support inline editing follow a local-draft pattern: clicking a cell switches it to an input field with the current value. Changes are committed on blur or Enter, and cancelled on Escape. The committed value flows through `mutateRoster`, which records it in undo history.

## Persistence

Renderer-owned persistence is centralized in `src/persistence/` and owned by `SessionController`. Persister workers subscribe to controller/store snapshots, debounce writes, run save workflows, retry retryable errors, expose `flush()` for navigation guards, and report sync status back to the controller snapshot.

Save workflows are write-only. `settings.saveCredentials` and `settings.savePreferences` return no result; `course.save` returns only the host-stamped `{ revision, updatedAt }`, which the controller applies to the current course if the active worker and course id still match. Full persisted documents enter renderer memory only through controller-owned load workflows.

## Toast notifications

The toast store provides a simple queue-based notification system. Toasts carry a `tone` (`info`, `success`, `warning`, `error`) and an optional action button. They auto-dismiss after a duration that varies by tone and whether an action is present (longer for actionable toasts). The `ToastStack` component renders them as a fixed-position stack in the bottom-right corner.

## UI component consumption

All visual primitives come from `@repo-edu/ui`, which wraps [Radix](https://www.radix-ui.com/) components with consistent styling via [class-variance-authority](https://cva.style/docs). The renderer-app never imports Radix or any other component library directly — it goes through the `@repo-edu/ui` package for buttons, dialogs, dropdowns, inputs, tabs, tooltips, and icons.

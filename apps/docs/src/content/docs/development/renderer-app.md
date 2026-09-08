---
title: Renderer App
description: State management, table patterns, undo/redo, and UI conventions in the shared React frontend
---

The `@repo-edu/renderer-app` package is the React frontend used by the Electron desktop app. It
never imports Node, Electron or transport-specific code. Its session owner
receives ordinary and exclusive clients and a required `RendererHost` at initialisation.

## Dependency injection

The host supplies:

- **WorkflowClient** — executes workflows (course load, roster import, repo create, etc.)
- **ExclusiveCommandClient** — owns accepted command preparation and settlement
- **RendererHost** — provides file and directory pickers, native theme and close preparation

`RendererSessionRoot` constructs `SessionController`, which gives the raw
clients to `SessionOperations`. `configureApp` exposes only its
`SessionOperationGateway` to features. The workflow-named context hook and
non-React getter return that gateway. They do not expose the raw client.

```typescript
// In React components
const operations = useWorkflowClient()
await operations.execute("course.list", async (scope) => {
  const courses = await scope.run("course.list", undefined)
  scope.publish(() => publishCourses(courses))
})
```

`SessionController` performs the session bootstrap before `AppShell` renders: it loads app
credentials and preferences, hydrates editable stores, restores the active surface and course,
creates the controller-owned persister workers and only then lets the application shell observe
ready session state.

## Session operation ownership

`SessionOperations` owns complete direct and Query-backed bodies in the
existing transaction queue. Host calls, progress/output callbacks, Query cache
publication and explicit semantic follow-up finish before retirement. Use
`scope.publish` for publication and `scope.follow` for asynchronous follow-up.
The example's `publishCourses` is the feature's publication callback and runs
inside that body. React effects may display results but cannot commit semantic state.

`session-operation-inventory.ts` assigns every workflow and direct action a
class. Read-only results that supply command input are session-changing too.
Presentation-only calls cannot commit application state. Architecture checks
reject raw-client holders and semantic mutation routes outside the owner.

Command reservation freezes all semantic changes and worker starts before
intent. The freeze lasts through settlement application, acknowledgement, host
release and renderer retirement. Course edits, settings, navigation, selection
and semantic changes from native Edit or Services actions obey the same gate.
Progress and results belonging to the accepted body publish through its scope.

Each course-changing command uses the application's
`composeCourseCommandTransition`. Main saves the complete next course and sends
that same value with its host stamp. The session applies it; features cannot
merge a partial command result into the course. Effect-only commands have no
course transition.

## State management with Zustand

Most application state lives in [Zustand](https://zustand-demo.pmnd.rs/) stores — lightweight,
subscription-based stores that sit outside the React component tree. Components subscribe to
specific slices of state through selectors, which means they only re-render when the data they
actually use changes. The analysis tab is the exception: its server state (repository discovery,
snapshot heads, statistics, and blame) lives in React Query rather than a store — see
[Analysis server state](#analysis-server-state) below.

### Store inventory

| Store | Responsibility |
|-------|---------------|
| `SessionController` | Canonical preferences and credentials, bootstrap, active surface/tab/course, sync status and semantic admission. |
| `useCourseStore` | The loaded course document: roster, groups, assignments, metadata, validation state, and undo/redo history. |
| `useUiStore` | Ephemeral UI state: which dialogs are open, course-list cache, sidebar state. |
| `useOperationStore` | Repository operation staging and progress tracking. |
| `useToastStore` | Toast notification queue with auto-dismiss. |
| `useConnectionsStore` | Transient LMS, Git and LLM connection verification status. |
| `useAnalysisStore` | Scope-keyed analysis-tab view intent: repo selection, author and file filters, display mode, and blame options. |
| `useExaminationStore` | Examination-tab session state: per-source generation and lookup requests, streamed questions, and archive entries. |

### Analysis server state

The analysis tab does not keep its workflow results in a Zustand store. `src/analysis/` wires a
React Query client (`analysis-query-client.ts`) and a coordinator (`analysis-query-coordinator.tsx`)
that run repository discovery, snapshot-head resolution, `analysis.run`, and per-file blame through
the query lifecycle, keyed by input identity. `useAnalysisStore` holds only the view intent that
selects what to run, and `useExaminationStore` holds examination session state alongside it. Closing
the app drops the in-memory query data; nothing analysis-related is cached to disk. See
[Analysis Execution](/repo-edu/development/analysis-caching/) for the full runtime and snapshot
rules.

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

Each slice is a factory function that receives `set`, `get`, and shared `internals` where needed.
This keeps individual slices focused while allowing cross-cutting concerns like "mark checks dirty
after any roster mutation" to work without circular dependencies.

### Immutable updates with Immer

All Zustand stores use the [Immer](https://immerjs.github.io/immer/) middleware. This means state
updates are written as direct mutations on a draft object, but the actual store state is never
mutated — Immer produces a new immutable snapshot behind the scenes.

```typescript
set((draft) => {
  draft.course.roster.students.push(newMember)
})
```

This is important because React relies on reference equality to detect changes. Without immutable
updates, components would not know when to re-render.

## Undo/redo with Immer patches

Roster mutations (adding members, moving groups, editing fields) support undo and redo. This is
implemented using Immer's `produceWithPatches`, which returns both the next state and the structural
patches that describe the change.

When a roster mutation occurs:

1. `produceWithPatches` applies the mutation and captures both `patches` (forward) and
   `inversePatches` (reverse).
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

The history stack has a fixed size limit. Any new mutation clears the future stack, so redo is only
available for the most recent linear sequence of undos. Non-roster changes (course metadata,
settings) are not tracked in undo history.

## TanStack Table integration

Roster and group tables use [TanStack React Table](https://tanstack.com/table/latest) for column
definitions, sorting, filtering, row selection, and column resizing. The pattern across tables is
consistent:

### Row data preparation

Tables pre-compute a flat row data array from store state using `useMemo`. This decouples the table
from the store's nested structure and ensures the table only recomputes when its inputs change.

### Column definitions

Columns are defined with `createColumnHelper<RowType>()` and include:

- `accessorFn` to extract cell values from row objects
- Custom `sortingFn` using domain-aware comparators (locale-sensitive text, numeric counts)
- Custom cell renderers for editable cells, status badges, action menus
- `size` and `minSize` for resizable columns

### Progressive multi-column sorting

Tables support two-level sorting: clicking a column header makes it the primary sort (ascending),
clicking again toggles to descending, and the previous primary sort becomes the secondary sort. This
is implemented through a custom `getNextProgressiveSorting` utility rather than TanStack's built-in
sort toggle.

### Column persistence

Column visibility and sizing live in the session's canonical preferences.
Semantic changes pass through the controller. Its preferences worker observes
committed snapshots and debounces writes.

### Editable cells

Table cells that support inline editing follow a local-draft pattern: clicking a cell switches it to
an input field with the current value. Changes are committed on blur or Enter, and cancelled on
Escape. The committed value flows through `mutateRoster`, which records it in undo history.

## Persistence

Renderer persistence lives in `src/persistence/` under session ownership.
Workers subscribe to committed snapshots, coalesce saves and report status.
Command reservation stops worker starts before intent. Accepted preparation
settles already-started saves through stamp application and claims eligible
dirty snapshots. Host refusal keeps a snapshot dirty. Course and settings
storage failures end the host; they do not create paused writers or retry loops.

Save workflows are write-only. `settings.saveCredentials` and `settings.savePreferences` return no
result; `course.save` returns only the host-stamped `{ revision, updatedAt }`.
The controller applies it only to the current worker and course. Loads hydrate
documents; exclusive settlement separately applies the complete committed
course produced by the transition owner.

Clean close arrives on a host-owned port after ordinary calls drain. Its queued
body stops worker starts at its turn, prepares eligible persistence and
acknowledges ready. Accepted close never restores interactive admission.
Confirmation expiry during a command settles as unknown without inventing a
result or course transition, preserves preparation stamps and retires after
host release. The action is never retried.

## Toast notifications

The toast store provides a simple queue-based notification system. Toasts carry a `tone` (`info`,
`success`, `warning`, `error`) and an optional action button. They auto-dismiss after a duration
that varies by tone and whether an action is present (longer for actionable toasts). The
`ToastStack` component renders them as a fixed-position stack in the bottom-right corner.

## UI component consumption

All visual primitives come from `@repo-edu/ui`, which wraps [Radix](https://www.radix-ui.com/)
components with consistent styling via [class-variance-authority](https://cva.style/docs). The
renderer-app never imports Radix or any other component library directly — it goes through the
`@repo-edu/ui` package for buttons, dialogs, dropdowns, inputs, tabs, tooltips, and icons.

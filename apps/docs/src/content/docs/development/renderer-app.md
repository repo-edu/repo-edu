---
title: Renderer App
description: State management, table patterns, undo/redo, and UI conventions in the shared React frontend
---

The `@repo-edu/renderer-app` package is the shared React frontend used by both the Electron desktop app and the browser-based docs demo. It is environment-agnostic — it never imports Node, Electron, or transport-specific code. Instead, it receives a `WorkflowClient` and a `RendererHost` at initialization and uses them for all I/O.

## Dependency injection

The app requires two dependencies provided by the host environment:

- **WorkflowClient** — executes workflows (course load, roster import, repo create, etc.)
- **RendererHost** — provides UI capabilities like file pickers, directory selection, and opening external URLs

These are injected at startup through `configureApp()` and exposed via React context (`useWorkflowClient()`, `useRendererHost()`). Because Zustand stores live outside the React tree, the same dependencies are also available through module-level getters (`getWorkflowClient()`, `getRendererHost()`), set once during initialization.

```typescript
// At mount time (desktop or docs)
const cleanup = configureApp({ workflowClient, rendererHost })

// In React components
const client = useWorkflowClient()
await client.run("course.load", { courseId })

// In Zustand stores (outside React)
const client = getWorkflowClient()
await client.run("settings.saveApp", settings)
```

## State management with Zustand

All application state lives in [Zustand](https://zustand-demo.pmnd.rs/) stores — lightweight, subscription-based stores that sit outside the React component tree. Components subscribe to specific slices of state through selectors, which means they only re-render when the data they actually use changes.

### Store inventory

| Store | Responsibility |
|-------|---------------|
| `useCourseStore` | The loaded course document: roster, groups, assignments, metadata. Also manages undo/redo history and autosave. |
| `useAppSettingsStore` | Persisted preferences: connections, appearance, column visibility/sizing. |
| `useUiStore` | Ephemeral UI state: which dialogs are open, navigation, sidebar state. |
| `useOperationStore` | Repository operation staging and progress tracking. |
| `useToastStore` | Toast notification queue with auto-dismiss. |
| `useConnectionsStore` | LMS and Git connection verification status. |

### Slice composition

The course store is the largest store and is composed from feature slices that share internal state:

```typescript
export const useCourseStore = create<CourseState & CourseActions>()(
  immer((set, get) => {
    const autosave = createAutosaveSlice(set, get)
    const internals = { ...autosave.internals, markCourseMutated }

    const history = createHistorySlice(set, get, internals)
    internals.mutateRoster = history.mutateRoster

    return {
      ...initialState,
      ...autosave.actions,
      ...history.actions,
      ...createRosterActionsSlice(set, get, internals),
      ...createMetadataActionsSlice(set, get, internals),
      ...createLifecycleSlice(set, get, internals),
    }
  }),
)
```

Each slice is a factory function that receives `set`, `get`, and shared `internals` (autosave trigger, history tracking). This keeps individual slices focused while allowing cross-cutting concerns like "mark the document dirty after any roster mutation" to work without circular dependencies.

### Immutable updates with Immer

All Zustand stores use the [Immer](https://immerjs.github.io/immer/) middleware. This means state updates are written as direct mutations on a draft object, but the actual store state is never mutated — Immer produces a new immutable snapshot behind the scenes.

```typescript
set((draft) => {
  draft.course.roster.students.push(newMember)
  draft.course.updatedAt = new Date().toISOString()
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

The history stack has a fixed size limit. Any new mutation clears the future stack, so redo is only available for the most recent linear sequence of undos. Non-roster changes (course metadata, settings) are not tracked in undo history — they autosave immediately.

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

Column visibility and sizing are persisted to `useAppSettingsStore` so they survive across sessions. Changes are debounced before saving to avoid excessive writes during resize drag.

### Editable cells

Table cells that support inline editing follow a local-draft pattern: clicking a cell switches it to an input field with the current value. Changes are committed on blur or Enter, and cancelled on Escape. The committed value flows through `mutateRoster`, which records it in undo history.

## Dirty checking

The `useDirtyState` hook tracks whether the current course has unsaved changes by computing an FNV-1a hash of the relevant course fields. This avoids expensive deep equality checks — the hash is a single 32-bit integer compared against a baseline captured at load time. Any roster mutation, metadata change, or connection update shifts the hash and marks the document as dirty.

## Autosave

The autosave slice monitors mutations and triggers a `course.save` workflow after a debounce delay. If the save fails (network error, revision conflict), it retries with increasing delays and surfaces the error through the store's sync status. The UI shows a save indicator that reflects whether the document is saving, saved, or in an error state.

## Toast notifications

The toast store provides a simple queue-based notification system. Toasts carry a `tone` (`info`, `success`, `warning`, `error`) and an optional action button. They auto-dismiss after a duration that varies by tone and whether an action is present (longer for actionable toasts). The `ToastStack` component renders them as a fixed-position stack in the bottom-right corner.

## UI component consumption

All visual primitives come from `@repo-edu/ui`, which wraps [Radix](https://www.radix-ui.com/) components with consistent styling via [class-variance-authority](https://cva.style/docs). The renderer-app never imports Radix or any other component library directly — it goes through the `@repo-edu/ui` package for buttons, dialogs, dropdowns, inputs, tabs, tooltips, and icons.

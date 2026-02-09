# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Purpose

`@repo-edu/app-core` contains the environment-agnostic core application logic and UI for Repo
Manage. It runs in both:

- **Tauri Desktop App** — with a `TauriBackend` that communicates with Rust
- **Web/Docs Demo** — with a `MockBackend` that simulates behavior in the browser

## Build & Test Commands

```bash
pnpm test              # Run all tests (via vitest)
pnpm test -- <pattern> # Run specific test file
```

Tests use vitest with jsdom environment. Test files live alongside source files as `*.test.ts(x)`.

## Architecture

### Backend Injection

The package is backend-agnostic via dependency injection:

```typescript
import { setBackend } from "@repo-edu/app-core"
import { MockBackend } from "@repo-edu/backend-mock"

setBackend(new MockBackend())
```

All backend calls go through `src/bindings/commands.ts` which delegates to the injected backend
via `getBackend()`.

### State Management (Zustand Stores)

Seven stores manage application state:

| Store               | Responsibility                                                 |
| ------------------- | -------------------------------------------------------------- |
| `appSettingsStore`  | Theme, LMS connection, git connections (app-level)             |
| `profileStore`      | Profile document (settings + roster) with Immer mutations and undo/redo |
| `connectionsStore`  | Draft connection state during editing + git status cleanup     |
| `operationStore`    | Git operation progress, results, validation/preflight results  |
| `uiStore`           | Active tab, dialogs, sheets, sidebar selection                 |
| `outputStore`       | Console output lines                                           |
| `toastStore`        | Toast notifications                                            |

The `profileStore` uses Immer middleware for draft-based mutations. It combines profile settings
and roster into a single atomic `ProfileDocument` to prevent synchronization issues. Undo/redo
is supported via Immer patches.

### profileStore Key Operations

Store actions cover CRUD for group sets, groups, assignments, and roster members. Selectors
provide derived views (groups for a group set, assignments for a group set, system vs connected
vs local group sets, coverage reports, undo/redo state). All group set and group CRUD is
frontend-only; backend commands handle I/O and validation only.

### Data Flow

```text
BackendAPI → commands.ts → stores → adapters → components
```

- **adapters/** — Transform between backend snake_case and store camelCase formats
- **services/** — Thin wrappers calling backend via commands
- **hooks/** — React hooks like `useDirtyState` (hash-based change tracking), `useDataOverview`
- **utils/** — Helpers for group naming, group set patches, roster metrics, operation context

### Groups & Assignments Tab

Uses a master-detail layout with sidebar navigation and right panel:

- `GroupsAssignmentsTab` — Main tab container
- `GroupsAssignmentsSidebar` — Sidebar with sections for system/connected/local group sets
- `GroupSetPanel` — Right panel for viewing/editing group sets and their groups
- `AssignmentPanel` — Right panel for viewing/editing assignments (group selection modes)

Dialogs in `components/dialogs/` cover group set creation, import, reimport, copy, delete,
LMS connection, group management, and assignment creation/editing.

### Command Architecture

Group set and group CRUD are frontend-only store actions. Backend manifest commands handle:

- I/O operations (LMS sync, CSV import/export)
- Validation helpers (glob matching, group selection preview)
- System group set maintenance (`ensure_system_group_sets`)
- Group name normalization (`normalize_group_name`)

### Dirty State Tracking

`useDirtyState` uses hash comparison to detect unsaved changes:

- Tracks `profileStore.document` (gitConnection, operations, exports, roster)
- Does NOT track course (immutable) or appSettings (auto-saved)

### Validation

Roster validation runs debounced (200ms) after mutations via `profileStore`. Results are stored
in `rosterValidation` and `assignmentValidation` fields within the profile store.

## Generated Code

**Do not edit directly:**

- `src/bindings/commands.ts` — Generated from `apps/repo-manage/schemas/commands/manifest.json`

To modify commands, edit the manifest and run `pnpm gen:bindings` from the repository root.

## Exports

Main entry point exports:

```typescript
import { AppRoot, setBackend, BackendProvider } from "@repo-edu/app-core"
```

CSS must be imported separately:

```typescript
import "@repo-edu/app-core/src/App.css"
```

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

Six stores manage application state:

| Store                    | Responsibility                                         |
| ------------------------ | ------------------------------------------------------ |
| `appSettingsStore`       | Theme, LMS connection, git connections (app-level)     |
| `profileSettingsStore`   | Course binding, git connection ref, operations/exports |
| `rosterStore`            | Students, assignments, groups + validation             |
| `connectionsStore`       | Draft connection state during editing                  |
| `operationStore`         | Git operation progress and results                     |
| `uiStore`                | Active tab, dialogs, sheets                            |
| `outputStore`            | Console output lines                                   |

### Data Flow

```text
BackendAPI → commands.ts → stores → adapters → components
```

- **adapters/** — Transform between backend snake_case and store camelCase formats
- **services/** — Thin wrappers calling backend via commands
- **hooks/** — React hooks like `useDirtyState` (hash-based change tracking)

### Dirty State Tracking

`useDirtyState` uses hash comparison to detect unsaved changes:

- Tracks `profileSettingsStore` (gitConnection, operations, exports)
- Tracks `rosterStore` (students, assignments, groups)
- Does NOT track course (immutable) or appSettings (auto-saved)

### Validation

Roster validation runs debounced (200ms) after mutations via `rosterStore`. Results are stored
in `rosterValidation` and `assignmentValidation` fields.

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

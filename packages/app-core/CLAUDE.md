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

Five stores manage application state:

| Store               | Responsibility                                                 |
| ------------------- | -------------------------------------------------------------- |
| `appSettingsStore`  | Theme, LMS connection, git connections (app-level)             |
| `profileStore`      | Profile document (settings + roster) with Immer mutations      |
| `connectionsStore`  | Draft connection state during editing + git status cleanup     |
| `operationStore`    | Git operation progress, results, validation/preflight results  |
| `uiStore`           | Active tab, dialogs, sheets                                    |
| `outputStore`       | Console output lines                                           |

The `profileStore` uses Immer middleware for draft-based mutations. It combines profile settings
and roster into a single atomic `ProfileDocument` to prevent synchronization issues.

### Data Flow

```text
BackendAPI → commands.ts → stores → adapters → components
```

- **adapters/** — Transform between backend snake_case and store camelCase formats
- **services/** — Thin wrappers calling backend via commands
- **hooks/** — React hooks like `useDirtyState` (hash-based change tracking)

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

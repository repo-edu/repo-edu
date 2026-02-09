# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Purpose

`@repo-edu/backend-mock` provides an in-memory mock implementation of the `BackendAPI` interface
from `@repo-edu/backend-interface`. It enables:

- Frontend development without Tauri/Rust backend
- Unit testing of app-core stores, hooks, and services
- Interactive demos and documentation previews

## Architecture

The package exports a single `MockBackend` class that implements `BackendAPI`:

```typescript
import { MockBackend } from "@repo-edu/backend-mock"
import { setBackend } from "@repo-edu/app-core"

setBackend(new MockBackend())
```

### Data Model

`MockBackend` stores state in-memory using Maps:

- `profiles`: Map<string, ProfileSettings> — named profile configurations
- `rosters`: Map<string, Roster | null> — per-profile roster data (students, staff, groups,
  group sets, assignments)
- `appSettings`: AppSettings — theme, LMS connection, git connections

Demo data is defined in `data.ts` and includes students, staff, courses, system/LMS/local
group sets with groups, and assignments with group selection modes.

### Key Behaviors

All methods return `Result<T, AppError>` matching the real backend. Operations that modify
state update the in-memory Maps immediately and persist across method calls within the same
instance.

The mock simulates realistic behavior for system group set management, group name normalization,
glob-based group selection, CSV import/export, LMS sync, coverage computation, and dialog
methods.

## Integration Points

Used by:

- `@repo-edu/app-core` — via `setBackend(new MockBackend())` for testing
- Documentation demo pages — for interactive component previews
- Storybook (if present) — for component isolation

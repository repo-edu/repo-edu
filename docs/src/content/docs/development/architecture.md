---
title: Architecture
description: High-level structure of the repo-edu app and workspace.
---

# Architecture

repo-edu is built as a Tauri desktop application with a React frontend and Rust backend, plus a
standalone CLI.

## Project Structure

```text
repo-edu/
├── apps/
│   └── repo-manage/              # Main application
│       ├── src/                  # Tauri React entrypoint (thin wrapper)
│       ├── src-tauri/            # Tauri/Rust backend
│       │   └── src/commands/     # Tauri command handlers
│       ├── core/                 # Shared Rust library
│       │   └── src/operations/   # High-level operations (CLI + GUI)
│       ├── cli/                  # CLI tool (redu)
│       └── schemas/              # JSON Schemas (source of truth for types)
├── crates/
│   ├── lms-client/               # Unified LMS client
│   ├── lms-common/               # Shared LMS types
│   ├── canvas-lms/               # Canvas API
│   └── moodle-lms/               # Moodle API
└── packages/
    ├── ui/                       # Shared shadcn/ui components
    ├── app-core/                 # Environment-agnostic core UI and state
    ├── backend-interface/        # TypeScript contract (BackendAPI interface)
    └── backend-mock/             # In-memory mock backend for tests/demos
```

## Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Zustand + Immer | State management |
| shadcn/ui | Component library |
| TanStack Table | Data tables (roster, membership matrix) |
| Tailwind CSS | Styling |
| Vite | Build tool |
| JSON Schema + generator | Type-safe bindings |

### Backend

| Technology | Purpose |
|------------|---------|
| Tauri | Desktop integration |
| Rust | Core logic |
| tokio | Async runtime |
| reqwest | HTTP client |
| git2 | Git operations |
| serde | Serialization |
| clap | CLI parsing |

## Data Flow

```text
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────┐  │
│  │Component │───▶│  Zustand │───▶│  BackendAPI          │  │
│  │          │◀───│  Store   │◀───│  (injected backend)  │  │
│  └──────────┘    └──────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ Tauri IPC (or mock)
┌─────────────────────────────────────────────────────────────┐
│                         Backend                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Command    │───▶│     Core     │───▶│   Platform   │  │
│  │   Handler    │◀───│   Operation  │◀───│     API      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

The UI lives in `packages/app-core` (with shared components in `packages/ui`).
`apps/repo-manage/src` is a thin Tauri entrypoint that wires a `TauriBackend` and renders `AppRoot`.
This design isolates the frontend from platform-specific backends through a `BackendAPI` interface,
so the same UI can run in Tauri (desktop) or with a mock backend (tests/demos).

#### Backend Isolation

**`packages/backend-interface/`** defines the `BackendAPI` interface with 70+ methods covering LMS,
Git, profiles, roster, groups, and settings. Domain types are auto-generated from JSON Schemas.

**`packages/backend-mock/`** provides an in-memory `MockBackend` implementing `BackendAPI` with
pre-populated demo data for testing and the interactive documentation demo.

#### Tabs

Three main tabs in the application:

| Tab | Component | Purpose |
|-----|-----------|---------|
| **Roster** | `RosterTab` | Student/staff import, editing, git username management |
| **Groups & Assignments** | `GroupsAssignmentsTab` | Group set management, assignment configuration |
| **Operation** | `OperationTab` | Git repository create/clone/delete operations |

#### Components

- `components/tabs/` — Main tab views
- `components/dialogs/` — Modal dialogs (group set management, assignment editing, import/export)
- `components/sheets/` — Slide-out panels (student editor, group editor, coverage report)

#### Stores

Seven Zustand stores with clear responsibilities:

| Store | Middleware | Responsibility |
|-------|-----------|----------------|
| `profileStore` | Immer | Profile document (settings + roster) with undo/redo |
| `appSettingsStore` | — | Theme, LMS connection, git connections (app-level) |
| `connectionsStore` | — | Connection verification status (LMS, git, course) |
| `operationStore` | — | Git operation progress, validation/preflight results |
| `uiStore` | — | Active tab, dialog visibility, sidebar selection |
| `outputStore` | — | Structured console output lines |
| `toastStore` | — | Toast notifications |

The `profileStore` uses Immer middleware because it has deep nesting (roster with groups,
group sets, assignments, members). Other stores have flat state where spread syntax is clearer.

#### Hooks

- `useDirtyState` — Tracks unsaved changes by hashing the profile document
- `useLoadProfile` — Profile loading with stale detection
- `useTheme` — Theme management (system/light/dark)
- `useCloseGuard` — Warns before closing with unsaved changes

#### Services and Adapters

- `services/` — Backend abstraction (`setBackend`, `getBackend`, `BackendProvider`)
- `adapters/` — Data transformers between frontend state and backend types
- `bindings/commands.ts` — Auto-generated command delegation to injected backend

### Backend Layer

1. **Commands** — Tauri `#[tauri::command]` handlers (lms, platform, settings, profiles, roster,
   groups, validation)
2. **Roster** — Roster types, validation, group management, and export
3. **Operations** — High-level business logic shared between CLI and GUI (verify, setup, clone,
   group sync, group import/export)
4. **Platform/LMS** — External API clients (GitHub, GitLab, Gitea, Canvas, Moodle)
5. **Settings** — Configuration loading/saving with profiles

## Data Model

### Roster Structure

The roster uses a reference-based model where groups are top-level entities referenced by ID:

```text
Roster
├── connection         # Canvas/Moodle/import source metadata
├── students[]         # RosterMember[] (enrollment_type = student)
├── staff[]            # RosterMember[] (enrollment_type = teacher/ta/etc.)
├── groups[]           # Group[] (top-level, with origin field)
├── group_sets[]       # GroupSet[] (reference groups by ID)
└── assignments[]      # Assignment[] (reference group sets, define group selection)
```

### Key Entities

**RosterMember** — A student or staff member with enrollment metadata:

- Identity: `name`, `email`, `student_number`, `git_username`
- Status: `status` (active/incomplete/dropped), `git_username_status` (unknown/valid/invalid)
- LMS metadata: `enrollment_type`, `enrollment_display`, `source` (lms/local)

**Group** — A named collection of members with an origin-based editability model:

| Origin | Editable | Created By |
|--------|----------|------------|
| `system` | No | Auto-managed (Individual Students, Staff) |
| `lms` | No | Synced from Canvas/Moodle |
| `local` | Yes | User-created or imported from CSV |

**GroupSet** — A named collection of group references with connection metadata:

| Connection Kind | Description |
|----------------|-------------|
| `system` | System-managed (individual_students, staff) |
| `canvas` | Synced from Canvas group category |
| `moodle` | Synced from Moodle grouping |
| `import` | Imported from CSV file |
| `null` | Local (user-created) |

**Assignment** — References a group set and defines which groups to include:

- `group_set_id` — Which group set this assignment uses
- `group_selection` — Either `all` (with optional exclusions) or `pattern` (glob match on names)

### System Group Sets

Two system group sets are auto-managed by the backend:

- **Individual Students** — One group per active student (for individual assignments)
- **Staff** — One group per staff member

These are created/repaired idempotently via `ensureSystemGroupSets()` and updated whenever the
roster changes.

## Key Patterns

### Type Safety Pipeline

TypeScript and Rust bindings are auto-generated from JSON Schemas:

```text
JSON Schema (apps/repo-manage/schemas/)
    ↓ pnpm gen:bindings
├── packages/backend-interface/src/types.ts      (domain types)
├── packages/backend-interface/src/index.ts      (BackendAPI interface)
├── packages/app-core/src/bindings/commands.ts   (command delegation)
├── apps/repo-manage/src/bindings/tauri.ts       (TauriBackend)
└── apps/repo-manage/core/src/generated/types.rs (Rust DTOs)
```

After changing schemas:

```bash
pnpm gen:bindings
```

### State Management

- **Zustand stores** — UI state, form values, loading flags
- **Immer** — Draft-based mutations in `profileStore` for deep nesting
- **Undo/Redo** — Immer patches with 100-entry history (user mutations only, not system
  normalization)
- **Stable selector fallbacks** — Module-level empty arrays prevent infinite re-render loops
- **Rust settings** — Persistent configuration (JSON files)
- Settings validated with JSON Schema on load; invalid fields normalized to defaults

### Error Handling

Errors flow from Rust to frontend with context:

```rust
// Rust
#[derive(Debug, thiserror::Error)]
pub enum PlatformError {
    #[error("Authentication failed: {0}")]
    Auth(String),
    // ...
}
```

```typescript
// Frontend
try {
  await lmsService.verify(params);
} catch (error) {
  outputStore.setError(String(error));
}
```

### Progress Reporting

Long operations report progress via callbacks:

```rust
pub enum ProgressEvent {
    Started { operation: String },
    Progress { current: u32, total: u32, message: String },
    Completed { operation: String, details: Option<String> },
    Failed { operation: String, error: String },
}
```

The GUI displays these in the output panel; the CLI prints to stdout.

## CLI Architecture

The CLI shares `repo-manage-core` with the GUI:

```text
┌───────────────────┐     ┌───────────────────┐
│   Tauri GUI       │     │   CLI (redu)      │
│   (src-tauri)     │     │   (cli)           │
└─────────┬─────────┘     └─────────┬─────────┘
          │                         │
          └────────────┬────────────┘
                       ▼
            ┌─────────────────────┐
            │  repo-manage-core   │
            │  (core)             │
            └─────────────────────┘
```

Both interfaces:

- Use the same settings files
- Call the same core operations
- Share the same platform/LMS clients

The CLI is a power-user scripting tool, not a full-featured alternative to the GUI. It focuses on
I/O operations (import, export, sync) and automation (repo create/clone/delete). Interactive
configuration and CRUD operations are GUI-only.

## Configuration Architecture

```text
~/.config/repo-edu/
├── app.json               # App-level settings (theme, connections)
├── profiles/
│   ├── default.json       # Profile settings (course, operations, exports)
│   ├── course-a.json
│   └── course-b.json
└── rosters/
    ├── default.json       # Roster data (members, groups, group sets, assignments)
    ├── course-a.json
    └── course-b.json
```

Settings are validated against JSON Schemas on load. Invalid fields are normalized to defaults.

## See Also

- [Crates](./crates.md) — Detailed crate documentation
- [Building](./building.md) — Build instructions
- [Contributing](./contributing.md) — Development workflow
- [Design Decisions](./design-decisions.md) — Architectural decision records

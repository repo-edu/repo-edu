# Architecture

repo-edu is built as a Tauri desktop application with a React frontend and Rust backend, plus a
standalone CLI.

## Project Structure

```text
repo-edu/
├── apps/
│   └── repo-manage/              # Main application
│       ├── src/                  # React frontend
│       │   ├── components/       # UI components
│       │   ├── hooks/            # React hooks
│       │   ├── services/         # Tauri command wrappers
│       │   ├── stores/           # Zustand state stores
│       │   └── adapters/         # Data transformation
│       ├── src-tauri/            # Tauri/Rust backend
│       │   └── src/commands/     # Tauri command handlers
│       ├── core/                 # Shared Rust library
│       │   ├── src/lms/          # LMS operations
│       │   ├── src/platform/     # Git platform APIs
│       │   └── src/settings/     # Configuration
│       └── cli/                  # CLI tool
├── crates/
│   ├── lms-client/               # Unified LMS client
│   ├── lms-common/               # Shared LMS types
│   ├── canvas-lms/               # Canvas API
│   └── moodle-lms/               # Moodle API
└── packages/
    └── ui/                       # Shared UI components
```

## Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Zustand | State management |
| shadcn/ui | Component library |
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
│  │Component │───▶│  Zustand │───▶│  Service (invoke)    │  │
│  │          │◀───│  Store   │◀───│                      │  │
│  └──────────┘    └──────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ Tauri IPC
┌─────────────────────────────────────────────────────────────┐
│                         Backend                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Command    │───▶│     Core     │───▶│   Platform   │  │
│  │   Handler    │◀───│   Operation  │◀───│     API      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Frontend Layer

The frontend uses a roster-centric design with three main tabs: Roster, Assignment, and Operation.

1. **Components** — React components organized by:
   - `tabs/` — Main tab views (`RosterTab`, `AssignmentTab`, `OperationTab`)
   - `dialogs/` — Modal dialogs for editing
   - `sheets/` — Slide-out panels for settings and editors
2. **Stores** — Zustand stores:
   - `rosterStore` — Roster data and selection state
   - `appSettingsStore` — App-level settings
   - `profileSettingsStore` — Per-profile connection settings
   - `connectionsStore` — LMS/Git connection configuration
   - `operationStore` — Git operation state
   - `outputStore` — Console output
   - `uiStore` — UI state (dialogs, sheets, active profile)
3. **Hooks** — `useDirtyState`, `useLoadProfile`, `useTheme`, `useCloseGuard`
4. **Services** — Thin wrappers that call Tauri commands via `invoke()`
5. **Adapters** — Transform between frontend state and backend types

### Backend Layer

1. **Commands** — Tauri `#[tauri::command]` handlers (lms, platform, settings, profiles, roster,
   validation)
2. **Roster** — Roster types, validation, and export
3. **Operations** — High-level business logic (verify, setup, clone)
4. **Platform/LMS** — External API clients (GitHub, GitLab, Gitea, Canvas, Moodle)
5. **Settings** — Configuration loading/saving with profiles

## Key Patterns

### Type Safety Pipeline

TypeScript bindings are auto-generated from JSON Schemas:

```text
JSON Schema → gen:bindings → bindings/types.ts + bindings/commands.ts → TypeScript
```

After changing schemas:

```bash
pnpm gen:bindings
```

### State Management

- **Zustand stores** — UI state, form values, loading flags
- **Rust settings** — Persistent configuration (JSON files)
- Settings are validated with JSON Schema on load

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

::: warning CLI Commands Disabled
LMS and Repo commands are temporarily disabled during the roster refactor. Only Profile commands
(`redu profile list|active|show|load`) are currently functional.
:::

## Configuration Architecture

```text
~/.config/repo-edu/
├── app.json               # App-level settings (theme, connections)
├── profiles/
│   ├── default.json       # Profile settings (course, operations, exports)
│   ├── course-a.json
│   └── course-b.json
└── rosters/
    ├── default.json       # Roster data (students, assignments)
    ├── course-a.json
    └── course-b.json
```

Settings are validated against JSON Schemas on load. Invalid fields are normalized to defaults.

## See Also

- [Crates](./crates.md) — Detailed crate documentation
- [Building](./building.md) — Build instructions
- [Contributing](./contributing.md) — Development workflow

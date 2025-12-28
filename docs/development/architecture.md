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
│       ├── repo-manage-core/     # Shared Rust library
│       │   ├── src/lms/          # LMS operations
│       │   ├── src/platform/     # Git platform APIs
│       │   └── src/settings/     # Configuration
│       └── repo-manage-cli/      # CLI tool
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

1. **Components** — React components for UI
2. **Stores** — Zustand stores hold form state and async status
3. **Hooks** — `useXxxActions` hooks wrap store mutations with service calls
4. **Services** — Thin wrappers that call Tauri commands via `invoke()`
5. **Adapters** — Transform between frontend state and backend types

### Backend Layer

1. **Commands** — Tauri `#[tauri::command]` handlers
2. **Operations** — High-level business logic
3. **Platform/LMS** — External API clients
4. **Settings** — Configuration loading/saving

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
│   (src-tauri)     │     │   (repo-manage-cli)│
└─────────┬─────────┘     └─────────┬─────────┘
          │                         │
          └────────────┬────────────┘
                       ▼
            ┌─────────────────────┐
            │  repo-manage-core   │
            │  (shared library)   │
            └─────────────────────┘
```

Both interfaces:

- Use the same settings files
- Call the same core operations
- Share the same platform/LMS clients

## Configuration Architecture

```text
~/.config/repo-edu/
├── settings.json          # App-level settings
│   ├── activeProfile      # Current profile name
│   ├── theme              # UI theme
│   └── activeTab          # Last active tab
└── profiles/
    ├── default.json       # Profile settings
    ├── course-a.json
    └── course-b.json
```

Settings are validated against a JSON Schema on load. Invalid fields are normalized to defaults.

## See Also

- [Crates](/development/crates) — Detailed crate documentation
- [Building](/development/building) — Build instructions
- [Contributing](/development/contributing) — Development workflow

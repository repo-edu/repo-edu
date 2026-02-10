# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Build & Development Commands

Most commands work from both repository root and `apps/repo-manage` (bidirectional forwarding).
Use pnpm scripts exclusively—never npm or npx commands.

```bash
# Development
pnpm install              # Install all dependencies
pnpm dev                  # Run desktop app in dev mode

# Building
pnpm cli:build            # Build debug CLI (binary: redu)
pnpm cli:build:release    # Build release CLI
pnpm build                # Build debug Tauri app (.app only)
pnpm build:release        # Build release Tauri app (.app + .dmg)

# Testing
pnpm test                 # Run all tests (TS + Rust)
pnpm test:ts              # Run frontend tests (vitest)
pnpm test:rs              # Run Rust tests

# Run single tests
pnpm test:ts -- <pattern>                     # Run specific frontend test
pnpm test:rs -- -p repo-manage-core <name>    # Run specific Rust test

# Linting & Formatting
pnpm fmt                  # Format all (TS + Rust + Markdown)
pnpm check                # Check all (Biome + Clippy + Markdown + Schemas)
pnpm fix                  # Fix all auto-fixable issues
pnpm typecheck            # Type check TS and Rust
pnpm validate             # Run check + typecheck + test

# Type Bindings
pnpm gen:bindings         # Regenerate TS + Rust bindings from JSON Schemas
pnpm check:schemas        # Validate schemas + check coverage + command parity

# Documentation
pnpm docs:dev             # Preview documentation locally
pnpm docs:build           # Build documentation site

# CLI
./target/debug/redu --help            # Run CLI after building
./target/debug/redu lms verify        # Example: verify LMS connection
./target/debug/redu git verify        # Example: verify git platform
./target/debug/redu roster show       # Example: show roster summary
./target/debug/redu profile list      # Example: list profiles
```

## Commit & PR Guidelines

- Commit messages use conventional prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`.

## Architecture

### Workspace Structure

The repository uses two workspace systems:

- **pnpm workspace** (root `pnpm-workspace.yaml`) — manages TypeScript packages
- **Cargo workspace** (root `Cargo.toml`) — manages all Rust crates

```bash
repo-edu/
├── Cargo.toml              # Rust workspace root
├── Cargo.lock              # Shared lock file for all Rust crates
├── package.json            # pnpm scripts (delegates to workspaces)
├── pnpm-workspace.yaml     # TypeScript workspace config
├── apps/
│   └── repo-manage/        # Main Tauri desktop app
│       ├── src/            # Tauri React entrypoint (thin wrapper around app-core)
│       ├── src-tauri/      # Tauri Rust backend (workspace member)
│       ├── core/           # Shared Rust library (workspace member)
│       └── cli/            # CLI tool (workspace member)
├── crates/                 # Shared Rust libraries
│   ├── lms-common/         # Common LMS traits, types, error handling
│   ├── lms-client/         # Unified LMS client (Canvas/Moodle selection)
│   ├── canvas-lms/         # Canvas LMS API client
│   └── moodle-lms/         # Moodle LMS API client
├── docs/                   # Documentation site with Astro/Starlight
└── packages/               # Frontend implementation + shared TypeScript packages
    ├── ui/                 # Shared shadcn/ui components
    ├── app-core/           # Environment-agnostic core UI and state management
    ├── backend-interface/  # TypeScript contract between frontend and backend
    └── backend-mock/       # In-memory mock backend for testing and demos
```

### Shared Operations Layer

`apps/repo-manage/core/src/operations/`

High-level operations shared between CLI and GUI:

- `platform.rs` - Git platform verification
- `lms.rs` - LMS verification, roster imports, and group set sync
- `repo.rs` - Repository create/clone/delete operations
- `validation.rs` - Roster and assignment validation
- `group_set.rs` - Group set CSV import/export/preview

Both CLI and Tauri commands call these operations with a progress callback for status updates.

### Frontend Architecture

#### Backend Isolation

The UI implementation lives in `packages/app-core` (with shared UI in `packages/ui`).
`apps/repo-manage/src` is a thin Tauri entrypoint that wires a backend and renders `AppRoot`.
This design isolates the frontend from platform-specific backends through a `BackendAPI` interface,
so the same UI can run in Tauri (desktop) or with a mock backend (tests/demos).

**`packages/backend-interface/`** — TypeScript contract between frontend and backend

- `index.ts` - `BackendAPI` interface (LMS, Git, profiles, roster, groups, settings)
- `types.ts` - Auto-generated domain types from JSON Schemas

**`packages/app-core/`** — Environment-agnostic core UI and state management

- `stores/` - Zustand stores:
  - `appSettingsStore` - App-level settings (theme, LMS, git connections)
  - `profileStore` - Profile document (settings + roster) with Immer mutations and undo/redo
  - `connectionsStore` - Draft connection state during editing
  - `operationStore` - Git operation progress and results
  - `outputStore` - Console output messages
  - `uiStore` - Active tab, dialog visibility, sheet state, sidebar selection
  - `toastStore` - Toast notifications
- `components/tabs/` - Main tab views (`RosterTab`, `GroupsAssignmentsTab`, `OperationTab`)
- `components/tabs/groups-assignments/` - Groups & Assignments tab (sidebar + panel layout)
- `components/dialogs/` - Modal dialogs (group sets, assignments, imports, roster, git)
- `components/sheets/` - Slide-out panels (`StudentEditorSheet`, `DataOverviewSheet`,
  `CoverageReportSheet`, `FileImportExportSheet`)
- `hooks/` - React hooks (`useDirtyState`, `useLoadProfile`, `useTheme`, `useCloseGuard`,
  `useDataOverview`)
- `services/` - Backend abstraction (`setBackend`, `getBackend`, `BackendProvider`)
- `adapters/` - Data transformers between frontend state and backend types (`settingsAdapter`)
- `bindings/commands.ts` - Auto-generated command delegation to injected backend

**`packages/backend-mock/`** — In-memory mock backend for testing and demos

- `index.ts` - `MockBackend` class implementing `BackendAPI`
- `data.ts` - Demo data fixtures
- Pre-populated demo data (students, staff, courses, system/LMS/local group sets, assignments)

#### Shared UI Components

**`packages/ui/`** — Shared shadcn/ui component library

#### Tauri Desktop Entry Point

**`apps/repo-manage/src/`** (thin wrapper)

- `main.tsx` - Injects `TauriBackend` and renders `AppRoot` from app-core
- `bindings/tauri.ts` - Auto-generated `TauriBackend` wrapping Rust commands

### Rust Backend Architecture

`apps/repo-manage/src-tauri/`

- `src/commands/` - Tauri command handlers (lms.rs, platform.rs, settings.rs, profiles.rs,
  roster.rs, validation.rs)
- `core/src/` - Core business logic
  - `roster/` - Roster types, validation, export, group naming, system group sets, glob matching
  - `lms/` - Canvas/Moodle LMS client integration
  - `platform/` - Git platform APIs (GitHub, GitLab, Gitea)
  - `settings/` - Configuration management with JSON Schema validation
  - `operations/` - Shared operations called by both CLI and GUI (including group set ops)

### CLI Structure

`apps/repo-manage/cli/`

The `redu` CLI uses clap with domain-based subcommands:

- `redu lms verify|import-students|import-groups` - LMS operations (including group set sync)
- `redu git verify` - Git platform operations
- `redu repo create|clone|delete` - Repository operations
- `redu roster show` - Roster inspection
- `redu validate` - Assignment validation
- `redu profile list|active|show|load` - Profile management

CLI is I/O-only (sync/import/reimport/export) — all group set CRUD is frontend-only.
CLI reads settings from `~/.config/repo-manage/settings.json` (same as GUI).

### Data Model (Groups & Assignments)

Groups are top-level profile entities with UUIDs. GroupSets reference groups by ID (not embedded).
Assignments reference a group set by ID. Group selection mode lives on the group set.

**Core entities:** `Group`, `GroupSet`, `Assignment`, `RosterMember`, `Roster` — defined in
JSON Schemas and generated into both TypeScript and Rust types.

**Group editability:** Determined by `origin` — mutable iff `origin === "local"`. No "break
connection" mechanism.

**System group sets:** "Individual Students" (one group per student) and "Staff" (single group
with all non-students). Auto-maintained by `ensure_system_group_sets`.

**Connection types:**

| Type | Editable | Groups | Sync |
|------|----------|--------|------|
| system | No | origin: system | Auto-sync with roster |
| canvas/moodle | No | origin: lms | LMS API sync |
| import | Yes | origin: local | CSV re-import |
| null (local) | Yes | Mixed origins | N/A |

**Command architecture (3 tiers):**

- Frontend-only: Store actions/selectors (group set CRUD, assignment CRUD)
- Manifest commands: Cross frontend/backend boundary (sync, import, export, validation)
- Backend-only: Shared Rust operations (CLI + Tauri handlers)

### Type Flow

```text
JSON Schemas (apps/repo-manage/schemas/)
    ↓ pnpm gen:bindings
Generated TypeScript:
    - packages/backend-interface/src/types.ts (domain types)
    - packages/backend-interface/src/index.ts (BackendAPI interface)
    - packages/app-core/src/bindings/commands.ts (command delegation)
    - apps/repo-manage/src/bindings/tauri.ts (TauriBackend)
Generated Rust:
    - apps/repo-manage/core/src/generated/types.rs
    ↓
Zustand stores → React components
```

After changing schemas, run `pnpm gen:bindings` to regenerate bindings.

## Generated Code Policy

**NEVER edit these files directly—they are regenerated from JSON Schemas:**

- `packages/backend-interface/src/index.ts`
- `packages/backend-interface/src/types.ts`
- `packages/app-core/src/bindings/commands.ts`
- `apps/repo-manage/src/bindings/tauri.ts`
- `apps/repo-manage/core/src/generated/types.rs`

**To change types or commands:**

1. Edit the JSON Schema in `apps/repo-manage/schemas/types/*.schema.json`
2. For commands, edit `apps/repo-manage/schemas/commands/manifest.json`
3. Run `pnpm gen:bindings` to regenerate all bindings

The generator script is `scripts/gen-from-schema.ts`. See `apps/repo-manage/schemas/README.md`
for schema conventions and the `x-rust` extension spec.

## Code Conventions

- Uses Biome for JS/TS linting/formatting (double quotes, no semicolons except when needed)
- Uses pnpm Catalogs for shared dependency versions (see `pnpm-workspace.yaml`)
- Path alias `@/` maps to `apps/repo-manage/src/`
- Path alias `@repo-edu/ui` maps to `packages/ui/src/`
- Path alias `@repo-edu/app-core` maps to `packages/app-core/src/`
- Path alias `@repo-edu/backend-interface` maps to `packages/backend-interface/src/`
- Path alias `@repo-edu/backend-mock` maps to `packages/backend-mock/src/`

## Sub-Directory Documentation

For detailed guidance on specific areas, see:

| File | Description |
| :--- | ----------- |
| `crates/CLAUDE.md` | LMS client crate architecture |
| `apps/repo-manage/core/CLAUDE.md` | Core library patterns |
| `apps/repo-manage/cli/CLAUDE.md` | CLI structure and testing |
| `apps/repo-manage/src-tauri/CLAUDE.md` | Tauri backend commands |
| `packages/ui/CLAUDE.md` | shadcn/ui component library |
| `packages/app-core/CLAUDE.md` | Environment-agnostic core UI and state management |
| `packages/backend-interface/CLAUDE.md` | TypeScript contract between frontend and backend |
| `packages/backend-mock/CLAUDE.md` | In-memory mock backend for testing and demos |
| `docs/CLAUDE.md` | Documentation site with Astro/Starlight |

## Test Locations

- Frontend tests live under `packages/app-core/src/**/*.test.ts(x)`.
- Rust tests live under `crates/**/tests` or `mod tests` blocks.

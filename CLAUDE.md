# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Build & Development Commands

Most commands work from both repository root and `apps/repo-manage` (bidirectional forwarding).
Use pnpm scripts exclusively—never raw cargo, npm, or npx commands.

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
│       ├── src/            # React frontend
│       ├── src-tauri/      # Tauri Rust backend (workspace member)
│       ├── core/           # Shared Rust library (workspace member)
│       └── cli/            # CLI tool (workspace member)
├── crates/                 # Shared Rust libraries
│   ├── lms-common/         # Common LMS traits, types, error handling
│   ├── lms-client/         # Unified LMS client (Canvas/Moodle selection)
│   ├── canvas-lms/         # Canvas LMS API client
│   └── moodle-lms/         # Moodle LMS API client
├── docs/                   # Documentation site with Astro/Starlight
└── packages/               # TypeScript packages for frontend
    ├── ui/                 # Shared shadcn/ui components
    ├── app-core/           # Environment-agnostic core UI and state management
    ├── backend-interface/  # TypeScript contract between frontend and backend
    └── backend-mock/       # In-memory mock backend for testing and demos
```

### Shared Operations Layer

`apps/repo-manage/core/src/operations/`

High-level operations shared between CLI and GUI:

- `platform.rs` - Git platform verification
- `lms.rs` - LMS verification and roster imports
- `repo.rs` - Repository create/clone/delete operations
- `validation.rs` - Assignment validation

Both CLI and Tauri commands call these operations with a progress callback for status updates.

### Frontend Architecture

#### Backend Isolation

The frontend is isolated from platform-specific backends through a `BackendAPI` interface.
This enables the same UI to run in Tauri (desktop) or with a mock backend (tests/demos).

**`packages/backend-interface/`** — TypeScript contract between frontend and backend

- `index.ts` - `BackendAPI` interface with 70+ methods (LMS, Git, profiles, roster, settings)
- `types.ts` - Auto-generated domain types from JSON Schemas

**`packages/app-core/`** — Environment-agnostic core UI and state management

- `stores/` - Zustand stores:
  - `rosterStore` - Student roster data and selection state
  - `appSettingsStore` - App-level settings (theme, LMS, git connections)
  - `profileSettingsStore` - Per-profile connection settings
  - `connectionsStore` - Draft connection state during editing
  - `operationStore` - Git operation progress and results
  - `outputStore` - Console output messages
  - `uiStore` - Active tab, dialog visibility, sheet state
- `components/tabs/` - Main tab views (`RosterTab`, `AssignmentTab`, `OperationTab`)
- `components/dialogs/` - Modal dialogs for editing students, assignments, groups
- `components/sheets/` - Slide-out panels (`StudentEditorSheet`, `GroupEditorSheet`,
  `CoverageReportSheet`)
- `hooks/` - React hooks (`useDirtyState`, `useLoadProfile`, `useTheme`, `useCloseGuard`)
- `services/` - Backend abstraction (`setBackend`, `getBackend`, `BackendProvider`)
- `adapters/` - Data transformers between frontend state and backend types (`settingsAdapter`)
- `bindings/commands.ts` - Auto-generated command delegation to injected backend

**`packages/backend-mock/`** — In-memory mock backend for testing and demos

- `index.ts` - `MockBackend` class implementing `BackendAPI`
- Pre-populated demo data (6 students, 2 assignments, 2 LMS group sets)

#### Shared UI Components

**`packages/ui/`** — Shared shadcn/ui component library

#### Tauri Desktop Entry Point

**`apps/repo-manage/src/`**

- `main.tsx` - Injects `TauriBackend` and renders `AppRoot` from app-core
- `bindings/tauri.ts` - Auto-generated `TauriBackend` wrapping Rust commands

### Rust Backend Architecture

`apps/repo-manage/src-tauri/`

- `src/commands/` - Tauri command handlers (lms.rs, platform.rs, settings.rs, profiles.rs,
  roster.rs)
- `core/src/` - Core business logic
  - `roster/` - Roster types, validation, and export
  - `lms/` - Canvas/Moodle LMS client integration
  - `platform/` - Git platform APIs (GitHub, GitLab, Gitea)
  - `settings/` - Configuration management with JSON Schema validation
  - `operations/` - Shared operations called by both CLI and GUI

### CLI Structure

`apps/repo-manage/cli/`

The `redu` CLI uses clap with domain-based subcommands:

- `redu lms verify|import-students|import-groups` - LMS operations
- `redu git verify` - Git platform operations
- `redu repo create|clone|delete` - Repository operations
- `redu roster show` - Roster inspection
- `redu validate` - Assignment validation
- `redu profile list|active|show|load` - Profile management

CLI reads settings from `~/.config/repo-manage/settings.json` (same as GUI).

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

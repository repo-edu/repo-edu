# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Build & Development Commands

All commands work from both repository root and `apps/repo-manage` (bidirectional forwarding).
Use pnpm scripts exclusively—never raw cargo, npm, or npx commands.

```bash
# Development
pnpm install              # Install all dependencies
pnpm dev                  # Run desktop app in dev mode

# Building
pnpm cli:build            # Build debug CLI (binary: redu)
pnpm cli:build:release    # Build release CLI
pnpm tauri:build          # Build debug Tauri app (.app only)
pnpm tauri:build:release  # Build release Tauri app (.app + .dmg)

# Testing
pnpm test                 # Run all tests (TS + Rust)
pnpm test:ts              # Run frontend tests (vitest)
pnpm test:rs              # Run Rust tests

# Run single tests
pnpm test:ts -- <pattern>                     # Run specific frontend test
pnpm test:rs -- -p repo-manage-core <name>    # Run specific Rust test

# Linting & Formatting
pnpm fmt                  # Format all (TS + Rust + Markdown)
pnpm check                # Check all (Biome + Clippy + Markdown)
pnpm fix                  # Fix all auto-fixable issues
pnpm typecheck            # Type check TS and Rust
pnpm validate             # Run check + typecheck + test

# Type Bindings
pnpm gen:bindings         # Regenerate TS bindings from Rust

# Documentation
pnpm docs:dev             # Preview documentation locally

# CLI
./target/debug/redu --help            # Run CLI after building
./target/debug/redu lms verify        # Example: verify LMS connection
./target/debug/redu repo verify       # Example: verify git platform
./target/debug/redu profile list      # Example: list profiles
```

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
│       ├── repo-manage-core/   # Shared Rust library (workspace member)
│       └── repo-manage-cli/    # CLI tool (workspace member)
├── crates/                 # Shared Rust libraries
│   ├── lms-common/         # Common LMS traits, types, error handling
│   ├── lms-client/         # Unified LMS client (Canvas/Moodle selection)
│   ├── canvas-lms/         # Canvas LMS API client
│   └── moodle-lms/         # Moodle LMS API client
└── packages/
    └── ui/                 # Shared shadcn/ui components
```

### Shared Operations Layer

The `repo-manage-core/src/operations/` module contains high-level operations shared between CLI
and GUI:

- `verify.rs` - Platform connection verification
- `lms.rs` - LMS course verification and file generation
- `setup.rs` - Student repository creation from templates
- `clone.rs` - Repository cloning

Both CLI and Tauri commands call these operations with a progress callback for status updates.

### Frontend Architecture (apps/repo-manage/src)

- **stores/** - Zustand stores (`lmsFormStore`, `repoFormStore`, `uiStore`, `outputStore`)
- **hooks/** - React hooks for actions (`useLmsActions`, `useRepoActions`) and state
  (`useDirtyState`, `useLoadSettings`)
- **services/** - Thin wrappers around Tauri commands (`lmsService`, `repoService`,
  `settingsService`)
- **adapters/** - Data transformers between frontend state and backend types (`settingsAdapter`)
- **bindings.ts** - Auto-generated TypeScript bindings from Rust (via tauri-specta)

### Rust Backend Architecture (apps/repo-manage/src-tauri)

- **src/commands/** - Tauri command handlers (lms.rs, platform.rs, settings.rs, profiles.rs)
- **repo-manage-core/src/** - Core business logic
  - **lms/** - Canvas/Moodle LMS client integration
  - **platform/** - Git platform APIs (GitHub, GitLab, Gitea)
  - **settings/** - Configuration management with JSON Schema validation
  - **operations/** - Shared operations called by both CLI and GUI

### CLI Structure (repo-manage-cli)

The `redu` CLI uses clap with domain-based subcommands:

- `redu lms verify|generate` - LMS operations
- `redu repo verify|setup|clone` - Repository operations
- `redu profile list|active|show|load` - Profile management

CLI reads settings from `~/.config/repo-manage/settings.json` (same as GUI).

### Type Flow

Rust types → tauri-specta → bindings.ts → Frontend services → Zustand stores

After changing Rust types, run `pnpm gen:bindings` to update TypeScript bindings.

## Code Conventions

- Uses Biome for JS/TS linting/formatting (double quotes, no semicolons except when needed)
- Uses pnpm Catalogs for shared dependency versions (see `pnpm-workspace.yaml`)
- Path alias `@/` maps to `apps/repo-manage/src/`
- Path alias `@repo-edu/ui` maps to `packages/ui/src/`

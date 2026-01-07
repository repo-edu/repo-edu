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
│       ├── core/               # Shared Rust library (workspace member)
│       └── cli/                # CLI tool (workspace member)
├── crates/                 # Shared Rust libraries
│   ├── lms-common/         # Common LMS traits, types, error handling
│   ├── lms-client/         # Unified LMS client (Canvas/Moodle selection)
│   ├── canvas-lms/         # Canvas LMS API client
│   └── moodle-lms/         # Moodle LMS API client
└── packages/
    └── ui/                 # Shared shadcn/ui components
```

### Shared Operations Layer

The `core/src/operations/` module contains high-level operations shared between CLI
and GUI:

- `verify.rs` - Platform connection verification
- `lms.rs` - LMS course verification and file generation
- `setup.rs` - Student repository creation from templates
- `clone.rs` - Repository cloning

Both CLI and Tauri commands call these operations with a progress callback for status updates.

### Frontend Architecture (apps/repo-manage/src)

- **stores/** - Zustand stores (`lmsFormStore`, `repoFormStore`, `uiStore`, `outputStore`)
- **hooks/** - React hooks for actions (`useLmsActions`, `useRepoActions`) and state (
  `useDirtyState`, `useLoadSettings`)
- **services/** - Thin wrappers around Tauri commands (`lmsService`, `repoService`,
  `settingsService`)
- **adapters/** - Data transformers between frontend state and backend types (`settingsAdapter`)
- **bindings/types.ts** - Auto-generated TypeScript types from JSON Schemas
- **bindings/commands.ts** - Auto-generated Tauri command wrappers

### Rust Backend Architecture (apps/repo-manage/src-tauri)

- **src/commands/** - Tauri command handlers (lms.rs, platform.rs, settings.rs, profiles.rs)
- **core/src/** - Core business logic
  - **lms/** - Canvas/Moodle LMS client integration
  - **platform/** - Git platform APIs (GitHub, GitLab, Gitea)
  - **settings/** - Configuration management with JSON Schema validation
  - **operations/** - Shared operations called by both CLI and GUI

### CLI Structure (cli)

The `redu` CLI uses clap with domain-based subcommands:

- `redu lms verify|generate` - LMS operations
- `redu repo verify|setup|clone` - Repository operations
- `redu profile list|active|show|load` - Profile management

CLI reads settings from `~/.config/repo-manage/settings.json` (same as GUI).

### Type Flow

JSON Schema → `pnpm gen:bindings` → TS types + Rust DTOs → Frontend services → Zustand stores

After changing schemas, run `pnpm gen:bindings` to regenerate bindings.

## Generated Code Policy

**NEVER edit these files directly—they are regenerated from JSON Schemas:**

- `apps/repo-manage/src/bindings/types.ts`
- `apps/repo-manage/src/bindings/commands.ts`
- `apps/repo-manage/src-tauri/src/generated/types.rs`
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

## Sub-Directory Documentation

For detailed guidance on specific areas, see the CLAUDE.md files in:

- `crates/CLAUDE.md` — LMS client crate architecture
- `apps/repo-manage/core/CLAUDE.md` — Core library patterns
- `apps/repo-manage/cli/CLAUDE.md` — CLI structure and testing
- `apps/repo-manage/src-tauri/CLAUDE.md` — Tauri backend commands
- `packages/ui/CLAUDE.md` — shadcn/ui component library

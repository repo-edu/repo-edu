# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development
pnpm install                                    # Install all dependencies
pnpm --filter @repo-edu/repo-manage tauri dev  # Run desktop app in dev mode

# Building
pnpm --filter @repo-edu/repo-manage tauri build  # Build production app
cargo build -p repo-manage-core                  # Build Rust core library
cargo build -p repo-manage-cli                   # Build CLI (binary: redu)

# Testing
pnpm --filter @repo-edu/repo-manage test:run     # Run frontend tests (vitest)
cargo test -p repo-manage-core                   # Run Rust core tests
cargo test -p repo-manage-cli                    # Run CLI tests

# Linting & Formatting
pnpm lint                                        # Biome check
pnpm lint:fix                                    # Biome fix
pnpm format                                      # Biome format
cargo fmt                                        # Rust format
cargo clippy                                     # Rust lints

# Type Bindings
pnpm --filter @repo-edu/repo-manage gen:bindings # Regenerate TS bindings from Rust
```

## Architecture

### Monorepo Structure
- **apps/repo-manage/** - Main Tauri desktop app
  - **src/** - React frontend (Vite + TypeScript)
  - **src-tauri/** - Tauri Rust backend with commands
  - **repo-manage-core/** - Shared Rust library (LMS, platform APIs, settings)
  - **repo-manage-cli/** - CLI tool (`redu` binary)
- **packages/ui/** - Shared shadcn/ui components

### Frontend Architecture (apps/repo-manage/src)
- **stores/** - Zustand stores (`lmsFormStore`, `repoFormStore`, `uiStore`, `outputStore`)
- **hooks/** - React hooks for actions (`useLmsActions`, `useRepoActions`) and state (`useDirtyState`, `useLoadSettings`)
- **services/** - Thin wrappers around Tauri commands (`lmsService`, `repoService`, `settingsService`)
- **adapters/** - Data transformers between frontend state and backend types (`settingsAdapter`)
- **bindings.ts** - Auto-generated TypeScript bindings from Rust (via tauri-specta)

### Rust Backend Architecture (apps/repo-manage/src-tauri)
- **src/commands/** - Tauri command handlers (lms.rs, platform.rs, settings.rs, profiles.rs)
- **repo-manage-core/src/** - Core business logic
  - **lms/** - Canvas/Moodle LMS client integration
  - **platform/** - Git platform APIs (GitHub, GitLab, Gitea)
  - **settings/** - Configuration management with JSON Schema validation

### Type Flow
Rust types → tauri-specta → bindings.ts → Frontend services → Zustand stores

After changing Rust types, run `gen:bindings` to update TypeScript bindings.

## Code Conventions

- Uses Biome for JS/TS linting/formatting (double quotes, no semicolons except when needed)
- Uses pnpm Catalogs for shared dependency versions (see `pnpm-workspace.yaml`)
- Path alias `@/` maps to `apps/repo-manage/src/`
- Path alias `@repo-edu/ui` maps to `packages/ui/src/`

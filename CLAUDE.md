# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Build & Development Commands

```bash
# Development
pnpm install              # Install all dependencies
pnpm tauri:dev            # Run desktop app in dev mode

# Building
pnpm cli:build            # Build debug CLI (binary: redu)
pnpm cli:build:release    # Build release CLI
pnpm tauri:build          # Build debug Tauri app (.app only)
pnpm tauri:build:release  # Build release Tauri app (.app + .dmg)

# Testing
pnpm test                 # Run all tests (TS + Rust)
pnpm test:ts              # Run frontend tests (vitest)
pnpm test:rs              # Run Rust tests

# Linting & Formatting
pnpm fmt                  # Format all (TS + Rust + Markdown)
pnpm check                # Check all (Biome + Clippy + Markdown)
pnpm fix                  # Fix all auto-fixable issues
pnpm typecheck            # Type check TS and Rust
pnpm validate             # Run check + typecheck + test

# Type Bindings
pnpm gen:bindings         # Regenerate TS bindings from Rust (from apps/repo-manage)
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
- **hooks/** - React hooks for actions (`useLmsActions`, `useRepoActions`) and state (
  `useDirtyState`, `useLoadSettings`)
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

### Type Flow

Rust types → tauri-specta → bindings.ts → Frontend services → Zustand stores

After changing Rust types, run `gen:bindings` to update TypeScript bindings.

## Code Conventions

- Uses Biome for JS/TS linting/formatting (double quotes, no semicolons except when needed)
- Uses pnpm Catalogs for shared dependency versions (see `pnpm-workspace.yaml`)
- Path alias `@/` maps to `apps/repo-manage/src/`
- Path alias `@repo-edu/ui` maps to `packages/ui/src/`

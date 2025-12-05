# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

repo-edu is a monorepo for educational repository management tools. The main application is `repo-manage`, a Tauri-based desktop app that integrates with Learning Management Systems (Canvas/Moodle) and Git platforms (GitHub/GitLab/Gitea) to manage student repositories.

## Repository Structure

```
repo-edu/
├── apps/
│   └── repo-manage/              # Main Tauri application
│       ├── src/                  # React frontend (TypeScript)
│       ├── src-tauri/            # Tauri backend (Rust)
│       ├── repo-manage-core/     # Core library (Rust)
│       └── repo-manage-cli/      # CLI tool (Rust binary: redu)
├── packages/
│   └── ui/                       # Shared UI components (@repo-edu/ui)
└── docs/                         # VitePress documentation
```

## Technology Stack

### Frontend
- **React 19** with TypeScript
- **Zustand** for state management (stores in `src/stores/`)
- **Vite** for development and bundling
- **Vitest** for testing
- **shadcn/ui** components via `@repo-edu/ui` package
- **Tauri API** for native integration

### Backend (Rust)
- **Tauri 2.x** framework
- **repo-manage-core** - Core business logic library
- **tokio** - Async runtime
- **git2** - Git operations (vendored to avoid OpenSSL deps)
- **reqwest** - HTTP client (with rustls)
- **lms-api** - Canvas/Moodle integration

### Architecture Patterns
- **Frontend-Backend Communication**: TypeScript bindings auto-generated from Rust using tauri-specta
- **Settings Management**: Multi-profile JSON configuration with atomic writes
- **State Management**: Zustand stores with validation and dirty-checking via snapshot hashing
- **Error Handling**: Custom error types with `thiserror` in Rust, proper propagation to UI

## Development Commands

### Package Manager
This project uses **pnpm** with workspace catalogs for dependency management.

### Desktop App Development
```bash
# Install dependencies
pnpm install

# Run Tauri dev server (hot reload)
cd apps/repo-manage
pnpm tauri dev

# Alternative: from root
pnpm dev:repo-manage
```

### Building
```bash
# Build Tauri desktop app
cd apps/repo-manage
pnpm tauri build

# Build frontend only
pnpm build
```

### Testing
```bash
# Frontend tests (Vitest)
cd apps/repo-manage
pnpm test              # Watch mode
pnpm test:run          # Run once

# Rust tests
cd apps/repo-manage
cargo test             # All tests in workspace
cargo test -p repo-manage-core  # Core library only
```

### TypeScript Bindings
TypeScript bindings are auto-generated from Rust Tauri commands:

```bash
# Regenerate bindings (creates src/bindings.ts)
cd apps/repo-manage
pnpm gen:bindings

# Or: cargo run -p repo-manage-tauri --bin export_bindings
```

**Important**: The pre-commit hook automatically regenerates bindings when relevant Rust files change (settings structs, Tauri commands). The generated `bindings.ts` file should be committed.

### Documentation
```bash
# Run VitePress dev server
pnpm docs:dev

# Build docs
pnpm docs:build

# Preview built docs
pnpm docs:preview
```

### CLI Tool
A CLI tool (`redu`) is available in `repo-manage-cli/`:

```bash
# Build CLI
cd apps/repo-manage
cargo build -p repo-manage-cli

# Run CLI
./target/debug/redu --help
```

## Key Code Patterns

### React State Management
The app uses multiple Zustand stores in `src/stores/`:
- `lmsFormStore` - LMS tab form state
- `repoFormStore` - Repository setup tab state
- `outputStore` - Console output messages
- `uiStore` - UI state (active tab, dialogs)

Stores expose typed methods to load/save state and sync with Rust backend settings.

### Settings Architecture
Settings are managed through a multi-layer system:
1. **Rust Core** (`repo-manage-core/src/settings/`) - Type definitions, validation, normalization
2. **Tauri Commands** (`src-tauri/src/lib.rs`) - Settings CRUD operations
3. **TypeScript Service** (`src/services/settingsService.ts`) - Frontend API
4. **Zustand Stores** - UI form state

Settings support multiple profiles stored in `~/.config/repo-manage/settings.json` (Linux/macOS) or equivalent Windows paths.

### Tauri Command Pattern
1. Define command in `src-tauri/src/lib.rs`
2. Register in `create_specta_builder()` function
3. Run `pnpm gen:bindings` to generate TypeScript types
4. Import and use in React components via `import { commands } from "@/bindings"`

### Frontend-Backend Data Flow
1. User interacts with React UI
2. Zustand store updates
3. Store calls TypeScript bindings (generated from Rust)
4. Tauri IPC layer invokes Rust command
5. Core library (`repo-manage-core`) performs operation
6. Result returned through IPC to TypeScript
7. Store updates, UI re-renders

### Dependency Catalog Pattern
Shared dependencies (React, TypeScript) are defined in `pnpm-workspace.yaml` under `catalog:`. Packages reference them with `"package": "catalog:"` in their `package.json`.

**To update a shared dependency:**
1. Edit version in `pnpm-workspace.yaml`
2. Run `pnpm install`

This prevents version conflicts, especially critical for React (which requires a single instance).

### Path Resolution
- Frontend uses Vite path aliases: `@/` → `src/`, `@repo-edu/ui` → `packages/ui/src/`
- React deduplication configured to prevent duplicate instances
- UI package exports components via `exports` field in `package.json`

### Testing Strategy
- **Frontend**: Vitest with `@testing-library/react` and jsdom
- **Rust**: Standard `cargo test` with integration tests
- Test files colocated with source: `*.test.ts`, `*.test.tsx`
- Setup file: `src/test/setup.ts`

## Important Notes

### TypeScript Bindings Sync
Always regenerate bindings after modifying:
- Settings structs in `repo-manage-core/src/settings/`
- Tauri command signatures in `src-tauri/src/lib.rs`
- Command registration in `create_specta_builder()`

### React Version Strictness
This project uses React 19. The catalog ensures all packages use the same version. Breaking this can cause "Invalid hook call" errors.

### Rust Vendored Dependencies
git2 and OpenSSL are vendored (`vendored-libgit2`, `vendored-openssl` features) to simplify builds across platforms without requiring system dependencies.

### Settings File Location
Settings are stored in platform-specific directories determined by the `directories` crate:
- **macOS**: `~/Library/Application Support/repobee-tauri/`
- **Windows**: `%APPDATA%\repobee-tauri\`
- **Linux**: `~/.config/repobee-tauri/`

Settings files:
- `app.json` - Application settings
- `{profile_name}.json` - Profile-specific settings

Location can be overridden via `REPOBEE_CONFIG_DIR` environment variable.

### Tauri Dev Port
Vite dev server runs on port **1420** (strictPort). HMR on 1421.

## Common Workflows

### Adding a New Tauri Command
1. Add function to `src-tauri/src/lib.rs`
2. Add to `collect_commands![]` macro in `create_specta_builder()`
3. Run `pnpm gen:bindings`
4. Import from `@/bindings` in frontend
5. Test both Rust and TypeScript sides

### Adding a Settings Field
1. Update struct in `repo-manage-core/src/settings/`
2. Update normalization logic if needed
3. Update validation logic if needed
4. Run `pnpm gen:bindings`
5. Update frontend form stores
6. Update UI components

### Modifying the UI Package
The `@repo-edu/ui` package is workspace-linked. Changes are immediately reflected in consuming apps without rebuild. Components use shadcn/ui patterns with Radix UI primitives.

### Working with LMS Integration
LMS client code is in `repo-manage-core/src/lms/`. It uses traits (`LmsClientTrait`) to abstract Canvas/Moodle differences. Progress reporting uses channels for real-time UI updates.

### Working with Git Platform Integration
Platform code is in `repo-manage-core/src/platform/`. Uses `PlatformAPI` trait for GitHub/GitLab/Gitea abstraction. Repository operations (create, clone) with progress tracking.

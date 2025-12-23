# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

This is the `repo-manage-core` crate — the shared Rust library used by both the CLI (
`repo-manage-cli`) and the Tauri desktop app (`src-tauri`).

## Testing This Crate

```bash
# From repo root or apps/repo-manage
pnpm test:rs -- -p repo-manage-core           # Run all core tests
pnpm test:rs -- -p repo-manage-core <name>    # Run specific test by name
```

## Architecture

### Module Overview

- **operations/** — High-level operations shared between CLI and GUI (verify, setup, clone, lms)
- **platform/** — Git platform abstraction (GitHub, GitLab, Gitea, Local)
- **settings/** — Configuration management with JSON Schema validation and profiles
- **lms/** — LMS client integration (wraps `lms-client` crate)
- **progress.rs** — Progress event types for status updates

### Platform Abstraction Pattern

The `platform/` module uses an enum + trait pattern (not trait objects):

```rust
pub enum Platform {
    GitHub(GitHubAPI),
    GitLab(GitLabAPI),
    Gitea(GiteaAPI),
    Local(LocalAPI),
}
```

Each variant implements `PlatformAPI` trait. The `Platform` enum delegates all trait methods to the
concrete type via match arms. Factory function `create_platform()` auto-detects platform type from
URL or uses explicit type.

### Operations Layer Pattern

Operations in `operations/` follow a consistent pattern:

1. Accept a `*Params` struct with all configuration
2. Accept a `progress: impl Fn(ProgressEvent) + Send` callback
3. Return `Result<T>` where T is operation-specific

Example signature:

```rust
pub async fn verify_platform(
    params: &VerifyParams,
    progress: impl Fn(ProgressEvent) + Send,
) -> Result<String>
```

### Settings Architecture

Settings use a split structure:

- **AppSettings** (`app.json`) — UI state (active tab, theme, window position)
- **ProfileSettings** (`profiles/<name>.json`) — Connection settings per profile
- **GuiSettings** — Combined struct for frontend consumption

Key traits:

- `Normalize` — Clean/normalize input values (trim whitespace, normalize URLs)
- `Validate` — Validate settings with detailed errors via `ValidationErrors`

Settings flow: Load → Merge with defaults → Normalize → Validate → Return

### Error Handling

Uses `thiserror` for error types:

- `PlatformError` — Git platform operation errors
- `ConfigError` — Settings/configuration errors
- `LmsError` — LMS operation errors (from `lms-common`)

All public functions return `Result<T>` using the crate's error types.

## Dependencies

This crate depends on shared LMS crates in `crates/`:

- `lms-common` — Common traits, types, error handling
- `lms-client` — Unified LMS client (selects Canvas/Moodle at runtime)

Type bindings flow: Changes here → run `pnpm gen:bindings` → updates `bindings.ts` in frontend.

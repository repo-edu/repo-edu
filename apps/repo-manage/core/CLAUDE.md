# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in thisrepository.

See the root `/CLAUDE.md` for workspace-wide commands and architecture overview.

This is the `repo-manage-core` crate — the shared Rust library used by both the CLI (`cli`)
and the Tauri desktop app (`src-tauri`).

## Testing This Crate

```bash
# From repo root or apps/repo-manage
pnpm test:rs -- -p repo-manage-core           # Run all core tests
pnpm test:rs -- -p repo-manage-core <name>    # Run specific test by name
```

## Architecture

### Module Overview

- **roster/** — Roster types, validation, export, group naming, system group sets, glob matching,
  group selection resolution
  - `types.rs` — Core roster and group types
  - `validation.rs` — Roster validation
  - `export.rs` — Export to YAML/CSV/XLSX
  - `naming.rs` — Group name generation (slugified `firstname_lastname` / `smith-jones-lee`)
  - `slug.rs` — Slug generation and repo naming
  - `system.rs` — System group set management (`ensure_system_group_sets`)
  - `glob.rs` — Glob pattern validation and matching
  - `resolution.rs` — Group selection resolution (all/pattern + exclusions)
  - `nanoid.rs` — ID generation
- **operations/** — High-level operations shared between CLI and GUI
  - `platform.rs` — Git platform verification
  - `lms.rs` — LMS operations (import students, sync group sets, fetch group set lists)
  - `repo.rs` — Repository create/clone/delete with preflight checks
  - `validation.rs` — Roster and assignment validation
  - `group_set.rs` — Group set CSV import/export/preview/reimport
- **platform/** — Git platform abstraction (GitHub, GitLab, Gitea, Local)
- **settings/** — Configuration management with JSON Schema validation and profiles
- **lms/** — LMS client integration (wraps `lms-client` crate)
- **import/** — Import adapters for roster data from LMS and files (CSV, Excel)
- **progress.rs** — Progress event types for status updates

### System Group Sets

The `roster/system.rs` module manages auto-maintained system group sets:

- **Individual Students** — One group per roster student (origin: system)
- **Staff** — Single group with all non-student members (origin: system)

`ensure_system_group_sets` is the single entrypoint that creates/repairs system sets and
normalizes group memberships (removes non-active students from all groups). It must be called:

- On app/profile load
- After any roster mutation (before persistence)
- Before any validation or group selection resolution

Returns a patch result (`SystemGroupSetEnsureResult`) that the frontend merges into state.

### Group Naming

`roster/naming.rs` generates normalized slug names:

- Individuals: `firstname_lastname` (underscore separator)
- Multi-member groups: `smith-jones-lee` (dash separator, last names only)
- Collision resolution: member ID suffix for individuals, incrementing `-2` for groups

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

## Test Utilities

The `test_utils` module (test-only) provides:

- **Fixture builders**: `StudentTeamBuilder`, `TeamBuilder`, `RepoBuilder`,
  `PlatformParamsBuilder`
- **Mock responses**: `gitlab_responses::*`, `github_responses::*`, `gitea_responses::*`
- **Git helpers**: `create_test_git_repo()`, `create_bare_repo()`
- **Assertions**: `assert_setup_success()`, `assert_setup_counts()`

Roster and group set tests can construct test fixtures with system group sets via
`ensure_system_group_sets` on the test roster.

## Dependencies

This crate depends on shared LMS crates in `crates/`:

- `lms-common` — Common traits, types, error handling
- `lms-client` — Unified LMS client (selects Canvas/Moodle at runtime)

Type bindings flow: Changes here → update schemas → run `pnpm gen:bindings` → updates bindings in
frontend.

# Crates

The repo-edu monorepo contains several Rust crates organized by purpose.

## Crate Overview

```text
repo-edu/
├── apps/repo-manage/
│   ├── src-tauri/          # Tauri app (binary)
│   ├── repo-manage-core/   # Core business logic
│   └── repo-manage-cli/    # CLI binary
└── crates/
    ├── lms-client/         # Unified LMS client
    ├── lms-common/         # Shared LMS types/traits
    ├── canvas-lms/         # Canvas API client
    └── moodle-lms/         # Moodle API client
```

## Application Crates

### repo-manage (src-tauri)

The Tauri desktop application binary.

- **Type**: Binary
- **Purpose**: Desktop GUI application
- **Dependencies**: repo-manage-core, tauri

### repo-manage-core

Core business logic shared between GUI and CLI.

- **Type**: Library
- **Purpose**: Platform APIs, settings, operations
- **Key modules**:
  - `platform/` — Git platform abstraction (GitHub, GitLab, Gitea)
  - `settings/` — Configuration management with JSON Schema
  - `operations/` — High-level operations (verify, setup, generate)
  - `lms/` — LMS data processing and file generation

### repo-manage-cli

Command-line interface binary.

- **Type**: Binary
- **Purpose**: CLI tool (`redu`)
- **Dependencies**: repo-manage-core, clap, tokio

## LMS Crates

### lms-client

Unified LMS client with runtime platform selection.

- **Type**: Library
- **Purpose**: Single interface for all LMS platforms
- **Features**: Runtime LMS selection, unified auth

```rust
use lms_client::{LmsClient, LmsAuth, LmsType};

let client = LmsClient::new(
    LmsType::Canvas,
    LmsAuth::Token {
        url: "https://canvas.example.com".into(),
        token: "your_token".into(),
    }
)?;
```

### lms-common

Shared types and traits for LMS implementations.

- **Type**: Library
- **Purpose**: Common interface definition
- **Exports**: `LmsClient` trait, `Course`, `User`, `Group`, `LmsError`

### canvas-lms

Canvas LMS API client.

- **Type**: Library
- **Purpose**: Canvas-specific implementation
- **API**: REST API with pagination support

### moodle-lms

Moodle LMS API client.

- **Type**: Library
- **Purpose**: Moodle-specific implementation
- **API**: Moodle Web Services API

## Dependency Graph

```text
repo-manage (bin)
└── repo-manage-core
    ├── lms-client
    │   ├── lms-common
    │   ├── canvas-lms
    │   │   └── lms-common
    │   └── moodle-lms
    │       └── lms-common
    └── git2

repo-manage-cli (bin)
└── repo-manage-core
    └── (same as above)
```

## API Documentation

Generate and view rustdoc documentation:

```bash
# Generate docs for all crates
cargo doc --workspace --no-deps

# Open in browser
cargo doc --workspace --no-deps --open
```

## Key Traits

### LmsClient (lms-common)

```rust
#[async_trait]
pub trait LmsClient: Send + Sync {
    async fn get_courses(&self) -> Result<Vec<Course>, LmsError>;
    async fn get_course(&self, course_id: &str) -> Result<Course, LmsError>;
    async fn get_users(&self, course_id: &str) -> Result<Vec<User>, LmsError>;
    async fn get_groups(&self, course_id: &str) -> Result<Vec<Group>, LmsError>;
    async fn get_group_members(&self, group_id: &str) -> Result<Vec<User>, LmsError>;
}
```

### Platform (repo-manage-core)

```rust
#[async_trait]
pub trait PlatformAPI: Send + Sync {
    async fn verify(&self) -> Result<()>;
    async fn get_repos(&self, org: &str) -> Result<Vec<Repo>>;
    async fn create_repo(&self, org: &str, name: &str, private: bool) -> Result<RepoCreateResult>;
    async fn repo_exists(&self, org: &str, name: &str) -> Result<bool>;
    // ...
}
```

## Adding a New LMS

1. Create a new crate in `crates/` (e.g., `brightspace-lms`)
2. Implement the `LmsClient` trait from `lms-common`
3. Add the crate to `lms-client` as a feature
4. Update `LmsType` enum and client creation

## Adding a New Git Platform

1. Add a new module in `repo-manage-core/src/platform/`
2. Implement the `PlatformAPI` trait
3. Update `PlatformType` enum
4. Add platform-specific settings to the schema

## Testing

```bash
# Run all tests
cargo test --workspace

# Run tests for a specific crate
cargo test -p lms-client

# Run with logging
RUST_LOG=debug cargo test --workspace
```

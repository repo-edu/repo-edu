# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

See the root `/CLAUDE.md` for workspace-wide commands and architecture overview.

## Overview

This directory contains shared Rust LMS (Learning Management System) client crates used by the
repo-edu desktop app and CLI. These crates provide a unified interface for interacting with Canvas
and Moodle APIs.

## Build & Test Commands

All commands should be run from the repository root using pnpm scripts:

```bash
pnpm test:rs                              # Run all Rust tests
pnpm test:rs -- -p lms-common             # Test specific crate
pnpm test:rs -- -p canvas-lms <test_name> # Run single test
```

## Crate Architecture

```text
crates/
├── lms-common/     # Foundation: traits, types, error handling, retry, token storage
├── canvas-lms/     # Canvas LMS API implementation
├── moodle-lms/     # Moodle LMS API implementation
└── lms-client/     # Unified client with runtime LMS selection
```

### Dependency Graph

```text
lms-client
    ├── canvas-lms ──┬── lms-common
    └── moodle-lms ──┘
```

### Key Patterns

**Trait-based abstraction**: `lms-common` defines the `LmsClient` trait that both `canvas-lms` and
`moodle-lms` implement. This allows generic code over any LMS. There's also an `OAuth` trait for
platforms supporting OAuth2 flows.

```rust
use lms_common::LmsClient;

async fn list_courses(client: &impl LmsClient) -> LmsResult<Vec<Course>> {
    client.get_courses().await
}
```

**Runtime dispatch**: `lms-client::LmsClient` wraps platform-specific clients and implements the
trait via delegation, enabling LMS selection at runtime without generics.

**Platform models → Common types**: Each platform crate has its own models (e.g., `CanvasCourse`,
`MoodleCourse`) that convert to common types (`Course`, `User`, `Group`) defined in `lms-common`.

## Adding a New Endpoint

1. Add the common type to `lms-common/src/types.rs` if needed
2. Extend the `LmsClient` trait in `lms-common/src/traits.rs`
3. Implement in both `canvas-lms/src/client.rs` and `moodle-lms/src/client.rs`
4. Add delegation in `lms-client/src/client.rs`

## Error Handling

All crates use `LmsError` from `lms-common::error` with `LmsResult<T>` alias. Errors use `thiserror`
and include variants for HTTP, API, auth, rate-limiting, and serialization errors.

## Rate Limiting

Use `lms_common::retry::with_retry()` for automatic exponential backoff on rate-limited requests.
Configurable via `RetryConfig` (default: 3 retries, 1-60s backoff).

## Token Storage

`lms_common::storage::TokenManager` provides two modes:

- `PlainFile` (default): `~/.config/lms-api/tokens.json` with 0600 permissions
- `Keychain` (requires `secure-storage` feature): OS keychain (macOS Keychain, Windows Credential
  Manager, Linux Secret Service)

## Feature Flags

- `lms-common`: `secure-storage` — enables keyring-based token storage (uses system keychain)

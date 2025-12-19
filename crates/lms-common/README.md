# lms-common

Common traits, types, and utilities for LMS API clients.

## Features

- Core `LmsClient` trait for unified LMS interface
- Shared types: `Course`, `Group`, `User`, `Assignment`
- Token storage (plain file or system keychain)
- LMS auto-detection from URLs
- Error types

## Usage

This crate is typically used as a dependency of `lms-client`, `canvas-lms`, or `moodle-lms`.

```rust
use lms_common::{LmsClient, Course, LmsError};

// Implement LmsClient for your LMS
```

## Token Storage

```rust
use lms_common::storage::TokenManager;

let manager = TokenManager::new();
manager.save_token("canvas", "https://canvas.edu", "token")?;
```

## License

MIT OR Apache-2.0

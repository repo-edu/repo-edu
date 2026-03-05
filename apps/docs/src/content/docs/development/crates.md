---
title: Legacy Crates Note
description: Why Rust crate docs were removed in the Electron rewrite
---

This repository is the TypeScript/Electron generation of repo-edu.

- There are no Rust crates in this workspace.
- There is no Tauri runtime in this workspace.
- Contract sharing is implemented through TypeScript packages, not generated Rust bindings.

See [Architecture](./architecture.md) for the current workspace layout.

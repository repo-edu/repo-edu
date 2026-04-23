# CLAUDE.md

Pure TypeScript type definitions for all runtime ports consumed by the application layer.

## Purpose

Defines the interfaces and request/result shapes for:

- `HttpPort` — HTTP requests
- `ProcessPort` — OS process execution with `ProcessCancellation` modes (`non-cancellable` | `best-effort` | `cooperative`)
- `GitCommandPort` — git CLI invocation
- `FileSystemPort` — inspect, batch operations (ensure-directory, copy-directory, delete-path), temp directories
- `UserFilePort` — user file read/write via `UserFileRef` / `UserSaveTargetRef`
- `LlmPort` — single-turn text generation backed by an LLM agent SDK

## Rules

- Zero implementation — types and one `packageId` constant only.
- Browser-safe: no Node/Electron imports permitted.
- Implementations live in `@repo-edu/host-node`.

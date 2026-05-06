# CLAUDE.md

Pure TypeScript type definitions for all runtime ports consumed by the application layer.

## Purpose

Defines the interfaces and request/result shapes for:

- `HttpPort` — HTTP requests
- `ProcessPort` — OS process execution with `ProcessCancellation` modes (`non-cancellable` | `best-effort` | `cooperative`)
- `GitCommandPort` — git CLI invocation
- `FileSystemPort` — inspect, batch operations (ensure-directory, copy-directory, delete-path), temp directories, list-directory
- `UserFilePort` — user file read/write via `UserFileRef` / `UserSaveTargetRef`
- `LlmPort` — provider-neutral prompt/reply over `LlmModelSpec` (provider/family/modelId/effort) with `LlmProvider`, `LlmEffort`, `LlmAuthMode`, `LlmUsage`. Wraps the `LlmTextClient` from `@repo-edu/integrations-llm-contract`; the host-side adapter routes by `spec.provider`.
- `ExaminationArchiveStoragePort` — JSON payload store keyed by structured `ExaminationArchiveKey`, with `ExaminationArchiveStoredEntry` and `ExaminationArchiveImportSummary` for re-import

## Rules

- Zero implementation — types and one `packageId` constant only.
- Browser-safe: no Node/Electron imports permitted.
- Implementations live in `@repo-edu/host-node`.

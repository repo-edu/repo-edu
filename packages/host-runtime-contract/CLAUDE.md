# CLAUDE.md

Pure TypeScript type definitions for all runtime ports consumed by the application layer.

## Purpose

Defines the interfaces and request/result shapes for:

- `HttpPort` — HTTP requests
- `ProcessPort` — OS process execution with `ProcessCancellation` modes (`non-cancellable` | `best-effort` | `cooperative`)
- `GitCommandPort` — git CLI invocation
- `FileSystemPort` — inspect/stat, batch operations (ensure-directory,
  copy-directory, delete-path), temp directories, directory/file listing and
  bounded reads inside a selected root
- `UserFilePort` — user file read/write via `UserFileRef` / `UserSaveTargetRef`
- `LlmPort` — provider-neutral run and stream operations over `LlmModelSpec`,
  invocation-scoped provider runtime configuration and `LlmUsage`. Stream
  events are text deltas, application activity or terminal usage.
- `TokenizerPort` — live parser-language loading for domain-owned tokenizer
  language IDs
- `ExaminationArchiveStoragePort` — opaque JSON payload get/put/remove,
  export and import keyed by application-owned `storageKey`

## Rules

- Zero implementation — types and one `packageId` constant only.
- Browser-safe: no Node/Electron imports permitted.
- Keep runtime configuration invocation-scoped. Do not introduce mutable host
  selection state into a port contract.
- Keep archive key and payload semantics in the application. This contract
  owns storage shapes only.
- Implementations live in `@repo-edu/host-node`.

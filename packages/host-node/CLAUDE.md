# CLAUDE.md

Node.js implementations of the runtime ports defined in `@repo-edu/host-runtime-contract`.

## Purpose

Concrete side-effect layer for desktop and CLI hosts. Each factory returns a plain object satisfying its port interface.

- `createNodeHttpPort()` — `globalThis.fetch`-based `HttpPort`
- `createNodeProcessPort()` — `child_process.spawn`-based `ProcessPort` with SIGTERM cancellation
- `createNodeGitCommandPort(processPort?)` — `GitCommandPort` wrapping `ProcessPort`, calls system `git`
- `createNodeFileSystemPort()` — `FileSystemPort` using `node:fs/promises` (inspect, batch operations, temp directories, list-directory)
- `createNodeLlmPort(config?)` — `LlmPort` that delegates to the `createLlmTextClient` dispatcher in `@repo-edu/integrations-llm`; routes per call by `spec.provider` to either the Claude or Codex adapter, with auth/env resolved through their respective SDKs
- `createExaminationArchiveStorage(...)` and `openExaminationArchiveDatabase(...)` (`src/examination-archive/`): SQLite-backed `ExaminationArchiveStoragePort`. Helpers in `src/sqlite/transaction.ts` wrap statements in transactions.
- File-write helpers `createWriteQueue()`, `writeTextFileAtomic(...)`, and `cleanupAtomicTempFiles(...)` for atomic JSON/text persistence used by desktop stores.

## Rules

- Node-only package — never import from browser-safe packages (`renderer-app`, `docs`).
- Side effects belong here, not in domain or application.
- `createNodeGitCommandPort` accepts an optional `processPort` for testability.
- Provider-specific LLM concerns live in `@repo-edu/integrations-llm`; this package only adapts that dispatcher onto `LlmPort`.

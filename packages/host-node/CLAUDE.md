# CLAUDE.md

Node.js implementations of the runtime ports defined in `@repo-edu/host-runtime-contract`.

## Purpose

Concrete side-effect layer for desktop and CLI hosts. Each factory returns a plain object satisfying its port interface.

- `createNodeHttpPort()` — `globalThis.fetch`-based `HttpPort`
- `createNodeProcessPort()` — `child_process.spawn`-based `ProcessPort` with SIGTERM cancellation
- `createNodeGitCommandPort(processPort?)` — `GitCommandPort` wrapping `ProcessPort`, calls system `git`
- `createNodeFileSystemPort()` — `FileSystemPort` using `node:fs/promises`
  (inspect/stat, batch operations, temp directories, directory/file listing and
  contained reads)
- `createNodeLlmPort(config?)` — `LlmPort` that delegates to the `createLlmTextClient` dispatcher in `@repo-edu/integrations-llm`; routes per call by `spec.provider` to either the Claude or Codex adapter, with auth/env resolved through their respective SDKs
- `createNodeTokenizerPort()` — live `web-tree-sitter` parser loading over the
  committed grammar-asset manifest
- `createChildProcessLifetimeAdapter()` from the `child-process-lifetime`
  subpath — one launch registry and stop-and-confirm boundary. macOS and Linux
  targets start in their own process groups. Windows composition supplies the
  platform returned by `createWindowsChildProcessLifetimePlatform(...)`.
- `resolveRepoEduAppDataRoot(...)` — shared desktop/CLI app-data root resolver.
  Desktop passes Electron's platform app-data base; CLI uses the same resolver
  directly. `REPO_EDU_STORAGE_ROOT` is accepted only as an absolute override.
- `claimExclusive(...)` from the narrow `exclusive-claim` subpath — generic
  zero-wait SQLite admission. The caller supplies the database path and owns
  the held claim's lifetime.
- `claimProgramGate(...)` — one shared desktop/CLI `BEGIN EXCLUSIVE` claim in
  `program-gate.db`. It delegates to the generic claim without changing the
  product path or meaning.
- `windows-child-lifetime.ts` — public packaged-Windows entry. Its platform,
  proof and launcher-protocol modules keep host lifetime, artifact evidence and
  wire grammar separate. `windows-job.ts` owns the Koffi job calls.
- `createExaminationArchiveStorage(...)` and `openExaminationArchiveDatabase(...)` (`src/examination-archive/`): SQLite-backed `ExaminationArchiveStoragePort`. Helpers in `src/sqlite/transaction.ts` wrap statements in transactions.
- File-write helpers `createWriteQueue()`, `writeTextFileAtomic(...)`, and `cleanupAtomicTempFiles(...)` for atomic JSON/text persistence used by desktop and CLI stores.
- Settings section-store helpers validate strict JSON sections, write atomically, and back invalid, unparseable or unsupported composite settings files aside for recovery-aware loads.

## Rules

- Node-only package — never import it into the renderer runtime or browser-safe contracts.
- Side effects belong here, not in domain or application.
- Reads inside a selected root must resolve both paths and enforce real-path containment before reading bytes.
- `createNodeGitCommandPort` accepts an optional `processPort` for testability.
- Provider-specific LLM concerns live in `@repo-edu/integrations-llm`; this package only adapts that dispatcher onto `LlmPort`.
- Exclusive-claim contention returns `busy`. Every other SQLite or filesystem
  failure propagates. A held claim is idempotently released by closing its
  connection. The claim uses `node:sqlite` under Node and `bun:sqlite` in a
  compiled Bun CLI.
- The Windows child-lifetime route is not the generic `ProcessPort`. It must
  save the launcher process identity in the same synchronous turn as spawn,
  assign it to the job before sending the target command, use the fixed helper
  entry and remove `ELECTRON_RUN_AS_NODE` from the target environment. A lost
  launcher after target admission reports an unknown outcome only after its
  job is confirmed empty.
- The shared child-process lifetime adapter owns its five-second graceful stop
  allowance. Callers may request group cancellation, but cannot change that
  duration or report a direct target result before its descendants are gone.

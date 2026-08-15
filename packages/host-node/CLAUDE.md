# CLAUDE.md

Node.js implementations of the runtime ports defined in `@repo-edu/host-runtime-contract`.

## Purpose

Concrete side-effect layer for desktop and CLI hosts. Each factory returns a plain object satisfying its port interface.

- `createNodeHttpPort()` — `globalThis.fetch`-based `HttpPort`
- `createNodeProcessPort(childProcessLifetime)` — `ProcessPort` over one shared
  child-lifetime adapter; it captures streams while the adapter owns the full
  process tree
- `createNodeGitCommandPort(processPort)` — `GitCommandPort` wrapping the
  adapter-backed production port or an injected test port; it calls system
  `git`
- `createNodeFileSystemPort()` — `FileSystemPort` using `node:fs/promises`
  (inspect/stat, batch operations, temp directories, directory/file listing and
  contained reads)
- `createNodeLlmPort(childProcessLifetime, config?)` — `LlmPort` that delegates
  to the `createLlmTextClient` dispatcher in `@repo-edu/integrations-llm` and
  gives subscription Claude the shared direct-launch route
- `createNodeLlmTextClient(childProcessLifetime, config?, options?)` — the
  host-owned prompt/reply composition used by desktop draft checks and fixture
  tools. A configured Codex helper starts through the adapter's managed route.
- `createNodeTokenizerPort()` — live `web-tree-sitter` parser loading over the
  committed grammar-asset manifest
- `createChildProcessLifetimeAdapter()` from the `child-process-lifetime`
  subpath — one launch registry and stop-and-confirm boundary. macOS and Linux
  targets start in their own process groups. Windows composition supplies the
  platform returned by `createWindowsChildProcessLifetimePlatform(...)`.
- `child-process-lifetime-artifact-probe.ts` — shared direct-route proof used
  unchanged by Electron, Node command-line development and compiled Bun.
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
- `resources/host-child-lifetime/windows-launcher.cjs` — fixed launcher source
  shared by Node command-line development and desktop packaging.
- `createExaminationArchiveStorage(...)` and `openExaminationArchiveDatabase(...)` (`src/examination-archive/`): SQLite-backed `ExaminationArchiveStoragePort`. Helpers in `src/sqlite/transaction.ts` wrap statements in transactions.
- File-write helpers `createWriteQueue()`, `writeTextFileAtomic(...)`, and `cleanupAtomicTempFiles(...)` for atomic JSON/text persistence used by desktop and CLI stores.
- Settings section-store helpers validate strict JSON sections, write atomically, and back invalid, unparseable or unsupported composite settings files aside for recovery-aware loads.

## Rules

- Node-only package — never import it into the renderer runtime or browser-safe contracts.
- Side effects belong here, not in domain or application.
- Reads inside a selected root must resolve both paths and enforce real-path containment before reading bytes.
- Production Git and subscription Claude composition receives the same shared
  child-lifetime adapter from its host. Tests may give the Git wrapper a
  `ProcessPort` instead.
- Provider-specific LLM concerns live in `@repo-edu/integrations-llm`; this package only adapts that dispatcher onto `LlmPort`.
- Electron Codex composition supplies one fixed helper command with
  `runAsNode: true`. The host copies the complete environment, adds
  `ELECTRON_RUN_AS_NODE` only for that helper start and never passes the caller
  abort signal directly to the process-tree adapter. The helper protocol owns
  the cooperative stop request first.
- Exclusive-claim contention returns `busy`. Every other SQLite or filesystem
  failure propagates. A held claim is idempotently released by closing its
  connection. The claim uses `node:sqlite` under Node and `bun:sqlite` in a
  compiled Bun CLI.
- The Windows child-lifetime route is not the generic `ProcessPort`. It must
  save the launcher process identity in the same synchronous turn as spawn,
  assign it to the job before sending the target command, use the fixed helper
  entry and pass the host-supplied target environment unchanged. Its runtime
  declares whether the launcher executable is Electron in Node mode or plain
  Node. The Codex helper removes `ELECTRON_RUN_AS_NODE` before the SDK starts
  Codex or tools. A lost launcher after target admission reports an unknown
  outcome only after its job is confirmed empty.
- A launch environment is the complete target environment on every platform
  route, never changes laid over `process.env`. A caller that removed a
  variable must not get it back from the host. Only an absent environment
  falls back to the host's own.
- The shared child-process lifetime adapter owns its five-second graceful stop
  allowance. Callers may request group cancellation, but cannot change that
  duration or report a direct target result before its descendants are gone.
  Shutdown requests a stop from platform startup before it waits for the
  launch to enter the active-tree registry.
  A caller-side stream or protocol failure must await the tree's
  `stopAndConfirm` result before it reports the failure.

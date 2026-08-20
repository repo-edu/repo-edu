# CLAUDE.md

@../../glossaries/child-process-lifetime.md

Node.js implementations of the runtime ports defined in `@repo-edu/host-runtime-contract`.

## Purpose

Concrete side-effect layer for desktop and CLI hosts. Each factory returns a plain object satisfying its port interface.

- `createNodeHttpPort()` — `globalThis.fetch`-based `HttpPort`
- `createNodeProcessPort(childProcessLifetimeController)` — `ProcessPort` over
  one shared controller; it captures streams while the controller owns the
  full process tree
- `createNodeGitCommandPort(processPort)` — `GitCommandPort` wrapping the
  controller-backed production port or an injected test port; it calls system
  `git`
- `createNodeFileSystemPort()` — `FileSystemPort` using `node:fs/promises`
  (inspect/stat, batch operations, temp directories, directory/file listing and
  contained reads)
- `createNodeLlmPort(childProcessLifetimeController, config?)` — `LlmPort` that
  delegates to the `createLlmTextClient` dispatcher in
  `@repo-edu/integrations-llm` and gives subscription Claude the shared
  controller
- `createNodeLlmTextClient(childProcessLifetimeController, config?, options?)`
  — the host-owned prompt/reply composition used by desktop draft checks and
  fixture tools. A configured Codex SDK host process starts through the same
  controller.
- `createNodeTokenizerPort()` — live `web-tree-sitter` parser loading over the
  committed grammar-asset manifest
- `createChildProcessLifetimeController()` from the `child-process-lifetime`
  subpath — one launch registry, completion rule and stop-and-confirm boundary.
  macOS and Linux targets start in their own process groups. Windows
  composition supplies the adapter returned by
  `createWindowsChildProcessLifetimeAdapter(...)`.
- `child-process-lifetime-artifact-probe.ts` — shared controller proof used
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
- `windows-child-lifetime.ts` — public packaged-Windows entry. Its adapter,
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
  child-process lifetime controller from its host. Tests may give the Git
  wrapper a `ProcessPort` instead. Direct commands use target exit as their
  result proof. Protocol callers report a matching result or a lost proving
  connection. A reported-proof process needs no separate work-start fact.
- Provider-specific LLM concerns live in `@repo-edu/integrations-llm`; this package only adapts that dispatcher onto `LlmPort`.
- Electron Codex composition supplies one fixed Codex SDK host command with
  `runAsNode: true`. The host copies the complete environment, adds
  `ELECTRON_RUN_AS_NODE` only for that SDK host start and never passes the
  caller abort signal directly to the owned-tree launch. The SDK host protocol
  owns the cooperative stop request first.
- Exclusive-claim contention returns `busy`. Every other SQLite or filesystem
  failure propagates. A held claim is idempotently released by closing its
  connection. The claim uses `node:sqlite` under Node and `bun:sqlite` in a
  compiled Bun CLI.
- The Windows child-process lifetime adapter is not the generic `ProcessPort`.
  It must
  save the launcher process identity in the same synchronous turn as spawn,
  assign it to the job before sending the target command, use the fixed launcher
  entry and pass the host-supplied target environment unchanged. Its runtime
  declares whether the launcher executable is Electron in Node mode or plain
  Node. The Codex SDK host process removes `ELECTRON_RUN_AS_NODE` before the SDK
  starts Codex or tools. The controller owns the launch attempt before the
  target command may be accepted. An unexpected lost launcher after possible
  command acceptance reports proof loss, and the controller returns unknown
  after the matching stop attempt. The same rule applies when forced stop loses
  the launcher result. An explicit launcher rejection stays a known launch
  failure. After the target's exit report, stream and launcher completion proof
  settle inside stop-and-confirm. An empty job with lost completion proof
  returns unknown without an unconfirmed-tree warning. The launcher turns a
  target-input relay failure into a broken host-side pipe and keeps reporting
  the target's exit.
- A launch environment is the complete target environment for every platform
  adapter, never changes laid over `process.env`. A caller that removed a
  variable must not get it back from the host. Only an absent environment
  falls back to the host's own.
- The shared child-process lifetime controller owns the run outcome. Proof loss
  returns unknown, an intact cancellation returns cancelled and an intact
  result returns failed or completed after the whole tree is confirmed gone.
  Confirmation expiry takes the unknown branch without that confirmation.
  Callers report facts and never rank failures, attach secondary failures as
  causes or compose another outcome.
- The controller owns one five-second graceful stop allowance and one
  five-second confirmation deadline after a forced stop. Both platform
  adapters apply those periods. Confirmation expiry returns unknown for an
  active run, sends one diagnostic and one warning, releases its caller-facing
  streams, and leaves the session running. An expiry before command acceptance
  is possible warns and rejects the launch with the confirmation error.
  Shutdown warns and lets the host exit without confirmation. Shutdown requests
  a stop from platform startup before it waits for the launch to enter the
  active-tree registry. Windows keeps an unconfirmed tree's kill-on-close job
  handle open until process exit. Each platform adapter destroys every local
  child stream and unreferences its Node child watcher before it reports an
  unconfirmed stop.
- Every host supplies an error diagnostic sink and an unconfirmed-tree warning
  channel. The controller sends secondary failures to the diagnostic sink when
  reported and each unconfirmed-tree warning once to the warning channel.

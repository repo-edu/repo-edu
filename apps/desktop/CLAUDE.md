# CLAUDE.md

This is the Electron desktop shell (`@repo-edu/desktop`).

Non-obvious targets: `pnpm --filter @repo-edu/desktop run dev`,
`pnpm --filter @repo-edu/desktop run validate:runtime`

## Structure

- `src/main.ts`: fatal entry with no static product imports. Registers synchronous
  fatal logging and immediate process exit before awaiting product loading.
- `src/desktop-application.ts`: product composition with one synchronous installer.
  Installs command-line switches, takes the single-instance lock and registers
  lifecycle listeners before returning control to Electron. Asynchronous startup
  claims the program gate before opening stores and waits for Electron readiness.
  Only the process-exit listener receives the held gate claim’s release operation.
  It gives Git and subscription Claude one shared child-process lifetime
  controller. The controller owns each outside-program outcome. It withholds
  every outcome except confirmation-expiry unknown until the full tree is
  confirmed gone. On Windows the main process supplies the packaged or
  development launcher entry.
- `src/trpc.ts`: main-side tRPC router for the startup and ordinary workflow ids only. Its
  `createDesktopWorkflowRegistry` wires every workflow family — analysis
  (`createAnalysisWorkflowHandlers` with `GitCommandPort`, no in-process cache), examination
  generate + archive (over `ExaminationArchiveStoragePort` from `host-node`), connection verifiers
  (incl. `connection.verifyLlmDraft` over `LlmPort`), course persistence, repository, group-set,
  git-username import, roster, validation, settings, and user-file workflows.
- `src/desktop-entry-gateway.ts`: sole renderer IPC registration and document
  authority owner. Validates the sender, envelope and workflow input before dispatch.
- `src/host-admission*.ts`: one reducer for startup, accepted calls, command
  preparation and execution, settlement, close and terminal failure.
- `src/workflow-client.ts`, `src/desktop-trpc-link.ts` and
  `src/desktop-trpc-adapter.ts`: ordinary workflow subscriptions over public
  tRPC APIs. The adapter receives only gateway-validated messages.
- `src/preload.ts`: context-isolated bridge to renderer host capabilities
- `src/renderer-host-bridge.ts`: typed IPC channel definitions for host UI affordances
- `src/host-request-transport.ts`, `src/preload-request-transport.ts` and
  `src/request-port-*.ts`: retained, stage-validated ports for exclusive
  commands and clean close. Each command transfers a port with intent; main
  transfers a close port after accepted ordinary calls drain.
- `src/host-command-execution.ts` and `src/host-command-settlement.ts`: official
  outcomes, durable course transitions and bounded authoritative settlement.
- `src/desktop-terminal.ts`: the reducer's asynchronous ending body.
  `src/desktop-terminal-sources.ts` maps detected failures to its terminal event.
- `src/child-lifetime-artifact-probe.ts`: packaged and development Electron
  proof for the shared controller and Codex SDK host process. Packaged Windows
  also proves the fixed `runAsNode` launcher and kill-on-close Windows job.
- `src/windows-child-lifetime-runtime.ts`: desktop-owned launcher layouts for
  the copied development asset and the packaged Windows resource.
- `src/codex-sdk-host-command.ts`: fixed Codex SDK host command. Electron runs
  the bundled `codex-sdk-host.js` entry in Node mode through the shared
  child-process lifetime controller.
- `src/desktop-host.ts`: file and directory dialogs with opaque file handles.
- `src/desktop-bootstrap.ts`: loads the shared `host-node` course database,
  settings and examination archive before creating the renderer session.
  `src/settings-store.ts` wraps the shared settings owner for desktop recovery.
- `src/window-state-store.ts`: desktop-only BrowserWindow geometry persistence. Window dimensions
  are shell state and are not part of app preferences. The shared adapter is
  best-effort; exit never waits for its final write.
- `src/fixture-seed.ts`: optional first-run/dev fixture seeding into the desktop data directory
- `src/auto-updater.ts` + `src/UpdateDialog.tsx`: Electron auto-update flow with renderer-side
  dialog
- `packages/host-node/resources/host-child-lifetime/windows-launcher.cjs`:
  shared launcher source copied beside the development main bundle and into
  the packaged Windows resources
- `scripts/validate-program-gate-artifact.mjs` and
  `scripts/validate-child-lifetime-artifact.mjs`: shipped host-contract proofs.
  The gate validator also runs one shared course-database transaction and one
  atomic settings replacement through the packaged desktop entry.

## Notes

- `workflowInputSchemas` in `application-contract` validates every workflow
  input. Desktop wire schemas compose those browser-safe schemas. Keep workflow
  starts, direct actions, request messages, lifecycle sources, native menus and
  updater messages in their separately checked entry inventories.
- Only startup and ordinary ids (`OrdinaryWorkflowId`) have a tRPC wire path,
  router procedure and renderer client entry. An exclusive command on the tRPC
  wire is a malformed envelope. The current request port alone carries
  cancellation.
- The gateway ends the process on any wire schema failure. Renderer document
  owners therefore admit only values the reused domain schemas accept; the
  analysis inputs are the model, refusing a bad date or subfolder at the edit.
- Preload output is CommonJS (`preload.cjs`) due Electron sandbox/runtime constraints.
- Keep Electron-specific code inside `apps/desktop`; shared packages stay platform-agnostic.
- Claim the shared program gate before opening stores or starting product work.
  Retain its release callback through process exit.
- Courses use the shared `courses.sqlite` database. Only the desktop publishes
  credentials and preferences JSON, through `write-file-atomic` with sync enabled.
- Install fatal handling before dynamically importing product composition.
  Uncaught exceptions, rejected product loading and a thrown installer use only
  synchronous logging and immediate exit. Unhandled rejections, document or
  port loss and durable-owner failures dispatch the reducer's terminal event.
  Renderer loss is terminal; other Electron child loss is terminal for every
  reason except `clean-exit`, regardless of child type.
- When an owned tree cannot be confirmed gone, show one warning dialog and
  return unknown for its active run. Keep the desktop session running. During
  shutdown, show the same warning and continue quitting.
- Close is terminal. Interactive close drains accepted calls and prepares
  persistence through its port. Close during startup or a command skips that
  renderer drain. Both ask the shared controller to end owned work exactly once.
  Confirmation expiry shows one fatal warning and exits without updater handoff.
- The session operation owner freezes semantic edits and worker starts when a
  command is reserved. Preparation commits eligible saves before immutable
  input capture. Settlement applies before acknowledgement, host release and
  renderer retirement. Course-changing commands use the application's one
  complete course transition, never independent partial merges.
- Last-window close exits on every platform. Activation may focus the existing
  window but cannot create another renderer. A later launch starts a new process.
- Keep native Edit, Window, zoom, full-screen and safe macOS Services/Hide roles.
  Close, quit and update restart dispatch to the reducer. The main process binds
  the fixed Help destination. Production menus expose no reload or developer tools.
- The durable-storage peer owns database and settings publication. The
  child-process lifetime peer owns application-effect trees and platform
  containment. The command-completion peer owns both five-second ending limits.
  Electron children and updater installation are outside those owned trees.
- `validate:runtime` must package first. Its prebuilt phase proves tRPC, the
  program gate, the shipped child-process lifetime matrix and the shell boundary
  against that packaged output.
- Windows packaging must keep the `runAsNode` fuse enabled, unpack Koffi native
  files and ship the fixed launcher as an extra resource. Development builds
  copy the same launcher beside the main bundle; the packaged archive excludes
  that development copy.
- The main bundle and Codex SDK host process are separate fixed entries. The
  main process owns request admission. The shared child-process lifetime
  controller owns outcome truth. The SDK host process owns one SDK turn and
  never receives saved desktop state or retry policy.

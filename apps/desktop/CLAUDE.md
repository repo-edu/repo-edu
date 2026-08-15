# CLAUDE.md

This is the Electron desktop shell (`@repo-edu/desktop`).

Non-obvious targets: `pnpm --filter @repo-edu/desktop run dev`, `pnpm --filter @repo-edu/desktop run validate:runtime`

## Structure

- `src/main.ts`: Electron main process bootstrap and composition root. Installs
  terminal process handlers, resolves the shared app-data root, claims the
  program gate and only then starts the Electron application and its stores.
  It gives Git and subscription Claude one shared child-lifetime adapter. On
  Windows it supplies the packaged or development launcher entry.
- `src/trpc.ts`: exhaustive main-side tRPC workflow router. Wires every workflow family — analysis (`createAnalysisWorkflowHandlers` with `GitCommandPort`, no in-process cache), examination generate + archive (over `ExaminationArchiveStoragePort` from `host-node`), connection verifiers (incl. `connection.verifyLlmDraft` over `LlmPort`), course persistence, repository, group-set, git-username import, roster, validation, settings, and user-file workflows.
- `src/workflow-client.ts`: renderer-side `WorkflowClient` backed by `trpc-electron`
- `src/preload.ts`: context-isolated bridge to renderer host capabilities
- `src/renderer-host-bridge.ts`: typed IPC channel definitions for host UI affordances
- `src/renderer-close.ts`: owner-tagged window-close admission. Normal windows
  use attempt-identified renderer close and cancellation. Main-process
  validation windows bypass the renderer session.
- `src/child-lifetime-artifact-probe.ts`: packaged and development Electron
  proof for the shared adapter and managed Codex helper. Packaged Windows also
  proves the fixed `runAsNode` launcher and kill-on-close job route.
- `src/codex-helper-command.ts`: fixed managed-helper command. Electron runs
  the bundled `codex-helper.js` entry in Node mode through the shared
  child-lifetime adapter.
- `src/desktop-host.ts`: shell-level host interactions (dialogs, external URLs)
- `src/course-store.ts`, `src/settings-store.ts`: desktop persistence stores (course JSON plus `settings/credentials.json` and `settings/preferences.json`)
- `src/window-state-store.ts`: desktop-only BrowserWindow geometry persistence. Window dimensions are shell state and are not part of app preferences.
- `src/fixture-seed.ts`: optional first-run/dev fixture seeding into the desktop data directory
- `src/auto-updater.ts` + `src/UpdateDialog.tsx`: Electron auto-update flow with renderer-side dialog
- `packages/host-node/resources/host-child-lifetime/windows-launcher.cjs`:
  shared launcher source copied into the packaged Windows resources
- `scripts/validate-program-gate-artifact.mjs` and
  `scripts/validate-child-lifetime-artifact.mjs`: shipped host-contract proofs

## Notes

- Desktop transport uses `trpc-electron` (not `electron-trpc`).
- Preload output is CommonJS (`preload.cjs`) due Electron sandbox/runtime constraints.
- Keep Electron-specific code inside `apps/desktop`; shared packages stay platform-agnostic.
- Claim the shared program gate before opening stores or starting product work.
  Retain its release callback through process exit.
- Uncaught exceptions, unhandled rejections and rejected startup or activation
  work are terminal. Report them to stderr and exit the application with code 1.
- Disable `BrowserWindow` input before requesting a renderer close. Re-enable it
  only after a matching failure or cancellation acknowledgement. If renderer
  cancellation itself cannot settle, the main process owns terminal close.
- `validate:runtime` must package first. Its prebuilt phase proves tRPC, the
  program gate, the shipped child-lifetime matrix and the shell boundary
  against that packaged output.
- Windows packaging must keep the `runAsNode` fuse enabled, unpack Koffi native
  files and ship the fixed launcher as an extra resource.
- The main bundle and Codex helper are separate fixed entries. The main process
  owns request admission and outcome truth. The helper owns one SDK turn and
  never receives saved desktop state or retry policy.

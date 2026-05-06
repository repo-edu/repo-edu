# CLAUDE.md

This is the Electron desktop shell (`@repo-edu/desktop`).

Non-obvious targets: `pnpm --filter @repo-edu/desktop run dev`, `pnpm --filter @repo-edu/desktop run validate:runtime`

## Structure

- `src/main.ts`: Electron main process bootstrap and composition root
- `src/trpc.ts`: exhaustive main-side tRPC workflow router. Wires every workflow family — analysis (`createAnalysisWorkflowHandlers` with `GitCommandPort`, no in-process cache), examination generate + archive (over `ExaminationArchiveStoragePort` from `host-node`), connection verifiers (incl. `connection.verifyLlmDraft` over `LlmPort`), documents/analyses/course persistence, repository, group-set, roster, validation, settings, and user-file workflows.
- `src/workflow-client.ts`: renderer-side `WorkflowClient` backed by `trpc-electron`
- `src/preload.ts`: context-isolated bridge to renderer host capabilities
- `src/renderer-host-bridge.ts`: typed IPC channel definitions for host UI affordances
- `src/desktop-host.ts`: shell-level host interactions (dialogs, external URLs)
- `src/course-store.ts`, `src/settings-store.ts`, `src/analysis-store.ts`: desktop persistence stores (course JSON, app settings, standalone analysis documents)
- `src/fixture-seed.ts`: optional first-run/dev fixture seeding into the desktop data directory
- `src/auto-updater.ts` + `src/UpdateDialog.tsx`: Electron auto-update flow with renderer-side dialog

## Notes

- Desktop transport uses `trpc-electron` (not `electron-trpc`).
- Preload output is CommonJS (`preload.cjs`) due Electron sandbox/runtime constraints.
- Keep Electron-specific code inside `apps/desktop`; shared packages stay platform-agnostic.

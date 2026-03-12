# CLAUDE.md

This is the Electron desktop shell (`@repo-edu/desktop`).

Non-obvious targets: `pnpm --filter @repo-edu/desktop run dev`, `pnpm --filter @repo-edu/desktop run validate:runtime`

## Structure

- `src/main.ts`: Electron main process bootstrap and composition root
- `src/trpc.ts`: exhaustive main-side tRPC workflow router
- `src/workflow-client.ts`: renderer-side `WorkflowClient` backed by `trpc-electron`
- `src/preload.ts`: context-isolated bridge to renderer host capabilities
- `src/renderer-host-bridge.ts`: typed IPC channel definitions for host UI affordances
- `src/desktop-host.ts`: shell-level host interactions (dialogs, external URLs)
- `src/course-store.ts`, `src/settings-store.ts`: desktop persistence stores

## Notes

- Desktop transport uses `trpc-electron` (not `electron-trpc`).
- Preload output is CommonJS (`preload.cjs`) due Electron sandbox/runtime constraints.
- Keep Electron-specific code inside `apps/desktop`; shared packages stay platform-agnostic.

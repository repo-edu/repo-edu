# CLAUDE.md

Pure TypeScript types defining the `RendererHost` interface — the renderer-safe bridge for host
capabilities.

## Purpose

Declares the contract for UI-facing host operations:

- `pickUserFile` / `pickSaveTarget` — file open/save dialogs
- `pickDirectory` — directory picker
- `setNativeTheme` — synchronise Electron's native window theme
- `onCloseRequest` — register persistence preparation for a host-owned clean close

Close preparation receives a typed commit operation. Electron retains and
validates the close port; no transport identity enters the session contract.
Accepted close never returns to interactive admission. Fixed documentation
destinations belong to the main-process menu.

## Rules

- Browser-safe: consumed by the sandboxed `@repo-edu/renderer-app`.
- Zero implementation — types only.
- Distinct from `@repo-edu/host-runtime-contract`: this is the renderer↔host bridge for UI
  interactions; the runtime contract is the application↔host bridge for process/fs/http.
- Electron implementation lives in `apps/desktop`.

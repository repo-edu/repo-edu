# CLAUDE.md

Pure TypeScript types defining the `RendererHost` interface — the renderer-safe bridge for host
capabilities.

## Purpose

Declares the contract for UI-facing host operations:

- `pickUserFile` / `pickSaveTarget` — file open/save dialogs
- `pickDirectory` — directory picker
- `openExternalUrl` — launch URLs in system browser
- `setNativeTheme` — synchronise Electron's native window theme
- `revealCoursesDirectory` — reveal the persisted course documents
- `onCloseRequest` / `onCloseCancel` — register the host-owned close sequence

## Rules

- Browser-safe: consumed by the sandboxed `@repo-edu/renderer-app`.
- Zero implementation — types only.
- Distinct from `@repo-edu/host-runtime-contract`: this is the renderer↔host bridge for UI
  interactions; the runtime contract is the application↔host bridge for process/fs/http.
- Electron implementation lives in `apps/desktop`.

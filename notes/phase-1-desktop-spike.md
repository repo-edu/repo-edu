# Phase 1.3 Desktop Spike

Date: 2026-03-04

This note records the initial Electron shell spike required by phase 1.3 of the
migration plan.

## Implemented Shell

- `apps/desktop` now uses `electron-vite` with:
  - `src/main.ts` for the Electron main process
  - `src/preload.ts` for the preload bridge
  - `src/renderer.ts` plus `index.html` for the renderer entry
- The renderer consumes `@repo-edu/app`, proving a real shared workspace import
  path inside the desktop shell.
- `apps/desktop/scripts/measure-cold-start.mjs` launches the built app in a
  hidden measurement mode, waits for the first renderer `did-finish-load`, logs
  the timing marker, and exits automatically.

## Package Size Measurements

- Built desktop bundle output (`apps/desktop/out`): `16 KiB`
- Unpacked Electron runtime (`node_modules/.pnpm/electron@35.7.5/node_modules/electron/dist`):
  `780,501,634 bytes` (about `744.3 MiB`)

Interpretation: the app bundle itself is tiny at this stage; the Electron
runtime dominates the local footprint, which is exactly the packaging overhead
the phase-1 spike was meant to make visible early.

## Cold-Start Measurement

Measurement command:

```bash
node apps/desktop/scripts/measure-cold-start.mjs
```

Final captured result:

```json
{
  "marker": "repo-edu-desktop-cold-start",
  "didFinishLoadMs": 221.55,
  "processWallMs": 1615.18
}
```

- `didFinishLoadMs`: time from process bootstrap to the first renderer load
  completion in the hidden measurement window
- `processWallMs`: full process runtime for the measurement pass, including
  startup and the scripted auto-exit delay

## Validation Commands

The shell and workspace state were validated with:

- `pnpm --filter @repo-edu/desktop build`
- `pnpm --filter @repo-edu/desktop typecheck`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

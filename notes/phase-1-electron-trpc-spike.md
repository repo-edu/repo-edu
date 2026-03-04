# Phase 1.3 electron-trpc Spike

Date: 2026-03-04

This note records the typed IPC validation spike required by phase 1.3 of the
migration plan.

## Implemented Path

### Initial Subscription Spike

- `apps/desktop/src/trpc.ts` defines a minimal tRPC router with one
  `phaseOneProgress` subscription that emits three typed progress events and
  completes.
- `apps/desktop/src/main.ts` registers that router with `createIPCHandler` from
  `trpc-electron/main`.
- `apps/desktop/src/preload.ts` exposes the Electron tRPC bridge with
  `exposeElectronTRPC`.
- `apps/desktop/src/renderer.ts` creates a typed renderer client with
  `createTRPCProxyClient` plus `ipcLink`, subscribes to `phaseOneProgress`, and
  renders the streamed progress events into the desktop spike UI.

### End-to-End Workflow Spike

The `spikeWorkflow` subscription proves the full typed workflow path described in
the architecture plan:

- `packages/application-contract` defines `WorkflowEvent<TProgress, TOutput,
  TResult>` — the discriminated event union yielded by every long-running
  subscription — plus `AppError`, `WorkflowCallOptions`, and the spike-specific
  payload types.
- `packages/application` implements `runSpikeWorkflow()` — a use-case that
  accepts typed `onProgress`/`onOutput` callbacks and an `AbortSignal`, calls
  `packages/domain` for domain logic, and returns a typed result.
- `apps/desktop/src/trpc.ts` wraps `runSpikeWorkflow()` in a tRPC observable
  subscription that projects `WorkflowEvent` variants through the stream.
- `apps/desktop/src/renderer.ts` subscribes via the typed tRPC client, pattern-
  matches on the `WorkflowEvent` discriminant, and renders progress, output, and
  result states.

The renderer subscription proves:

- 3 typed `progress` events streamed through IPC.
- 1 typed `output` event streamed through IPC.
- 1 `completed` terminal event resolved the workflow result.
- The full package chain: `application → application-contract → domain`.
- Cancellation wiring: the teardown function aborts the shared `AbortSignal`.

### CORS-Constrained Provider Spike

The `spikeCorsWorkflow` subscription proves that CORS-constrained HTTP flows
execute through a Node-side `HttpPort` adapter rather than in the renderer:

- `packages/host-runtime-contract` defines `HttpPort` — the host-side fetch
  abstraction with `HttpRequest`/`HttpResponse` types.
- `packages/host-node` implements `createNodeHttpPort()` backed by Node
  `globalThis.fetch`.
- `packages/application` implements `runSpikeCorsWorkflow()` — a use-case that
  accepts injected `HttpPort` via a ports object, makes a real HTTP request to
  the GitHub API (a CORS-restricted endpoint), and streams progress/output events
  back through the standard `WorkflowCallOptions` callbacks.
- `apps/desktop/src/trpc.ts` uses `createDesktopRouter(ports)` to inject the
  real `NodeHttpPort` at construction time, so all use-cases receive real host
  adapters.
- `apps/desktop/src/main.ts` creates the router with
  `createDesktopRouter({ http: createNodeHttpPort() })`.

The spike proves:

- HTTP request executed in Node (main process), not in the renderer.
- 3 typed `progress` events and 2 `output` events streamed through IPC.
- `completed` terminal event includes `executedIn: "node"` confirmation.
- Port injection pattern works: router construction receives host adapters,
  use-cases receive them per-call.

## Validation Command

```bash
pnpm --filter @repo-edu/desktop run validate:trpc
```

The validation script launches the built Electron app in hidden mode, waits for
the renderer subscription to complete, captures the JSON marker relayed through
the main process, and exits automatically.

## Discovered Issues and Resolutions

### electron-trpc v0.7.1 incompatible with tRPC v11

`electron-trpc` v0.7.1 was built for tRPC v10. The `ipcLink` accesses
`runtime.transformer.serialize()` which no longer exists in tRPC v11's link
runtime (transformers moved to individual link configuration in v11).

**Resolution:** Replaced `electron-trpc` with `trpc-electron` (mat-sz fork),
which provides tRPC v11 support with identical API surface. Import paths changed
from `electron-trpc/main` and `electron-trpc/renderer` to `trpc-electron/main`
and `trpc-electron/renderer`.

### ESM preload rejected by Electron sandbox

electron-vite defaulted to building the preload script as ESM (`.mjs`). Electron
sandbox mode requires preload scripts to be CommonJS.

**Resolution:** Configured `electron.vite.config.ts` preload build with
`rollupOptions.output.format: "cjs"` and `entryFileNames: "preload.cjs"`.

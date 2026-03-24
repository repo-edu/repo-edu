---
title: Transport Adapters
description: How each delivery surface connects callers to workflow handlers
---

The workflow system separates the execution contract (`WorkflowClient` / `WorkflowHandler`) from the transport that connects them. Each delivery surface provides its own transport adapter, but all three share the same handler implementations from `packages/application`.

## Architecture

```text
Caller (UI / CLI command)
  │
  ▼
WorkflowClient.run(id, input, options)
  │
  ▼
┌─────────────────────────────────────────┐
│          Transport Adapter              │
│  desktop: tRPC-electron subscription    │
│  cli:     in-process direct call        │
│  docs:    in-browser direct call        │
└─────────────────────────────────────────┘
  │
  ▼
WorkflowHandler(input, options)
  │
  ▼
Ports (HTTP, Git, filesystem, LMS)
```

## Desktop: tRPC-electron

The desktop surface uses `trpc-electron` to bridge the Electron renderer and main processes.

### Main process (handler side)

`apps/desktop/src/trpc.ts`

`createDesktopWorkflowRegistry(ports)` assembles all handler factories into a complete `WorkflowHandlerMap`. Each handler factory (`createCourseWorkflowHandlers`, `createConnectionWorkflowHandlers`, etc.) receives the runtime ports and returns a partial handler map.

`createDesktopRouter(ports)` wraps each handler as a tRPC **subscription procedure**. A subscription emits `WorkflowEvent` values over the IPC channel:

1. Zero or more `{ type: "progress", data }` events
2. Zero or more `{ type: "output", data }` events
3. Either `{ type: "completed", data }` or `{ type: "failed", error }` to finish

Cancellation is handled by wiring an `AbortController` to the subscription lifecycle — when the renderer unsubscribes, the signal aborts.

### Renderer process (client side)

`apps/desktop/src/workflow-client.ts`

`createDesktopWorkflowClient()` returns a `WorkflowClient` that wraps tRPC subscription calls. For each `run()` call:

1. Opens a tRPC subscription to the workflow's procedure
2. Routes incoming `WorkflowEvent` values to `onProgress` and `onOutput` callbacks
3. Resolves the promise on `completed`, rejects on `failed`
4. Maps the caller's `AbortSignal` to `unsubscribe()` for cancellation

Transport errors (IPC disconnects, timeouts) are normalized to `AppError` with type `"transport"` and an appropriate reason (`"ipc-disconnected"`, `"timeout"`).

## CLI: in-process

`apps/cli/src/workflow-runtime.ts`

The CLI runs handlers directly in the same Node.js process — no transport layer.

`createCliWorkflowHandlers()` composes the same handler factories used by desktop, but only wires workflows whose catalog entry includes `"cli"` in its delivery array.

`createCliWorkflowClientFromBase(base)` wraps the base client to add CLI-specific behavior:

- **Progress rendering**: intercepts `onProgress` and writes milestone labels to stderr
- **Output rendering**: intercepts `onOutput` and routes diagnostic messages to stdout/stderr based on channel
- **SIGINT handling**: first `Ctrl+C` triggers the workflow's `AbortSignal`; second `Ctrl+C` exits the process immediately

## Docs: in-browser

`apps/docs/src/demo-runtime.ts`

The docs demo runs handlers directly in the browser — no transport, no IPC, no Node.js.

`createDocsDemoRuntime(options)` composes handler factories with:

- **In-memory stores** (`createInMemoryCourseStore`, `createInMemoryAppSettingsStore`) seeded with fixture data
- **Mock ports**: LMS, Git, filesystem, and Git command ports that return plausible fake data
- **`createWorkflowClient(handlers)`** to produce a `WorkflowClient` with no transport overhead

This runtime powers the interactive demo page and the docs smoke tests. It validates that the handler layer and contract types are browser-safe (no Node/Electron imports).

## Choosing the right transport

Each surface sets up its `WorkflowClient` once at startup and injects it via `setWorkflowClient()` from `packages/renderer-app/src/contexts/workflow-client.tsx`. The React application consumes it through `useWorkflowClient()` and never knows which transport is behind it.

| Surface | Transport | Client factory | Handler wiring |
|---------|-----------|----------------|----------------|
| Desktop | tRPC-electron | `createDesktopWorkflowClient()` | `createDesktopRouter(ports)` |
| CLI | In-process | `createCliWorkflowClient()` | `createCliWorkflowHandlers()` |
| Docs | In-browser | `createWorkflowClient(handlers)` | `createDocsDemoRuntime()` |

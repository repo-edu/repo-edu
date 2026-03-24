---
title: Architecture
description: Monorepo structure, delivery surfaces, contract layers, and CLI layering
---

## Monorepo structure

```text
apps/
  desktop/                          Electron shell (main + preload + renderer)
  cli/                              Commander-based CLI ("redu")
  docs/                             Astro/Starlight docs + browser-safe demo
packages/
  domain/                           Pure data model, validation, invariants
  application/                      Workflow orchestration (handlers)
  application-contract/             Workflow ids, payload types, catalog
  renderer-app/                     Shared React UI (mounted by all surfaces)
  renderer-host-contract/           Renderer ↔ host bridge (file dialogs, URLs)
  host-runtime-contract/            Application ↔ host bridge (HTTP, process, FS)
  host-node/                        Node implementations of runtime ports
  host-browser-mock/                Browser mock implementations for docs/tests
  integrations-lms-contract/        LMS provider interface
  integrations-lms/                 Canvas and Moodle adapters
  integrations-git-contract/        Git provider interface
  integrations-git/                 GitHub, GitLab, Gitea adapters
  ui/                               Shared UI component library
  test-fixtures/                    Faker-based domain fixture generation
  integration-tests/                E2E tests against live Git providers
```

## Delivery surfaces

All three surfaces execute the same workflows through `WorkflowClient`, but each wires the transport differently:

| Surface | Transport | How it works |
|---------|-----------|--------------|
| Desktop | `trpc-electron` | Renderer calls main process over IPC. Main process constructs workflow handlers with real Node ports. |
| CLI | In-process | Commander handlers call `createCliWorkflowClient()` which instantiates handlers directly with Node ports. |
| Docs | In-browser | `createDocsDemoRuntime()` builds handlers with browser-mock ports. The same `@repo-edu/renderer-app` is mounted. |

The renderer never knows which transport backs the client. It calls `client.run("course.load", { courseId })` identically on all surfaces.

## Browser-embedded app simulation

The docs site at `apps/docs` does more than host static documentation pages. It also runs the real application — the same `@repo-edu/renderer-app` React UI that ships inside the Electron desktop app — directly in the browser.

This works because the application is designed around abstract ports. In the desktop app, workflow handlers talk to real services: HTTP calls to Canvas or GitHub, Git commands via child processes, files on disk. In the browser, none of that infrastructure exists. Instead, `@repo-edu/host-browser-mock` provides in-memory substitutes that satisfy the same port interfaces. File pickers return pre-seeded content. HTTP calls return canned responses. Process execution is stubbed.

The `createDocsDemoRuntime()` function in `apps/docs/src/demo-runtime.ts` assembles this simulation: it takes the same workflow handler factories used by the desktop and CLI, wires them to browser-mock ports, and produces a `WorkflowClient` and `RendererHost` that the React app can use without modification. The result is a fully interactive demo that exercises real workflow logic, real validation, and real UI code — just with synthetic data instead of live services.

This is not just a convenience for users browsing the docs. It also serves as a continuous integration check: if any shared package accidentally imports a Node or Electron API, the docs build breaks. The [guardrail tests](/repo-edu/development/contributing/#guardrail-tests) enforce this boundary automatically.

## Contract layers

Four contract packages define the typed boundaries between layers. All are browser-safe (no Node imports) and contain zero implementation — types only.

### application-contract

The workflow contract. Defines every `WorkflowId`, the `WorkflowPayloads` type map (input, progress, output, result per workflow), the `workflowCatalog` metadata (delivery surfaces, progress granularity, cancellation guarantee), and the `AppError` discriminated union.

See the [Workflow Overview](/repo-edu/development/workflow-overview/) for details.

### renderer-host-contract

The renderer ↔ host bridge for UI interactions. Defines the `RendererHost` interface consumed by `@repo-edu/renderer-app`:

- `pickUserFile` / `pickSaveTarget` — file open/save dialogs
- `pickDirectory` — directory picker
- `openExternalUrl` — launch URLs in system browser
- `getEnvironmentSnapshot` — shell type, theme, window chrome

Desktop implements this in the preload bridge. Docs implements it with browser-mock stubs.

### host-runtime-contract

The application ↔ host bridge for runtime I/O. Defines port interfaces consumed by workflow handlers in `@repo-edu/application`:

- `HttpPort` — HTTP requests to LMS and Git provider APIs
- `ProcessPort` — OS process execution with cancellation modes (`non-cancellable`, `best-effort`, `cooperative`)
- `GitCommandPort` — Git CLI invocation
- `FileSystemPort` — inspect paths, batch operations (ensure-directory, copy-directory, delete-path), temp directories
- `UserFilePort` — read/write user-selected files via opaque `UserFileRef` / `UserSaveTargetRef` handles

`@repo-edu/host-node` provides the Node implementations. `@repo-edu/host-browser-mock` provides stubs.

### integrations-lms-contract and integrations-git-contract

Provider-specific interfaces for LMS (Canvas, Moodle) and Git (GitHub, GitLab, Gitea) operations. The implementation packages (`integrations-lms`, `integrations-git`) depend on `host-runtime-contract` ports for HTTP and process execution.

## CLI layering

The CLI is a thin I/O layer over shared workflows:

```text
cli.ts                  Commander command tree + global --course flag
  └─ commands/*.ts      Argument parsing + output formatting
       └─ workflow-runtime.ts   Builds in-process WorkflowClient from @repo-edu/application
```

Command handlers follow a strict pattern: parse arguments, call a workflow, render output. Business logic must not leak into CLI code — it belongs in `@repo-edu/application` or `@repo-edu/domain`.

Data directory: `~/.repo-edu` by default, overrideable via `REPO_EDU_CLI_DATA_DIR`.

## Design decisions

1. **Shared workflows across surfaces.** Desktop, CLI, and docs use the same workflow contract and handler model. This eliminates behavioral drift and means a bug fix in a handler benefits all surfaces.

2. **Explicit platform boundaries.** Electron APIs are isolated in `apps/desktop`. Shared packages remain platform-agnostic. Browser-safe packages are enforced by the [browser guardrail test](/repo-edu/development/contributing/#guardrail-tests).

3. **Docs as a first-class surface.** `apps/docs` mounts the real `@repo-edu/renderer-app` with mock host adapters. It has dedicated [alignment and guardrail tests](/repo-edu/development/contributing/#guardrail-tests) that break the build if the docs runtime drifts from the workflow catalog.

4. **No legacy migration layer.** This codebase intentionally does not include migration code from older formats. Schema versioning exists (`repo-edu.app-settings.v1`, `repo-edu.course.v1`) for future evolution, not backward compatibility.

5. **Intentionally partial CLI parity.** The CLI covers repeatable execution paths (repo ops, validation, connection checks). Setup-phase workflows stay GUI-only. See [CLI-GUI Parity](/repo-edu/development/cli-gui-parity/) for the full rationale and workflow matrix.

## Boundary rules

- Electron code stays inside `apps/desktop`. Never import Electron in shared packages.
- Shared packages must stay platform-agnostic. The browser guardrail test enforces this.
- Side effects live in adapters and ports (`host-node`, integration adapters), not in domain logic.
- Desktop workflow calls go through the typed tRPC router — no ad hoc IPC.

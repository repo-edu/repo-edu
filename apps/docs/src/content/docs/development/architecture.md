---
title: Architecture
description: Monorepo structure, delivery surfaces, contract layers, and CLI layering
---

## Ports-and-adapters pattern

The codebase follows a ports-and-adapters (hexagonal) architecture. Pure business logic sits at the
center, typed port interfaces define what the core needs from the outside world, and swappable
adapters provide concrete implementations:

| Layer | Packages | Role |
|-------|----------|------|
| **Core contracts** | `domain`, `application-contract` | Pure logic, validation, and workflow types with no platform imports |
| **Application** | `application` | Node workflow orchestration and use cases |
| **Ports** | `host-runtime-contract`, `renderer-host-contract`, `integrations-lms-contract`, `integrations-git-contract` | Typed interfaces (HTTP, filesystem, Git CLI, LMS/Git providers, UI bridge) |
| **Adapters** | `host-node`, `integrations-lms`, `integrations-git` | Concrete Node implementations used by delivery surfaces |

Desktop and CLI use the same workflow handlers. Their transports differ, but both run against Node
host adapters.

## Monorepo structure

```text
apps/
  desktop/                          Electron shell (main + preload + renderer)
  cli/                              Commander-based CLI ("redu")
  docs/                             Static Astro/Starlight documentation site
packages/
  domain/                           Pure data model, validation, invariants
  application/                      Workflow orchestration (handlers)
  application-contract/             Workflow ids, payload types, catalog
  renderer-app/                     React UI mounted by the desktop renderer
  renderer-host-contract/           Renderer ↔ host bridge (dialogs, theme, close)
  host-runtime-contract/            Application ↔ host bridge (HTTP, process, FS)
  host-node/                        Node implementations of runtime ports
  integrations-lms-contract/        LMS provider interface
  integrations-lms/                 Canvas and Moodle adapters
  integrations-git-contract/        Git provider interface
  integrations-git/                 GitHub, GitLab, Gitea adapters
  integrations-llm-contract/        Provider-neutral LLM interface
  integrations-llm-catalog/         Curated model catalog and pricing lookup
  integrations-llm/                 Claude and Codex adapters
  fixture-engine/                   AI-driven student-repo fixture generator
  tree-sitter-grammar-assets/       Browser-safe source-tokenizer grammar WASM assets
  ui/                               Shared UI component library
  test-fixtures/                    Faker-based domain fixture generation
  integration-tests/                E2E tests against live Git providers
```

## Delivery surfaces

The two application surfaces execute workflows through `WorkflowClient`, but each wires the
transport differently:

| Surface | Transport | How it works |
|---------|-----------|--------------|
| Desktop | Sole gateway with ordinary tRPC and exclusive request ports | Main validates renderer authority and input before admission and application handlers. |
| CLI | In-process | Commander handlers call `createCliWorkflowClient()` which instantiates handlers directly with Node ports. |

`RendererSessionRoot` supplies ordinary and exclusive clients to the session
operation owner. Features receive its gateway. That owner reserves complete
direct and Query-backed bodies, including result publication and semantic
follow-up. Command reservation freezes all semantic changes and worker starts
until acknowledgement, host release and renderer retirement have finished.

The docs site is static product and developer documentation. It does not mount application code or
provide a third delivery surface.

## Contract layers

The contract packages define browser-safe boundaries between layers. Reusable
runtime schemas live with their concepts; Electron wire composition stays in desktop.

### application-contract

The workflow contract. Defines every `WorkflowId`, the `WorkflowPayloads` type map (input, progress,
output, result per workflow), the `workflowCatalog` metadata (delivery surfaces, progress
granularity and cancellation guarantee) and the `AppError` discriminated union.
Its exhaustive `workflowInputSchemas` map validates every workflow input. It
also declares exclusive outcomes, preparation bundles, course-transition
requirements and bounded authoritative settlement values.

See the [Workflow Overview](/repo-edu/development/workflow-overview/) for details.

### renderer-host-contract

The renderer ↔ host bridge for UI interactions. Defines the `RendererHost` interface consumed by
`@repo-edu/renderer-app`:

- `pickUserFile` / `pickSaveTarget` — file open/save dialogs
- `pickDirectory` — directory picker
- `setNativeTheme` — keep Electron native UI aligned with the renderer theme
- `onCloseRequest` — prepare persistence for host-owned clean close

Desktop implements the contract in the preload bridge. The capabilities are required because the
renderer has no browser fallback host.

### host-runtime-contract

The application ↔ host bridge for runtime I/O. Defines port interfaces consumed by workflow handlers
in `@repo-edu/application`:

- `HttpPort` — HTTP requests to LMS and Git provider APIs
- `ProcessPort` — OS process execution with cancellation modes (`non-cancellable`, `best-effort`,
  `cooperative`)
- `GitCommandPort` — Git CLI invocation
- `FileSystemPort` — inspect paths, batch operations (ensure-directory, copy-directory,
  delete-path), temp directories
- `UserFilePort` — read/write user-selected files via opaque `UserFileRef` / `UserSaveTargetRef`
  handles
- `LlmPort` — provider-neutral prompt/reply calls for examination workflows
- `ExaminationArchiveStoragePort` — opaque storage for versioned examination archive records

`@repo-edu/host-node` provides the Node implementations.

### integrations-lms-contract, integrations-git-contract, and integrations-llm-contract

Provider-specific interfaces for LMS (Canvas, Moodle), Git (GitHub, GitLab, Gitea), and LLM
prompt/reply operations. The implementation packages (`integrations-lms`, `integrations-git`,
`integrations-llm`) depend on runtime ports or provider SDKs in adapter packages, not in domain or
renderer code.

## Desktop process lifetime

One desktop process owns one renderer document. The gateway installs before its
initial load. Later navigation, redirects, reloads, replacement documents and
renderer-created windows are terminal. Last-window close exits on every
platform. Activation can focus an existing window; a later launch creates a new process.

The fatal entry registers synchronous logging and immediate exit before
dynamically importing product composition. The product's synchronous installer
sets command-line switches, takes Electron's single-instance lock and installs
pre-ready listeners. It attaches asynchronous startup without waiting for
readiness inside the entry import. A second desktop launch exits and focuses
the existing window. The shared desktop/CLI program gate is claimed before
stores open and held until the process-exit listener releases it.

The host admission reducer owns normal close and detected failure. Interactive
close drains accepted ordinary calls and prepares persistence over one close
port. Close during startup or a command skips another renderer preparation.
Every normal ending asks the shared child-process controller to stop and confirm
owned work. Confirmed ending permits exit or update installation. Confirmation
expiry shows one fatal warning and exits without claiming confirmation or
starting installation. The gate remains held through either path until process exit.

Uncaught main-process exceptions, rejected product imports and thrown installers
use the separate fatal path: synchronous logging and immediate exit, with no
reducer dispatch or asynchronous cleanup. Unhandled rejections, invalid gateway
or request messages, current-port loss and durable-owner failure use normal
terminal shutdown. Renderer loss is terminal. Other Electron child loss is
terminal for every reason except `clean-exit`, regardless of child type.

Native Edit, Window, zoom, full-screen and safe macOS Services/Hide actions
remain available. The session owner still refuses semantic edits during the
global freeze. Close, quit and update restart are owned reducer actions. Help
uses a fixed main-process documentation destination. Production menus have no
reload or developer-tools action.

## Storage and process peers

The durable-storage peer supplies `host-node` adapters: one shared course
database with whole-course rows, single-writer settings publication and
best-effort window geometry. Bootstrap validates course and examination data
before the renderer starts. Invalid credentials or preferences are renamed
aside with a visible backup path before defaults load; unreadable settings or
failed rename abort. Invalid course or examination data aborts unchanged.
Missing, invalid or unreadable window state loads default geometry. Window
state failures never trigger terminal storage handling or delay final exit.

`composeCourseCommandTransition` in `application` composes each course-changing
command's complete next course from immutable input and its official result.
Durable save and renderer application consume that course with the host stamp.
Features never independently merge partial command results.

The child-process lifetime peer owns containment of application-effect trees,
including Git, subscription Claude and the Codex SDK host process. Electron
children and updater-owned installation remain outside that scope. The
command-completion peer owns the five-second graceful wait and five-second
forced-stop confirmation limit. During a session, confirmation expiry returns
an unknown outcome and warns once while the session continues. That command
has no result or course transition and is never retried. Other uncertainty is
terminal. A later launch may overlap unconfirmed outside work under the
unconfirmed-shutdown boundary.

Desktop owns integration and ordering. The durable-storage peer owns the final
packaged storage proof; the lifetime peer owns platform containment artifacts.
The user runs artifact builders. See
[Transport Adapters](/repo-edu/development/workflow-transport/) for request order.

## CLI layering

The CLI is a thin I/O layer over shared workflows:

```text
cli.ts                  Commander command tree + global --course flag
  └─ commands/*.ts      Argument parsing + output formatting
       └─ workflow-runtime.ts   Builds in-process WorkflowClient from @repo-edu/application
```

Command handlers follow a strict pattern: parse arguments, call a workflow, render output. Business
logic must not leak into CLI code — it belongs in `@repo-edu/application` or `@repo-edu/domain`.

Data directory: desktop and CLI share the platform app-data root on supported CLI platforms: macOS
`~/Library/Application Support/repo-edu` and Linux `${XDG_CONFIG_HOME:-~/.config}/repo-edu`. The
Windows desktop app stores data under `%APPDATA%\repo-edu`.

## Design decisions

1. **Shared workflows across surfaces.** Desktop and CLI use the same workflow contract and handler
   model. This eliminates behavioral drift and means a bug fix in a handler benefits both surfaces.

2. **Explicit platform boundaries.** Electron APIs are isolated in `apps/desktop`. Renderer runtime
   closure is checked from the desktop entry point, while contracts remain independently
   browser-safe.

3. **Static documentation.** `apps/docs` contains Astro/Starlight content and build configuration
   only. It does not own application runtime or fixture behavior.

4. **No settings migration layer.** This codebase intentionally does not convert unsupported
   composite settings files. Section schema discriminators exist for future evolution, not backward
   compatibility.

5. **Intentionally partial CLI parity.** The CLI covers repeatable execution paths (repo ops,
   validation, connection checks). Setup-phase workflows stay GUI-only. See
   [CLI-GUI Parity](/repo-edu/development/cli-gui-parity/) for the full rationale and workflow
   matrix.

## Boundary rules

`tools/architecture-check` is the CI-facing owner for source area identity and
graph-level architecture rules. It reads the committed area model at
`tools/architecture-check/src/area-model.json`, validates it with zod, and
reconciles it against tracked `.ts` and `.tsx` files under `apps/*/src`,
`packages/*/src`, and `tools/*/src`.

Partition areas tile that source inventory exactly once. They define the
primary owner for a file and feed dependency-cruiser boundary rules. Cover
areas may overlap partition areas and record cross-cutting concerns for audit
and drift reporting, but they do not create dependency-cruiser boundaries. See
[Source Areas](/repo-edu/development/area-model/) for the partition/cover model,
the area overview and how to read it for split and redesign triage.

The same normalized source inventory feeds area reconciliation and
dependency-cruiser graph checks. Graph-level rules such as layer boundaries,
domain module order, claude-coder source confinement, whole-source import
cycles, and the desktop renderer runtime closure run through
dependency-cruiser. Repository checks also enforce source exports and Node test
runner imports. Symbol-level renderer session ownership remains bespoke in
architecture-check.

- Electron code stays inside `apps/desktop`. Never import Electron in shared packages.
- Browser-safe contracts and the desktop renderer runtime closure must not import Node built-ins.
- Side effects live in adapters and ports (`host-node`, integration adapters), not in domain logic.
- Only the desktop gateway registers renderer IPC. Ordinary workflows use its
  tRPC adapter; exclusive commands and clean close use retained request ports.
- Every workflow, direct action, request message, lifecycle source, menu action
  and updater message belongs to its separately checked fixed inventory.
- The session operation owner alone holds the raw client. All semantic mutation
  routes pass through its admission; Query publication stays inside the body.

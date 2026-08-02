---
title: Contributing
description: Where logic belongs, validation commands, high-risk areas, and repository checks
---

## Where logic belongs

Before making a change, decide which layer owns the behavior:

| If the logic is about… | It belongs in… |
|------------------------|----------------|
| Data invariants, validation rules, pure transforms | `packages/domain` |
| Workflow orchestration, multi-step operations | `packages/application` |
| Workflow IDs, payload types, catalog metadata | `packages/application-contract` |
| React UI, pages, components | `packages/renderer-app` |
| File dialogs, external URLs, environment | `packages/renderer-host-contract` (types) + app shell (impl) |
| HTTP, process, filesystem, Git CLI | `packages/host-runtime-contract` (types) + `packages/host-node` (impl) |
| LMS/Git provider specifics | `packages/integrations-*` |
| Argument parsing, output formatting | `apps/cli/src/commands/` |
| Electron IPC, preload bridge | `apps/desktop/` |

Keep behavior in shared packages wherever possible. Shell-specific concerns (Electron IPC, Commander argument parsing, Astro page routing) stay in app shells.

## Minimum validation

Run these before opening a change:

```bash
pnpm check       # fix + typecheck + build:types + check:fixtures + check:architecture
pnpm test        # all package-level tests
```

For changes touching desktop, also run:

```bash
pnpm test:runtime   # preload bridge and tRPC wiring checks
```

Or run everything at once:

```bash
pnpm validate    # check + test:all
```

See [Building](/repo-edu/development/building/) for the full script reference.

## High-risk areas

### Workflow contract changes

Modifying `WorkflowPayloads` or `workflowCatalog` in `packages/application-contract` affects all surfaces. Adding a workflow requires wiring it in every surface listed in its `delivery` array. Changing payload types requires updating all handlers and callers. The alignment tests will catch missing wiring, but type errors must be resolved manually. See [Adding a Workflow](/repo-edu/development/workflow-adding/) for the full procedure.

### Persistence schema changes

`PersistedAppCredentials`, `PersistedAppPreferences`, and `PersistedCourse` are serialized to disk. Changing field names, removing fields, or altering types will break existing saved files. Settings section types are derived from schemas via `z.infer` in `settings.ts`. `PersistedCourse` retains a compile-time drift guard in `schemas.ts` — a mismatch is a build error.

### Cross-surface behavior mismatches

Desktop and CLI should produce the same result for the same workflow input. If you change handler behavior, verify it on every declared delivery surface.

### Electron boundary leakage

Importing Node or Electron APIs into the desktop renderer runtime closure breaks its sandbox boundary. The architecture check enforces this automatically.

## Repository checks

`tools/architecture-check` owns repository-wide checks that do not belong to an app:

- package export sources must resolve to current source files
- TypeScript tests must use `node:test` and `node:assert/strict`
- the desktop renderer runtime closure must not contain Node built-in imports
- independently browser-safe contract and fixture roots must not contain Node built-in imports

The runtime closure is derived from dependency-cruiser metadata starting at `apps/desktop/src/renderer.ts`. Tests, type-only edges, and pre-compilation-only edges do not enter the closure.

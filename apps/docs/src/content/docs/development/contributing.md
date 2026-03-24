---
title: Contributing
description: Where logic belongs, validation commands, high-risk areas, and guardrail tests
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
| Browser mock behavior | `packages/host-browser-mock` |

Keep behavior in shared packages wherever possible. Shell-specific concerns (Electron IPC, Commander argument parsing, Astro page routing) stay in app shells.

## Minimum validation

Run these before opening a change:

```bash
pnpm check       # lint + typecheck + build:types + check:fixtures + check:architecture
pnpm test        # all package-level tests
```

For changes touching desktop or docs, also run:

```bash
pnpm desktop:test   # preload bridge and tRPC wiring checks
pnpm docs:test      # smoke, workflow alignment, and browser guardrail tests
```

Or run everything at once:

```bash
pnpm validate    # check + test
```

See [Building](/repo-edu/development/building/) for the full script reference.

## High-risk areas

### Workflow contract changes

Modifying `WorkflowPayloads` or `workflowCatalog` in `packages/application-contract` affects all surfaces. Adding a workflow requires wiring it in every surface listed in its `delivery` array. Changing payload types requires updating all handlers and callers. The alignment tests will catch missing wiring, but type errors must be resolved manually. See [Adding a Workflow](/repo-edu/development/workflow-adding/) for the full procedure.

### Persistence schema changes

`PersistedAppSettings` and `PersistedCourse` are serialized to disk. Changing field names, removing fields, or altering types will break existing saved files. Compile-time drift guards in `schemas.ts` ensure Zod schemas stay in sync with TypeScript types — a mismatch is a build error.

### Cross-surface behavior mismatches

All surfaces should produce the same result for the same workflow input. If you change handler behavior, verify it on all delivery surfaces. The docs demo runtime uses mock ports, so mock behavior must stay realistic enough to catch regressions.

### Electron boundary leakage

Importing Node or Electron APIs into browser-safe packages breaks the docs site and the test suite. The browser guardrail test enforces this automatically.

## Guardrail tests

Two automated tests in `apps/docs/src/__tests__/` enforce architectural invariants:

### workflow-alignment.test.ts

Verifies that:

- Every workflow marked with `delivery: ["docs", ...]` in the catalog has a corresponding handler in the docs demo runtime
- Every workflow invoked by `@repo-edu/renderer-app` source code (detected via regex on `.run("workflow.id"` calls) is present in the docs runtime

This catches forgotten wiring when adding new workflows or changing delivery arrays.

### browser-guardrail.test.ts

Scans source files in browser-safe packages (`domain`, `application-contract`, `renderer-host-contract`, `renderer-app`, `host-browser-mock`, `test-fixtures`) for forbidden imports:

- `node:*` built-in modules
- `fs`, `path`, `child_process`, `worker_threads`, `net`, `tls`

Any match fails the test. This prevents Node/Electron dependencies from leaking into packages that must run in the browser.

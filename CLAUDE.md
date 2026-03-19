# CLAUDE.md

This file provides guidance to AI coding assistants when working in this repository.

## Build and Development Commands

Use pnpm scripts only. All packages follow `pnpm --filter <name> run {build,typecheck,test}`. Non-obvious targets are noted in package CLAUDE.md files.

```bash
# Install
pnpm install

# Workspace validation
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check

# Formatting
pnpm format
```

## Architecture

`repo-edu` is a pure TypeScript pnpm monorepo.

```text
repo-edu/
├── apps/
│   ├── desktop/   # Electron shell + tRPC router + preload bridge
│   ├── cli/       # Commander-based CLI (redu)
│   └── docs/      # Browser-safe demo harness
└── packages/
    ├── domain/                    # Pure product rules and validation
    ├── application/               # Workflow orchestration/use-cases
    ├── application-contract/      # Workflow ids/payloads/catalog + AppError
    ├── renderer-host-contract/    # Renderer-safe host interface
    ├── host-runtime-contract/     # Runtime ports (http/process/fs/user-file)
    ├── host-node/                 # Node implementations for runtime ports
    ├── host-browser-mock/         # Browser mock host for docs/tests
    ├── integrations-lms(-contract)
    ├── integrations-git(-contract)
    ├── renderer-app/               # Shared React application
    └── ui/                        # Shared UI component library
```

Core flow:

1. `packages/renderer-app` invokes workflows through `WorkflowClient` from `@repo-edu/application-contract`.
2. `apps/desktop` provides that client over `trpc-electron`; `apps/cli` runs workflows in-process.
3. `packages/application` orchestrates use-cases using ports/contracts.
4. `packages/domain` owns pure semantics and invariants.

## Critical Rules

- Do not add ad hoc IPC for workflow execution. Desktop workflow calls must go through the typed tRPC router.
- Keep browser-safe packages (`domain`, `application-contract`, `app`, docs-facing code) free of Node/Electron imports.
- Keep side effects in adapters/ports (`host-node`, integration adapters), not in domain logic.
- Do not introduce legacy settings/profile migration logic.

## Testing Strategy

Prefer tests at package boundaries:

- domain invariants in `packages/domain/src/__tests__`
- workflow behavior in `packages/application/src/__tests__`
- adapter/port tests in integration and host packages
- desktop bridge checks in `apps/desktop/scripts` + tests
- CLI golden/behavior tests in `apps/cli/src/__tests__`
- docs smoke and guardrail tests in `apps/docs/src/__tests__`

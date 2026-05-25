# CLAUDE.md

This file provides guidance to AI coding assistants when working in this repository.

## Build and Development Commands

Use pnpm scripts only. All validation runs from the workspace root:

```bash
pnpm install
pnpm fmt
pnpm fix
pnpm check
pnpm test
```

- `fmt` — markdown formatting via rumdl
- `fix` — markdown auto-fix + Biome auto-fix
- `check` — fix + typecheck + check:types:build + check:fixtures + check:architecture
- `test` — runs all package tests workspace-wide
- `file-sizes` — tree-style line/file counts per subfolder for a given directory
  (`pnpm file-sizes` for options)

## Architecture

`repo-edu` is a pure TypeScript pnpm monorepo. Workspace globs: `apps/*`, `packages/*`, `tools/*`.

```text
repo-edu/
├── apps/
│   ├── desktop/   # Electron shell + tRPC router + preload bridge
│   ├── cli/       # Commander-based CLI (redu)
│   └── docs/      # Astro/Starlight site + browser-safe demo harness
├── packages/
│   ├── domain/                    # Pure product rules and validation
│   ├── application/               # Workflow orchestration/use-cases
│   ├── application-contract/      # Workflow ids/payloads/catalog + AppError
│   ├── renderer-host-contract/    # Renderer-safe host interface
│   ├── host-runtime-contract/     # Runtime ports (http/process/fs/user-file/llm/exam-archive)
│   ├── host-node/                 # Node implementations for runtime ports
│   ├── host-browser-mock/         # Browser mock host for docs/tests
│   ├── integrations-git(-contract)
│   ├── integrations-lms(-contract)
│   ├── integrations-llm(-contract,-catalog)  # Provider-neutral LLM contract,
│   │                                         # Claude/Codex adapters, curated model catalog
│   ├── fixture-engine/            # AI-driven student-repo fixture generator
│   ├── tree-sitter-grammar-assets/ # Browser-safe source-tokenizer grammar WASM assets
│   ├── renderer-app/              # Shared React application
│   ├── ui/                        # Shared UI component library
│   ├── test-fixtures/             # Shared domain fixture generation (faker-based)
│   └── integration-tests/         # E2E workflow tests against live Git providers
└── tools/                         # Workspace tooling (each runs via tsx)
    ├── architecture-check/        # Boundary/architecture lint (pnpm check:architecture)
    ├── dev-fixture/               # Local seed runner (pnpm dev:fixture)
    ├── file-sizes/                # Tree-style line/file counter (pnpm file-sizes)
    ├── fixture-cli/               # `pnpm fixture` entry into @repo-edu/fixture-engine
    ├── fixtures-check/            # Validates @repo-edu/test-fixtures matrix
    └── release/                   # Versioning/release helper
```

Each app and package has its own `CLAUDE.md` with purpose, constraints, and non-obvious conventions:

- [apps/cli/CLAUDE.md](apps/cli/CLAUDE.md)
- [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md)
- [apps/docs/CLAUDE.md](apps/docs/CLAUDE.md)
- [packages/application/CLAUDE.md](packages/application/CLAUDE.md)
- [packages/application-contract/CLAUDE.md](packages/application-contract/CLAUDE.md)
- [packages/domain/CLAUDE.md](packages/domain/CLAUDE.md)
- [packages/fixture-engine/CLAUDE.md](packages/fixture-engine/CLAUDE.md)
- [packages/host-browser-mock/CLAUDE.md](packages/host-browser-mock/CLAUDE.md)
- [packages/host-node/CLAUDE.md](packages/host-node/CLAUDE.md)
- [packages/host-runtime-contract/CLAUDE.md](packages/host-runtime-contract/CLAUDE.md)
- [packages/integration-tests/CLAUDE.md](packages/integration-tests/CLAUDE.md)
- [packages/integrations-git/CLAUDE.md](packages/integrations-git/CLAUDE.md)
- [packages/integrations-git-contract/CLAUDE.md](packages/integrations-git-contract/CLAUDE.md)
- [packages/integrations-llm/CLAUDE.md](packages/integrations-llm/CLAUDE.md)
- [packages/integrations-llm-catalog/CLAUDE.md](packages/integrations-llm-catalog/CLAUDE.md)
- [packages/integrations-llm-contract/CLAUDE.md](packages/integrations-llm-contract/CLAUDE.md)
- [packages/integrations-lms/CLAUDE.md](packages/integrations-lms/CLAUDE.md)
- [packages/integrations-lms-contract/CLAUDE.md](packages/integrations-lms-contract/CLAUDE.md)
- [packages/renderer-app/CLAUDE.md](packages/renderer-app/CLAUDE.md)
- [packages/renderer-host-contract/CLAUDE.md](packages/renderer-host-contract/CLAUDE.md)
- [packages/test-fixtures/CLAUDE.md](packages/test-fixtures/CLAUDE.md)
- [packages/tree-sitter-grammar-assets/CLAUDE.md](packages/tree-sitter-grammar-assets/CLAUDE.md)
- [packages/ui/CLAUDE.md](packages/ui/CLAUDE.md)

Core flow:

1. `packages/renderer-app` invokes workflows through `WorkflowClient` from `@repo-edu/application-contract`.
2. `apps/desktop` provides that client over `trpc-electron`; `apps/cli` runs workflows in-process.
3. `packages/application` orchestrates use-cases using ports/contracts.
4. `packages/domain` owns pure semantics and invariants.

## Critical Rules

- Do not add ad hoc IPC for workflow execution. Desktop workflow calls must go through the typed tRPC router.
- Keep browser-safe packages (`domain`, `application-contract`, `renderer-app`, docs-facing code) free of Node/Electron imports.
- Keep side effects in adapters/ports (`host-node`, integration adapters), not in domain logic.
- Do not introduce legacy settings/profile migration logic.

## Testing Strategy

Tests are functional/behavioral — they verify *what* the code must do, not *how* it's structured internally. Prefer tests at package boundaries:

- domain invariants in `packages/domain/src/__tests__`
- workflow behavior in `packages/application/src/__tests__`
- adapter/port tests in integration and host packages
- desktop bridge checks in `apps/desktop/scripts` + tests
- CLI golden/behavior tests in `apps/cli/src/__tests__`
- docs smoke and guardrail tests in `apps/docs/src/__tests__`

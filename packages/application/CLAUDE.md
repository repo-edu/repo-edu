# CLAUDE.md

This package contains shared workflow orchestration (`@repo-edu/application`).

## Responsibility

`@repo-edu/application` owns use-case orchestration and workflow handlers.

It composes:

- workflow contracts from `@repo-edu/application-contract`
- pure domain logic from `@repo-edu/domain`
- host/runtime ports from `@repo-edu/host-runtime-contract`
- LMS/Git integration contracts

## Key Patterns

- `create*WorkflowHandlers(...)` functions build typed handler maps.
- Long-running workflows use `WorkflowCallOptions` for progress/output/cancellation.
- App-level error normalization returns `AppError` variants.
- Import/export adapters in `src/adapters/tabular/` use `papaparse` and `xlsx`; `src/adapters/repobee-students-parser.ts` handles RepoBee `.txt` format.
- Group-set workflows are split into `src/group-set-workflows/` (`file-handlers.ts`, `lms-handlers.ts`, `helpers.ts`, `ports.ts`), supporting both CSV additive and RepoBee full-replace import via `GroupSetImportFormat`.

## Rules

- Keep business semantics in domain where possible; keep orchestration here.
- Do not import Electron/Commander/React into this package.
- Keep all side effects behind explicit ports/contracts.

## Adding a Workflow

1. Add id/payload types and metadata in `@repo-edu/application-contract`.
2. Implement handler in this package.
3. Wire handler in desktop router, desktop workflow client, and CLI/docs runtimes.
4. Add tests at workflow and boundary levels.

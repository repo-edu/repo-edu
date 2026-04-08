# CLAUDE.md

This package defines the shared workflow contract (`@repo-edu/application-contract`).

## Responsibility

`@repo-edu/application-contract` is the compile-time source of truth for:

- workflow ids and payload/result/progress/output types (`WorkflowPayloads`)
- workflow metadata (`workflowCatalog`)
- `WorkflowClient` interface
- shared `AppError` taxonomy and transport helpers
- cross-surface file reference DTOs (`UserFileRef`, `UserSaveTargetRef`)
- re-exported domain types used in workflows (`IdSequences`, `GroupSetImportFormat`)
- analysis workflow entries: `analysis.run` (log-based stats + PersonDB baseline) and `analysis.blame` (per-file blame + PersonDB overlay), both with `delivery: ["desktop", "docs"]`, `progress: "granular"`, and cooperative cancellation

## Rules

- Keep this package browser-safe.
- Do not add runtime dependencies on desktop/cli implementations.
- Do not re-introduce generated command binding systems.
- Any workflow id change must be reflected in all invoking surfaces.

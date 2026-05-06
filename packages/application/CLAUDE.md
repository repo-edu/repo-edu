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
- Course/document persistence: `src/course-workflows.ts` (`course.list|load|save|delete`), and the unified document surface in `src/analysis-doc-workflows.ts` (`analyses.list|load|save|delete`, `documents.list`) which treats standalone `PersistedAnalysis` and `PersistedCourse` documents through the same handlers.
- Connection workflows are split: `src/connection-workflows.ts` (LMS/Git draft verification + LMS course listing) and `src/llm-connection-workflows.ts` (`connection.verifyLlmDraft`, exercising provider adapters via `LlmPort`).
- Group-set workflows live in `src/group-set-workflows/` (`file-handlers.ts`, `lms-handlers.ts`, `helpers.ts`, `ports.ts`). CSV import produces `NamedGroupSet`; RepoBee import produces `UsernameGroupSet`. Export dispatches by `nameMode` (CSV for named, TXT for unnamed).
- Repository workflows live in `src/repository-workflows/` (also re-exported from `src/repository-workflows.ts`): `repo.create|clone|update|listNamespace|bulkClone`.
- Analysis workflows are in `src/analysis-workflows/`: `analysis-handler.ts` (`analysis.run`), `blame-handler.ts` (`analysis.blame`), `discover-repos-handler.ts` (`analysis.discoverRepos`), plus `log-parser.ts`, `blame-parser.ts`, `snapshot-engine.ts`, `filter-utils.ts`, `repo-root.ts`, `ports.ts` (`AnalysisWorkflowPorts`). Handlers use `GitCommandPort` only — there is no application-level analysis cache (a previous LRU/persistent cache was removed deliberately; see `analysis-workflows/CLAUDE.md`).
- Examination workflows are in `src/examination-workflows/`: `examination-workflows.ts` (`examination.generateQuestions`), `prompt-builder.ts` (prompt construction + JSON-fence stripping), `ports.ts` (`ExaminationWorkflowPorts` wrapping `LlmPort`), plus archive surface — `archive-workflows.ts` (`examination.archive.export|import`), `archive-key.ts` (structured `ExaminationArchiveKey`), `archive-port.ts` (handler-side adapter over the host's `ExaminationArchiveStoragePort`). The generate handler builds a prompt from blame-attributed code excerpts, calls `LlmPort`, and parses strict JSON into `ExaminationQuestion[]`.

## Rules

- Keep business semantics in domain where possible; keep orchestration here.
- Do not import Electron/Commander/React into this package.
- Keep all side effects behind explicit ports/contracts.

## Adding a Workflow

1. Add id/payload types and metadata in `@repo-edu/application-contract`.
2. Implement handler in this package.
3. Wire handler in desktop router, desktop workflow client, and CLI/docs runtimes.
4. Add tests at workflow and boundary levels.

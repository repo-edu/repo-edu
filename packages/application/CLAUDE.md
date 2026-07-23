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
- Save workflow handlers validate payloads at the workflow boundary, write through their host store, and never return a full persisted document. `settings.saveCredentials` and `settings.savePreferences` return no result; `course.save` returns only `{ revision, updatedAt }`.
- Host save stores throw typed `PersistenceWriteError` values for write-path storage failures and `CourseSaveConflictError` values for optimistic course-save conflicts. Workflow handlers normalize these to shared `AppError` values, including `retryable` on persistence errors and conflict reasons `"revision-invariant"` / `"course-missing"` for course writes.
- Import/export adapters in `src/adapters/tabular/` use `papaparse` and `xlsx`; `src/adapters/repobee-students-parser.ts` handles RepoBee `.txt` format.
- Course persistence: `src/course-workflows.ts` (`course.list|load|save|delete`) for LMS- and RepoBee-backed `PersistedCourse` documents.
- Connection workflows are split: `src/connection-workflows.ts` (LMS/Git draft verification + LMS course listing) and `src/llm-connection-workflows.ts` (`connection.verifyLlmDraft`, exercising provider adapters via `LlmPort`).
- Group-set workflows live in `src/group-set-workflows/` (`file-handlers.ts`, `lms-handlers.ts`, `helpers.ts`, `ports.ts`). CSV import produces `NamedGroupSet`; RepoBee import produces `UsernameGroupSet`. Export dispatches by `nameMode` (CSV for named, TXT for unnamed).
- Git username import lives in `src/git-username-workflows.ts` (`gitUsernames.import`) and validates imported usernames through the Git provider client.
- Repository workflows live in `src/repository-workflows/` (also re-exported from `src/repository-workflows.ts`): `repo.create|clone|update|listNamespace|bulkClone`.
- Analysis workflows are in `src/analysis-workflows/`, assembled by `analysis-workflows.ts` (`createAnalysisWorkflowHandlers`): `analysis-handler.ts` (`analysis.run`), `snapshot-head-handler.ts` (`analysis.resolveSnapshotHead`), `blame-handler.ts` (`analysis.blame`), `discover-repos-handler.ts` (`analysis.discoverRepos`), `submission-folder-handler.ts` (`analysis.listFolderFiles`, `analysis.readFolderFile`), plus `log-parser.ts`, `blame-parser.ts`, `snapshot-engine.ts`, `analysis-matchers.ts`, `repo-root.ts`, `ports.ts` (`AnalysisWorkflowPorts` over `GitCommandPort` + `FileSystemPort`). `analysis-matchers.ts` owns one immutable compiled predicate set per analysis invocation. `repo-root.ts` validates the repository locator union: course-relative paths require clone-target source data, while absolute paths run without course data. There is no application-level analysis cache — handlers recompute against the ports on every call (a previous LRU/persistent cache was removed deliberately; see `analysis-workflows/CLAUDE.md`).
- Examination workflows are in `src/examination-workflows/`: `examination-workflows.ts` (`examination.generateQuestions`, `examination.lookupQuestions`), `prompt-builder.ts` (prompt construction + JSON-fence stripping), `ports.ts` (`ExaminationWorkflowPorts` wrapping `LlmPort`), plus archive surface — `archive-workflows.ts` (`examination.archive.export|import`) and `archive-port.ts` (handler-side adapter over the host's opaque `ExaminationArchiveStoragePort`). The generate handler builds a prompt from blame-attributed code excerpts, calls `LlmPort`, and parses strict JSON into `ExaminationQuestion[]`; the lookup handler reads archive records for the same generation context without calling the LLM.

## Rules

- Keep business semantics in domain where possible; keep orchestration here.
- Do not import Electron/Commander/React into this package.
- Keep all side effects behind explicit ports/contracts.

## Adding a Workflow

1. Add id/payload types and metadata in `@repo-edu/application-contract`.
2. Implement handler in this package.
3. Wire handler in the relevant desktop router/client and CLI/docs runtimes.
4. Add tests at workflow and boundary levels.

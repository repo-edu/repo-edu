# CLAUDE.md

This package defines the shared workflow contract (`@repo-edu/application-contract`).

## Responsibility

`@repo-edu/application-contract` is the compile-time source of truth for:

- workflow ids and payload/result/progress/output types (`WorkflowPayloads`)
- workflow metadata (`workflowCatalog`)
- `WorkflowClient` interface
- shared `AppError` taxonomy and transport helpers
- cross-surface file reference DTOs (`UserFileRef`, `UserSaveTargetRef`)
- re-exported domain types used in workflows (`IdSequences`, `GroupSetImportFormat`, `PersistedAnalysis`, `LmsProviderKind`, `GitProviderKind`, etc.)
- re-exported LLM contract types (`LlmProvider`, `LlmEffort`, `LlmAuthMode`, `LlmUsage`) from `@repo-edu/integrations-llm-contract`
- re-exported `ExaminationArchiveKey` / `ExaminationArchiveImportSummary` from `@repo-edu/host-runtime-contract`
- document workflow entries: `documents.list` (unified analyses + courses), `analyses.{list,load,save,delete}`, `course.{list,load,save,delete}`
- connection draft verification: `connection.verifyLmsDraft`, `connection.listLmsCoursesDraft`, `connection.verifyGitDraft`, `connection.verifyLlmDraft`
- analysis workflow entries: `analysis.run` (log-based stats + PersonDB baseline), `analysis.blame` (per-file blame + PersonDB overlay), and `analysis.discoverRepos` (filesystem repo discovery for course-rooted analyses); all `delivery: ["desktop", "docs"]`, `progress: "granular"`, cooperative cancellation
- examination workflow entries: `examination.generateQuestions` (LLM-generated oral exam questions per member from blame-attributed code) plus `examination.archive.export|import` (versioned archive bundle — `EXAMINATION_ARCHIVE_BUNDLE_FORMAT` / `EXAMINATION_ARCHIVE_BUNDLE_VERSION`, `ExaminationArchiveBundle`, drift-aware re-import). All `delivery: ["desktop", "docs"]`. Docs runtime binds a stub that errors when no LLM is reachable in-browser.

## Rules

- Keep this package browser-safe.
- Do not add runtime dependencies on desktop/cli implementations.
- Do not re-introduce generated command binding systems.
- Any workflow id change must be reflected in all invoking surfaces.

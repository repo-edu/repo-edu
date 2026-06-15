# CLAUDE.md

This package defines the shared workflow contract (`@repo-edu/application-contract`).

## Responsibility

`@repo-edu/application-contract` is the compile-time source of truth for:

- workflow ids and payload/result/progress/output types (`WorkflowPayloads`)
- workflow metadata (`workflowCatalog`)
- `WorkflowClient` interface
- shared `AppError` taxonomy and transport helpers
- cross-surface file reference DTOs (`UserFileRef`, `UserSaveTargetRef`)
- re-exported domain types used in workflows (`IdSequences`, `GroupSetImportFormat`, `PersistedCourse`, `LmsProviderKind`, `GitProviderKind`, etc.)
- re-exported LLM contract types (`LlmProvider`, `LlmEffort`, `LlmAuthMode`, `LlmUsage`) from `@repo-edu/integrations-llm-contract`
- examination archive key helpers (`ExaminationArchiveKey`, repository/excerpt/context fingerprinting, storage-key serialization) plus `ExaminationArchiveImportSummary` from `@repo-edu/host-runtime-contract`
- course persistence workflow entries: `course.{list,load,save,delete}` and app settings entries: `settings.{loadApp,saveCredentials,savePreferences}`
- connection draft verification: `connection.verifyLmsDraft`, `connection.listLmsCoursesDraft`, `connection.verifyGitDraft`, `connection.verifyLlmDraft`
- roster workflow entries: `roster.importFromFile`, `roster.importFromLms`, `roster.exportMembers`
- group-set workflow entries: `groupSet.fetchAvailableFromLms`, `groupSet.connectFromLms`, `groupSet.syncFromLms`, `groupSet.previewImportFromFile`, `groupSet.importFromFile`, `groupSet.export`
- git username workflow entry: `gitUsernames.import`
- repository workflow entries: `repo.create`, `repo.clone`, `repo.update`, `repo.listNamespace`, `repo.bulkClone`
- user-file workflow entries: `userFile.inspectSelection`, `userFile.exportPreview`
- validation workflow entries: `validation.roster`, `validation.assignment`
- analysis workflow entries: `analysis.run` (log-based stats + PersonDB baseline, with optional run-only course roster enrichment), `analysis.blame` (per-file blame + PersonDB overlay), and `analysis.discoverRepos` (filesystem repo discovery for active course or folder analysis surfaces); repository inputs are a strict union of course-relative paths with clone-target source data or absolute repository paths without course data. All analysis workflows use `delivery: ["desktop", "docs"]`, `progress: "granular"`, cooperative cancellation.
- examination workflow entries: `examination.generateQuestions` (LLM-generated oral exam questions per repository author from blame-attributed code), `examination.lookupQuestions` (read-only archive lookup returning the exact requested count plus available archived sets for the same generation context), plus `examination.archive.export|import` (versioned archive bundle — `EXAMINATION_ARCHIVE_BUNDLE_FORMAT` / `EXAMINATION_ARCHIVE_BUNDLE_VERSION`, `ExaminationArchiveBundle`, drift-aware re-import). All `delivery: ["desktop", "docs"]`. Docs runtime binds a stub that errors when no LLM is reachable in-browser.

## Rules

- Keep this package browser-safe.
- Do not add runtime dependencies on desktop/cli implementations.
- Do not re-introduce generated command binding systems.
- Any workflow id change must be reflected in all invoking surfaces.

# CLAUDE.md

This package defines the shared workflow contract (`@repo-edu/application-contract`).

## Responsibility

`@repo-edu/application-contract` owns browser-safe workflow types and runtime
validation for:

- workflow ids and payload/result/progress/output types (`WorkflowPayloads`)
- workflow metadata (`workflowCatalog`)
- `WorkflowClient` interface
- `workflowInputSchemas`: an exhaustive Zod input map keyed by every
  `WorkflowId`, composed from schemas at their concept owners
- exclusive command declarations, immutable input, effect-owned outcomes,
  persistence preparation and bounded authoritative settlement values
- shared `AppError` taxonomy and transport helpers
- cross-surface file reference DTOs (`UserFileRef`, `UserSaveTargetRef`)
- domain types used in workflows, imported from their concept owners (`IdSequences`,
  `GroupSetImportFormat`, `PersistedCourse`, `LmsProviderKind`, `GitProviderKind`, etc.)
- re-exported LLM contract types (`LlmProvider`, `LlmEffort`, `LlmAuthMode`, `LlmUsage`) from
  `@repo-edu/integrations-llm-contract`
- examination DTOs and cross-surface rules, including local/provider identity, archive keys, content
  scopes, source descriptors and question bounds; these live in private `src/examination/` owners
  behind the root-only `examination-contract.ts` facade
- course persistence workflow entries: `course.{list,load,save,delete}` and app settings entries:
  `settings.{loadApp,saveCredentials,savePreferences}`
- connection draft verification: `connection.verifyLmsDraft`, `connection.listLmsCoursesDraft`,
  `connection.verifyGitDraft`, `connection.verifyLlmDraft`
- roster workflow entries: `roster.importFromFile`, `roster.importFromLms`, `roster.exportMembers`
- group-set workflow entries: `groupSet.fetchAvailableFromLms`, `groupSet.connectFromLms`,
  `groupSet.syncFromLms`, `groupSet.previewImportFromFile`, `groupSet.importFromFile`,
  `groupSet.export`
- git username workflow entry: `gitUsernames.import`
- repository workflow entries: `repo.create`, `repo.clone`, `repo.update`, `repo.listNamespace`,
  `repo.bulkClone`
- user-file workflow entries: `userFile.inspectSelection`, `userFile.exportPreview`
- validation workflow entries: `validation.roster`, `validation.assignment`
- analysis workflow entries: `analysis.run` (log-based stats + PersonDB baseline, with optional
  run-only course roster enrichment), `analysis.blame` (per-file blame + PersonDB overlay), and
  `analysis.discoverRepos` (filesystem repo discovery for active course or folder analysis
  surfaces); repository inputs are a strict union of course-relative paths with clone-target source
  data or absolute repository paths without course data. All analysis workflows use
  `delivery: ["desktop"]`, `progress: "granular"`, cooperative cancellation.
- examination workflow entries: `examination.generateQuestions` (LLM-generated oral exam questions
  per repository author from blame-attributed code), `examination.lookupQuestions` (read-only
  archive lookup returning the exact requested count plus available archived sets for the same
  generation context), plus `examination.archive.export|import` (versioned archive bundle —
  `EXAMINATION_ARCHIVE_BUNDLE_FORMAT` / `EXAMINATION_ARCHIVE_BUNDLE_VERSION`,
  `ExaminationArchiveBundle`, drift-aware re-import). All use `delivery: ["desktop"]`.

## Rules

- Keep this package browser-safe.
- Do not add runtime dependencies on desktop/cli implementations.
- Do not re-introduce generated command binding systems.
- Any workflow id change must be reflected in all invoking surfaces.
- Every workflow input needs a runtime schema and contract tests. Desktop
  validates it before classification or dispatch; the catalogue does not grant admission.
- Each exclusive command declares a required course transition or no course
  transition. The application owns composition; Electron wire details stay in desktop.
- `OrdinaryWorkflowId` names the ids a hosted surface runs through its ordinary
  `WorkflowClient`. Exclusive commands and `examination.stopGeneration` run over
  their request port instead.
- An effect outcome proves refusal, stop, completion or uncertainty. Error
  categories alone cannot prove an outcome. Confirmation expiry carries its
  own unknown reason; other uncertainty and durable-owner failures are terminal.

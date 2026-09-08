# CLAUDE.md

This package contains shared workflow orchestration (`@repo-edu/application`).

## Responsibility

`@repo-edu/application` owns use-case orchestration and workflow handlers.
It runs in Node hosts and uses Node path semantics for filesystem workflows.

It composes:

- workflow contracts from `@repo-edu/application-contract`
- pure domain logic from `@repo-edu/domain`
- host/runtime ports from `@repo-edu/host-runtime-contract`
- LMS/Git integration contracts

## Key Patterns

- `create*WorkflowHandlers(...)` functions build typed handler maps.
- Long-running workflows use `WorkflowCallOptions` for progress/output/cancellation.
- App-level error normalization returns `AppError` variants.
- Save workflow handlers validate payloads at the workflow boundary, write through their host store,
  and never return a full persisted document. `settings.saveCredentials` and
  `settings.savePreferences` return no result; `course.save` returns only `{ revision, updatedAt }`.
- Course storage failures, including a row mismatch, and settings write failures
  preserve terminal storage errors for the desktop owner. They cannot become
  settleable command refusals or paused writers.
- `src/course-command-transition.ts` owns the complete next course for every
  course-changing command. It composes immutable input with the official result
  before durable save. Desktop applies the returned stamp and publishes that
  same complete course. Effect-only commands bypass this owner.
- Exclusive effect handlers report proven outcomes through `CommandOutcomeError`.
  Confirmation expiry remains an explicit unknown outcome without a result;
  other uncertainty is terminal. No caller infers disposition from an error category.
- Import/export adapters in `src/adapters/tabular/` use `papaparse` and `xlsx`;
  `src/adapters/repobee-students-parser.ts` handles RepoBee `.txt` format.
- Course persistence: `src/course-workflows.ts` (`course.list|load|save|delete`) for LMS- and
  RepoBee-backed `PersistedCourse` documents.
- Connection workflows are split: `src/connection-workflows.ts` (LMS/Git draft verification + LMS
  course listing) and `src/llm-connection-workflows.ts` (`connection.verifyLlmDraft`, exercising
  provider adapters via `LlmPort`).
- Group-set workflows live in `src/group-set-workflows/` (`file-handlers.ts`, `lms-handlers.ts`,
  `helpers.ts`, `ports.ts`). CSV import produces `NamedGroupSet`; RepoBee import produces
  `UsernameGroupSet`. Export dispatches by `nameMode` (CSV for named, TXT for unnamed).
- Git username import lives in `src/git-username-workflows.ts` (`gitUsernames.import`) and validates
  imported usernames through the Git provider client.
- Repository workflows live in `src/repository-workflows/` (also re-exported
  from `src/repository-workflows.ts`):
  `repo.create|clone|update|listNamespace|bulkClone`. `clone-execution.ts` is
  the single owner for target admission and temporary clone execution across
  planned and bulk cloning. `paths.ts` owns portable local names, clone paths
  and collision detection.
- Analysis workflows are in `src/analysis-workflows/`, assembled by `analysis-workflows.ts`
  (`createAnalysisWorkflowHandlers`): `analysis-handler.ts` (`analysis.run`),
  `snapshot-head-handler.ts` (`analysis.resolveSnapshotHead`), `blame-handler.ts`
  (`analysis.blame`), `discover-repos-handler.ts` (`analysis.discoverRepos`),
  `submission-folder-handler.ts` (`analysis.listFolderFiles`, `analysis.readFolderFile`), plus
  `log-parser.ts`, `blame-parser.ts`, `snapshot-engine.ts`, `analysis-matchers.ts`, `repo-root.ts`,
  `ports.ts` (`AnalysisWorkflowPorts` over `GitCommandPort` + `FileSystemPort`).
  `analysis-matchers.ts` owns one immutable compiled predicate set per analysis invocation.
  `repo-root.ts` validates the repository locator union: course-relative paths require clone-target
  source data, while absolute paths run without course data. There is no application-level analysis
  cache — handlers recompute against the ports on every call (a previous LRU/persistent cache was
  removed deliberately; see `analysis-workflows/CLAUDE.md`).
- Examination workflows are in `src/examination-workflows/`. `examination-workflows.ts` owns
  generation and lookup orchestration. `prompt-builder.ts` owns prompt construction and the current
  prompt-template version. `privacy-policy.ts` is the only consumer boundary for privacy preparation
  and admission. Private mechanism modules live under `privacy-policy/`. `ports.ts` wraps the
  `LlmPort` workflow dependency.
- The examination archive surface is `archive-workflows.ts` and `archive-port.ts`. Generation parses
  strict provider JSON into `ExaminationQuestion[]`. Lookup prepares a fresh privacy context and
  revalidates archive records without calling the LLM.
- Examination stream progress exposes counts and static application-owned activity labels but no raw
  provider text. Fully parsed, admitted questions are the only provider content sent to consumers.
  Common-word local names remain non-blocking because their prose use is ambiguous. Matching output
  raises one privacy warning, and source reports count unresolved occurrences.

## Rules

- Keep business semantics in domain where possible; keep orchestration here.
- Do not import Electron/Commander/React into this package.
- Keep all side effects behind explicit ports/contracts.
- Admit selected relative file paths before passing them to filesystem ports. The Node filesystem
  adapter remains responsible for real-path containment.
- Reject clone-path collisions before filesystem clone execution. Existing Git
  repositories are admitted as existing results. Files and non-Git directories
  at target paths are validation failures.
- Filesystem tests must derive paths through `node:path` and `node:os`.
  Do not use Unix-only `/tmp` literals in cross-platform workflow fixtures.

## Adding a Workflow

1. Add id/payload types, runtime input schema and metadata in
   `@repo-edu/application-contract`.
2. Implement handler in this package.
3. Assign the desktop entry and renderer operation classes, then wire the
   handler through the gateway's ordinary adapter or exclusive request owner.
   Add CLI wiring when its delivery metadata requires it.
4. Add tests at workflow and boundary levels.

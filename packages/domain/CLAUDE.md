# CLAUDE.md

This package contains pure domain types and rules (`@repo-edu/domain`).

## Responsibility

`@repo-edu/domain` is side-effect free and host-agnostic. It defines:

- canonical persisted settings section/course/roster/group/assignment types
- `PersistedCourse` as the single persisted course document type; `backing: "lms" | "repobee"` controls LMS-backed and RepoBee-backed courses, while folder analysis lives in app preferences active-surface state
- course capability helpers (`courseHasRoster`, `courseHasGroups`, `courseSupportsLms`, `courseSupportsRepoBeeGroups`) derived from `backing`
- zod validation for boundary payloads
- central ID allocator (`id-allocator.ts`): counter-based local IDs (`g_`, `gs_`, `m_`, `a_`, `ut_`) from monotonic `IdSequences`
- roster normalization, validation, reconciliation (`roster-reconciliation.ts`: `reconcileRosterFromGitUsernames` for RepoBee import) and LMS-side merge (`roster-lms-merge.ts`)
- system group-set maintenance
- discriminated `GroupSet` union (`NamedGroupSet` / `UsernameGroupSet`) on `nameMode`
- group-set import/export semantics (CSV → named sets, RepoBee → unnamed sets via `GroupSetImportFormat`)
- named pattern-matching contracts for repository discovery, analysis filters and group selection
- LMS / Git connection types (`connection.ts`) and persisted app settings sections (`settings.ts`): credentials own LMS/Git/LLM records and active credential ids, while preferences own active surface/tab, recents, folder-analysis inputs, appearance, layout and model preferences
- repository planning and collision semantics
- git analysis primitives (`src/analysis/`):
  - `types.ts` — `AnalysisConfig`, `AnalysisBlameConfig`, `AnalysisResult`, `BlameResult`, `PersonDbSnapshot`, `AuthorStats`, `FileStats`, `SupportedLanguage`
  - `schemas.ts` — Zod validation for `AnalysisConfig`/`AnalysisBlameConfig` with cross-field checks, normalization, and clamping
  - `person-merge.ts` — union-find identity merging (email OR normalized name), canonical selection by commit count
  - `person-db.ts` — stable PersonDB model with deterministic ids, `createPersonDbFromLog()` and incremental `applyBlameToPersonDb()`
  - `identity-bridge.ts` — read-only git-author-to-roster-member matching (`exact-email` | `fuzzy-name` | `unmatched`)
  - `comment-detector.ts` — language-aware full-line comment classification for blame filtering

## Rules

- No filesystem/network/process/UI imports.
- No Electron/CLI/runtime assumptions.
- Keep functions deterministic and pure for easy cross-surface reuse.
- Add or update invariant tests when behavior changes.

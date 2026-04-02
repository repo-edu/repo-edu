# CLAUDE.md

This package contains pure domain types and rules (`@repo-edu/domain`).

## Responsibility

`@repo-edu/domain` is side-effect free and host-agnostic. It defines:

- canonical persisted settings/course/roster/group/assignment types
- zod validation for boundary payloads
- central ID allocator (`id-allocator.ts`): counter-based local IDs (`g_`, `gs_`, `m_`, `a_`, `ut_`) from monotonic `IdSequences` on `PersistedCourse`
- roster normalization, validation, and reconciliation (`roster-reconciliation.ts`: `reconcileRosterFromGitUsernames` for RepoBee import)
- system group-set maintenance
- discriminated `GroupSet` union (`NamedGroupSet` / `UsernameGroupSet`) on `nameMode`
- group-set import/export semantics (CSV → named sets, RepoBee → unnamed sets via `GroupSetImportFormat`)
- repository planning and collision semantics

## Rules

- No filesystem/network/process/UI imports.
- No Electron/CLI/runtime assumptions.
- Keep functions deterministic and pure for easy cross-surface reuse.
- Add or update invariant tests when behavior changes.

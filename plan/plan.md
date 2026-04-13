# Schema as single source of truth for persisted app-settings types

## Context

The analysis sidebar persistence feature (in-progress, uncommitted) introduced
`PersistedAnalysisSidebarSettings` with both a hand-written type and a Zod schema.
This duplicates the pattern across the codebase where every field addition requires
updating two places with no compile-time coupling between them (drift guards catch
mismatches but don't eliminate duplication).

Goal: make Zod schemas the single source of truth via `z.infer` for the
**app-settings persistence tree**. Domain types stay hand-written — their schemas
use transforms that make `z.infer` output differ from input types.

## Architecture constraint

Domain module ordering: `types`(0) → `settings`(1) → ... → `schemas`(9).
Later may import earlier only. `export type { X } from "./schemas.js"` in `types.ts`
is treated as an import and violates this ordering.

Solution: move app-settings schemas from `schemas.ts` into `settings.ts` (position 1),
where they naturally belong alongside `defaultAppSettings`. The schemas only need
constants from `types.ts` (position 0), which is allowed.

## Scope

Convert to `z.infer` — schema moves to `settings.ts`, hand-written type removed
from `types.ts`:
- `PersistedAppSettings`
- `AppAppearance`
- `PersistedWindowState`
- `PersistedLmsConnection`
- `PersistedGitConnection`
- `PersistedAnalysisSidebarSettings`

Leave unchanged:
- `PersistedCourse` and domain types (schemas use transforms; drift guard stays)
- `AnalysisConfig` / `AnalysisBlameConfig` in `analysis/config-types.ts`
- Standalone aliases (`ActiveTab`, `ThemePreference`, etc.) and constants

## File changes

### `packages/domain/src/settings.ts`
- Add `import { z } from "zod"` and import `gitProviderKinds`, `persistedAppSettingsKind`
  from `./types.js`
- Move these schemas from `schemas.ts` (keep unexported):
  `persistedLmsConnectionSchema`, `persistedGitConnectionSchema`,
  `appAppearanceSchema`, `persistedWindowStateSchema`,
  `persistedAnalysisConfigSchema`, `persistedBlameConfigSchema`,
  `persistedAnalysisSidebarSettingsSchema`
- Export `persistedAppSettingsSchema` (needed by `schemas.ts` validation function)
- Export inferred types:
  ```ts
  export type PersistedLmsConnection = z.infer<typeof persistedLmsConnectionSchema>
  export type PersistedGitConnection = z.infer<typeof persistedGitConnectionSchema>
  export type AppAppearance = z.infer<typeof appAppearanceSchema>
  export type PersistedWindowState = z.infer<typeof persistedWindowStateSchema>
  export type PersistedAnalysisSidebarSettings = z.infer<typeof persistedAnalysisSidebarSettingsSchema>
  export type PersistedAppSettings = z.infer<typeof persistedAppSettingsSchema>
  ```

### `packages/domain/src/types.ts`
- Remove hand-written types: `PersistedAppSettings`, `AppAppearance`,
  `PersistedWindowState`, `PersistedLmsConnection`, `PersistedGitConnection`,
  `PersistedAnalysisSidebarSettings`
- Remove `import { AnalysisBlameConfig, AnalysisConfig } from "./analysis/config-types.js"`

### `packages/domain/src/schemas.ts`
- Remove moved schemas (7 internal + `persistedAppSettingsSchema`)
- Import `persistedAppSettingsSchema` from `./settings.js` for `validatePersistedAppSettings`
- Remove `_AppSettingsCheck` / `_appSettingsGuard` drift guard
- Update imports from `./types.js`: remove `PersistedAppSettings`

### Import path changes: `@repo-edu/domain/types` → `@repo-edu/domain/settings`

Move persistence type imports. Files that also import non-persistence types
(constants, `PersistedCourse`, `ActiveTab`, etc.) keep those in `types`.

**apps/desktop**
- `apps/desktop/src/main.ts` — `PersistedAppSettings`
- `apps/desktop/src/settings-store.ts` — `PersistedAppSettings`

**apps/cli**
- `apps/cli/src/__tests__/cli.test.ts` — `PersistedAppSettings`
- `apps/cli/src/command-utils.ts` — `PersistedAppSettings`
- `apps/cli/src/state-store.ts` — `PersistedAppSettings`

**apps/docs**
- `apps/docs/src/fixtures/docs-fixtures.ts` — `PersistedAppSettings`

**packages/application-contract**
- `packages/application-contract/src/index.ts` — `PersistedAppSettings`

**packages/application**
- `packages/application/src/settings-workflows.ts` — `PersistedAppSettings`
- `packages/application/src/workflow-helpers.ts` — `PersistedAppSettings`
- `packages/application/src/core.ts` — `PersistedAppSettings`
- `packages/application/src/__tests__/helpers/fixture-scenarios.ts` — `PersistedAppSettings`
- `packages/application/src/__tests__/helpers/test-builders.ts` — `PersistedAppSettings`

**packages/renderer-app**
- `packages/renderer-app/src/stores/app-settings-store.ts` — `PersistedAppSettings`, `PersistedGitConnection`, `PersistedLmsConnection`, `PersistedAnalysisSidebarSettings`
- `packages/renderer-app/src/stores/analysis-store.ts` — `PersistedAnalysisSidebarSettings`
- `packages/renderer-app/src/components/tabs/analysis/AnalysisSidebar.tsx` — `PersistedAnalysisSidebarSettings`
- `packages/renderer-app/src/components/settings/ConnectionsPane.shared.tsx` — `PersistedGitConnection`, `PersistedLmsConnection`
- `packages/renderer-app/src/utils/repository-workflow.ts` — `PersistedAppSettings`
- `packages/renderer-app/src/__tests__/workflow-failure.test.ts` — `PersistedAppSettings`
- `packages/renderer-app/src/__tests__/app-settings-store.test.ts` — `PersistedAppSettings`
- `packages/renderer-app/src/__tests__/repository-workflow.test.ts` — `PersistedAppSettings`

**packages/integration-tests**
- `packages/integration-tests/src/fixture-adapter.ts` — `PersistedAppSettings`
- `packages/integration-tests/src/repo-clone.test.ts` — `PersistedAppSettings`
- `packages/integration-tests/src/repo-create.test.ts` — `PersistedAppSettings`

**packages/test-fixtures**
- `packages/test-fixtures/src/fixtures.ts` — `PersistedAppSettings`
- `packages/test-fixtures/src/generator-lib.ts` — `PersistedAppSettings`
- `packages/test-fixtures/src/source-overlay.ts` — `PersistedAppSettings`

### `packages/renderer-app/src/components/tabs/analysis/AnalysisSidebar.tsx`
- Keep `maxConcurrency` destructure in persist effect (runtime safeguard —
  TypeScript structural subtyping allows assigning `AnalysisConfig` to the
  narrower inferred type, but `JSON.stringify` would include extra properties)

### Docs
- `apps/docs/src/content/docs/development/data-model.md` line 8 — update
  introductory paragraph: settings-persistence types (`PersistedAppSettings`,
  `AppAppearance`, etc.) now live in `settings.ts` alongside their Zod schemas;
  `types.ts` retains non-persistence domain types and `PersistedCourse`
- `apps/docs/src/content/docs/development/data-model.md` line 120 — update:
  drift guard text applies only to `PersistedCourse`; settings types use
  `z.infer` (no drift guard)
- `apps/docs/src/content/docs/development/contributing.md` line 57 — update:
  `PersistedAppSettings` types are now derived from schemas via `z.infer` in
  `settings.ts`; `PersistedCourse` retains a drift guard

## Verification

`pnpm check` (lint + typecheck + build:types + check:fixtures + check:architecture)

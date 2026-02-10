---
title: Design Decisions
description: Key architectural decisions
---

<!-- markdownlint-disable MD024 -->

# Design Decisions

This document captures key architectural and design decisions for future reference.

---

## CLI vs GUI Strategy

**Date:** 2024-12-01
**Status:** Decided

### Context

The repo-manage app is part of a larger suite (repo-manage, lms-api, RepoAssess) for academic
teachers managing student repositories. The original tools this work is based on (repobee) were
CLI-only, built by CS teachers for their own courses.

### Target Audience

- **Primary:** Academic teachers teaching coding (programming, Matlab, etc.)
- **Technical level:** Higher than average - they teach coding
- **Usage pattern:** Some may want to automate repetitive tasks (semester setup, batch operations)

### Decision

**GUI-first, CLI for automation only.**

The CLI should NOT maintain feature parity with the GUI. Instead:

| CLI (keep - scriptable) | GUI only (no CLI needed) |
|-------------------------|--------------------------|
| `lms import-students` - import roster | Theme settings |
| `repo create` - create student repos | Window size/position |
| `repo clone` - clone repos | Splitter position |
| `profile list/load` - for scripting | Visual preferences |
| `roster show` - inspect roster | Interactive configuration |

### Rationale

1. **Maintenance burden:** Full CLI feature parity means every feature needs CLI + GUI
   implementation, error handling, testing. This multiplies across 3 apps in the suite.

2. **Testing reality:** The Tauri GUI is easier to test than Python GUI. Development naturally
   gravitates to GUI testing.

3. **User preference:** Even technical teachers likely prefer GUI for interactive use. CLI is mainly
   valuable for automation/scripting.

4. **Original tools exist:** Teachers who want full CLI can use the original Python repobee.

5. **AI coding context:** Even with AI doing implementation, the human still needs to think about
   keeping interfaces in sync. Reducing CLI scope reduces cognitive load.

### Implications

1. **CLI becomes a "power user scripting tool"** rather than an alternative interface.

2. **Core library stays clean:** `repo-manage-core` should expose clean Rust APIs. CLI-specific code
   (argument parsing, terminal formatting) stays in `repo-manage-cli`.

3. **Error handling:** The unified `AppError` approach benefits both interfaces, but GUI-specific
   formatting is acceptable.

4. **Future CLI additions:** Only add CLI commands when there's a clear automation use case, not for
   feature parity.

### Commands to Keep in CLI

```bash
redu profile list            # List available profiles
redu profile load <n>        # Switch profile (for scripting)
redu roster show             # View roster summary
redu lms import-students     # Import students from LMS
redu lms import-groups       # Import assignment groups from LMS
redu repo create             # Create student repositories
redu repo clone              # Clone student repositories
redu validate --assignment   # Validate assignment readiness
```

### Commands to Remove/Not Implement

- Theme/appearance settings
- Window geometry
- Any purely visual configuration
- Full settings editing (use GUI or edit JSON directly)

---

## Structured Error Handling

**Date:** 2024-12-01
**Status:** Implemented

### Decision

All Tauri commands return `Result<T, AppError>` where `AppError` is a structured type:

```rust
pub struct AppError {
    pub message: String,      // User-friendly message
    pub details: Option<String>, // Technical details (optional)
}
```

### Rationale

1. **Single source of truth:** Error message formatting lives in Rust, not scattered across frontend
   catch blocks.

2. **Type-safe:** `From` traits convert `ConfigError`, `PlatformError`, `LmsError` to `AppError`.

3. **Consistent UX:** All errors show user-friendly messages with optional technical details.

### Implementation

- `src-tauri/src/error.rs` - AppError struct and From implementations
- `src/types/error.ts` - TypeScript types and `getErrorMessage()` helper
- All Tauri commands use `?` operator, errors auto-convert to AppError

---

## Nested Settings Structure

**Date:** 2024-11-30
**Status:** Implemented

### Decision

Settings use nested structure (Option B) rather than flat with prefixes:

```rust
pub struct ProfileSettings {
    pub course: CourseInfo,           // Course ID and name
    pub git_connection: Option<String>, // Reference to named git connection
    pub operations: OperationConfigs, // Repo operations settings
    pub exports: ExportSettings,      // Export format settings
}

pub struct AppSettings {
    pub theme: Theme,
    pub lms_connection: Option<LmsConnection>, // LMS credentials
    pub git_connections: HashMap<String, GitConnection>, // Named git connections
    // ... app-level settings
}
```

### Rationale

1. **Future extensibility:** Adding new apps (RepoAssess) means adding new sections, not prefixing
   everything.

2. **Clear boundaries:** Each section has clear ownership.

3. **AI refactoring:** With AI doing coding, refactoring cost is low. Cleaner architecture wins over
   implementation ease.

---

## JSON Schema ⇄ TypeScript Bindings Workflow

**Date:** 2025-12-27
**Status:** Implemented

### Decision

JSON Schemas are the source of truth for shared DTOs. TypeScript bindings and Rust DTOs are
generated from schemas via `pnpm gen:bindings`. Command signatures are checked against
`apps/repo-manage/schemas/commands/manifest.json` to prevent drift without requiring a Rust
compile.

### Rationale

1. Avoid slow Rust compilation when only regenerating bindings.
2. Keep a machine-validated contract that AI can safely update.
3. Catch drift early with parity checks and schema validation.

### Implementation

- Generator: `scripts/gen-from-schema.ts` (exposed as `pnpm gen:bindings`).
- Schemas: `apps/repo-manage/schemas/types/*.schema.json` + command manifest.
- Validation: `scripts/validate-schemas.ts` + `scripts/check-command-parity.ts` +
  `scripts/check-schema-coverage.ts`.
- Output:
  - `packages/backend-interface/src/types.ts` (domain types)
  - `packages/backend-interface/src/index.ts` (BackendAPI interface)
  - `packages/app-core/src/bindings/commands.ts` (command delegation)
  - `apps/repo-manage/src/bindings/tauri.ts` (TauriBackend)
  - `apps/repo-manage/core/src/generated/types.rs` (Rust DTOs)

---

## Unified Profile Store with Immer

**Date:** 2026-01-14
**Status:** Implemented

### Context

The original frontend architecture had 7 Zustand stores, including separate `profileSettingsStore`
and `rosterStore`. This caused race conditions when switching profiles: the two stores loaded
independently, creating timing windows where components could observe inconsistent state (e.g., new
roster with old settings). Cross-store coordination was handled by a `profileLoader` utility that
orchestrated 6 stores—a maintenance burden and source of subtle bugs.

### Decision

Consolidate profile settings and roster into a single `profileStore` with:

1. **Atomic document model** — Single `ProfileDocument` containing settings, roster, and resolved
   identity mode
2. **Single load sequence** — One `load()` function with stale detection
3. **Immer middleware** — For consistent draft-based mutations (profileStore only)
4. **Wrapper helpers** — `mutateRoster()` automatically triggers validation

### Store Architecture (After)

| Store | Responsibility |
|-------|----------------|
| `appSettingsStore` | Theme, LMS connection, git connections (app-level) |
| `profileStore` | Profile document (settings + roster) with Immer mutations |
| `connectionsStore` | Draft connection state during editing + status cleanup |
| `operationStore` | Git operation progress, validation/preflight results |
| `uiStore` | Active tab, dialog visibility |
| `outputStore` | Console output lines |

**Result: 7 stores → 6 stores**, with clearer responsibilities.

### Why Atomic Loading Fixes Race Conditions

The race condition occurred because:

1. `profileSettingsStore` and `rosterStore` loaded independently
2. When switching profiles, one might complete before the other
3. Components reading from both stores could see mismatched data

The fix:

```typescript
load: async (profileName) => {
  loadSequence += 1
  const currentLoadId = loadSequence

  const [settingsResult, rosterResult] = await Promise.all([
    commands.loadProfile(profileName),
    commands.getRoster(profileName),
  ])

  // Discard if a newer load started
  if (currentLoadId !== loadSequence) {
    return { stale: true, ... }
  }

  // Set atomically
  set((state) => {
    state.document = { settings, roster, resolvedIdentityMode }
    state.status = "loaded"
  })
}
```

Components now read from one store with one status—impossible to observe partial state.

### Why Immer (for profileStore Only)

Immer is applied selectively to `profileStore` because it has deep nesting (4-5 levels for
`roster.assignments[].groups[].members`). Other stores have flat state where spread syntax is
clearer.

**Benefits for profileStore:**

| Aspect | Without Immer | With Immer |
|--------|---------------|------------|
| Nested update | ~8 lines of spread | 1 line |
| Bug surface | Easy to forget nested spread | Impossible |
| Consistency | Mixed patterns | Uniform draft syntax |

**Example:**

```typescript
// With Immer
set((state) => {
  state.document.settings.course.name = updated_name
})

// Without Immer
set((state) => ({
  ...state,
  document: {
    ...state.document,
    settings: {
      ...state.document.settings,
      course: { ...state.document.settings.course, name: updated_name }
    }
  }
}))
```

**Why not Immer for other stores:**

| Store | Immer? | Reason |
|-------|--------|--------|
| `profileStore` | Yes | Deep nesting (roster, assignments, groups) |
| `outputStore` | No | Append-only array, simple operations |
| `connectionsStore` | No | Flat status/error maps |
| `operationStore` | No | Flat state (status, error, results) |
| `uiStore` | No | Flat booleans |
| `appSettingsStore` | No | Simple object replacements |

### Stable Selector Fallbacks

Selectors returning `roster?.students ?? []` create new array references each render, causing
infinite re-render loops. Solution: module-level stable fallbacks.

```typescript
const EMPTY_STUDENTS: Student[] = []

// In selector
const students = useProfileStore((s) => s.document?.roster?.students ?? EMPTY_STUDENTS)
```

### Quality Improvements

| Attribute | Primary Factor | Secondary Factor |
|-----------|----------------|------------------|
| Race condition fix | Atomic load + stale detection | — |
| Maintainability | Store consolidation | Wrapper helpers |
| Readability | Immer | Atomic document |
| Robustness | Stable fallbacks | Atomic updates |
| Flexibility | Immer | Clear store boundaries |

### Implementation

- `packages/app-core/src/stores/profileStore.ts` — Unified store with Immer
- `packages/app-core/src/hooks/useLoadProfile.ts` — Simplified profile loading hook
- `packages/app-core/src/hooks/useDirtyState.ts` — Now hashes single document
- Deleted: `rosterStore.ts`, `profileSettingsStore.ts`, `profileLoader.ts`

---

## Reference-Based Groups & Assignments Model

**Date:** 2026-02-01
**Status:** Implemented

### Context

The original data model embedded groups directly inside assignments (`Assignment.groups[]`) and
cached LMS group data in `LmsGroupSetCacheEntry` objects with a `kind` enum. This created several
problems:

1. **No group reuse** — The same group couldn't be shared across assignments.
2. **Unclear editability** — No way to distinguish user-editable groups from LMS-synced ones.
3. **No staff tracking** — The roster only contained students.
4. **Rigid assignment model** — Assignments were tightly coupled to specific groups.

### Decision

Adopt a **reference-based data model** with three design principles:

1. **Groups are top-level entities** with UUIDs and an `origin` field (`system` | `lms` | `local`)
   that determines editability.
2. **GroupSets reference groups by ID** instead of embedding them. A group set has a `connection`
   field describing its source (system, Canvas, Moodle, CSV import, or local).
3. **Assignments reference group sets** by ID. Group selection (via `all` with optional exclusions,
   or `pattern` with glob matching on group names) is defined on the group set itself.

### Roster Structure (After)

```text
Roster
├── connection         # Source metadata (Canvas/Moodle/import)
├── students[]         # RosterMember[] with enrollment_type = student
├── staff[]            # RosterMember[] with non-student enrollment types
├── groups[]           # Group[] — top-level entities with origin
├── group_sets[]       # GroupSet[] — reference groups by ID, with group selection
└── assignments[]      # Assignment[] — reference group sets by ID
```

### Origin-Based Editability

The `origin` field on groups and `connection` on group sets determine what the user can modify:

| Connection Kind | Group Origin | Editable | Examples |
|----------------|-------------|----------|----------|
| `system` | `system` | No | Individual Students, Staff |
| `canvas` / `moodle` | `lms` | No | LMS-synced group sets |
| `import` | `local` | Yes | CSV-imported sets |
| `null` (local) | Mixed | Partially | User-created sets (may reference LMS groups) |

### System Group Sets

Two auto-managed group sets ensure every student and staff member can be assigned:

- **Individual Students** — One group per active student, auto-updated on roster changes.
- **Staff** — One group per staff member.

These are created/repaired idempotently by `ensureSystemGroupSets()`. The backend owns their
lifecycle; the frontend calls it on roster changes.

### Group Selection Modes

Group sets use `GroupSelectionMode` to define which of their groups are active:

- **`all`** — All groups in the set, with optional `excluded_group_ids`.
- **`pattern`** — Glob match on group names (supports `*`, `?`, `[...]`, `[!...]`), also with
  optional exclusions.

Pattern validation is backend-driven via `previewGroupSelection()` to prevent frontend/backend
divergence.

### Permanent Type Distinction

Group sets are permanently typed. There is no "break connection" mechanism. To modify LMS groups
locally, users export to CSV and reimport — creating a new local group set.

### Rationale

1. **Group reuse** — Groups referenced by ID can appear in multiple group sets.
2. **Clear editability** — Origin field makes read-only vs. editable immediately clear in the UI.
3. **Staff support** — Separate `staff[]` array enables staff-specific operations.
4. **Flexible assignment model** — Glob patterns allow selecting subsets without manual group
   picking.
5. **Sync safety** — LMS-synced groups are read-only, preventing accidental local edits that
   would be overwritten on next sync.
6. **Backend authority** — Glob validation, member matching, and system set management are
   backend-driven, preventing frontend/backend drift.

### Implications

1. **CSV import/export** — Group sets can be exported to CSV (with base58-encoded UUIDs) and
   reimported with change detection (added/removed/updated/renamed groups).
2. **Member matching** — Import/sync operations match members by email (case-insensitive).
3. **Non-active cleanup** — Non-active students are automatically removed from all group
   memberships by the backend.
4. **Undo/redo** — User mutations produce Immer patches for undo/redo; system normalization
   (ensuring system sets, cleanup) is excluded from history.

### Implementation

- Schemas: `apps/repo-manage/schemas/types/` (Group, GroupSet, Assignment, RosterMember, etc.)
- Frontend: `packages/app-core/src/stores/profileStore.ts` (CRUD actions, system set ensure)
- Frontend: `packages/app-core/src/components/tabs/groups-assignments/` (sidebar + panels)
- Backend: `apps/repo-manage/core/src/` (group resolution, glob matching, CSV I/O, naming)
- Tests: `packages/app-core/src/**/*.test.ts` (30+ tests for slug, naming, import/export)

---

## No `create_missing_members` on Group Set Import

**Date:** 2026-02-01
**Status:** Decided (deferred)

### Decision

Group set import does not create roster members for emails not found in the roster. Users must
import the roster first, then import group sets.

### Rationale

1. Two-step workflow (import roster first, then groups) is acceptable for the current user base.
2. Users on unsupported LMS who export full rosters can use this workflow.
3. Cleanly addable later without architectural changes.

---

## Non-Active Students Removed from Group Memberships

**Date:** 2026-02-01
**Status:** Implemented

### Decision

When a student's status changes to non-active (`dropped` or `incomplete`), they are removed from
all group memberships by `ensureSystemGroupSets`. Group member counts are always
`member_ids.length` everywhere.

### Rationale

1. Simpler than resolve-time filtering — no "stored vs resolved" distinction.
2. The LMS already preserves dropped students for grade history; this app doesn't need to
   duplicate that.
3. Group member counts are unambiguous everywhere in the UI and exports.

---

## Roster File Import as Full Sync

**Date:** 2026-02-01
**Status:** Implemented

### Decision

Re-importing a roster from file sets absent students to `status: "dropped"`. Local additions
(`source: "local"`) are preserved. A preview with confirmation is required before dropping students.

### Rationale

Supports teachers on unsupported LMS who export full rosters. The file represents the current
state of the class, so absent students should be marked as dropped.

---

## Email-Only Member Matching for CSV Imports

**Date:** 2026-02-01
**Status:** Implemented

### Decision

All CSV import operations (roster and group set) match members by email address only
(case-insensitive). No fallback chains for `member_id` or `student_number`.

### Rationale

1. Email is the one universal field across all LMS exports.
2. Removes complexity of multi-field fallback chains.
3. One matching strategy across roster import and group set import.

---

## Minimal Group Set CSV Columns

**Date:** 2026-02-01
**Status:** Implemented

### Decision

Group set CSV format uses only 5 columns: `group_set_id`, `group_id`, `group_name`, `name`,
`email`. Six export-only columns from a previous design were removed.

### Rationale

Detailed roster fields (student_number, enrollment_type, department, etc.) belong in the roster
XLSX export, not in group set CSV. Keeping the CSV minimal makes it easier to edit externally and
reduces confusion about which fields are used on import.

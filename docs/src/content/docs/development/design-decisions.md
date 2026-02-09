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
- Validation: `scripts/validate-schemas.ts` + `scripts/check-command-parity.ts`.
- Output: `apps/repo-manage/src/bindings/types.ts`, `apps/repo-manage/src/bindings/commands.ts`,
  and `apps/repo-manage/core/src/generated/types.rs`.

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

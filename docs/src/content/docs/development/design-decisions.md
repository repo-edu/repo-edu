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

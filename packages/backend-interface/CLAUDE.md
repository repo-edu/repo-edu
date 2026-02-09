# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Purpose

`@repo-edu/backend-interface` defines the TypeScript contract between frontend code and backend
implementations. It exports:

- `BackendAPI` — the interface that backends must implement
- All domain types (`Group`, `GroupSet`, `Assignment`, `RosterMember`, `Roster`, etc.)
- Dialog and window types for platform integration

Key domain concepts: groups are top-level entities referenced by group sets; assignments
reference a group set and use a group selection mode; roster members are split into students
and staff by enrollment type. See root `CLAUDE.md` for the full data model overview.

## Generated Code

**This package contains generated code. Do not edit directly.**

Both `src/index.ts` and `src/types.ts` are generated from JSON Schemas:

```text
Source: apps/repo-manage/schemas/commands/manifest.json → src/index.ts
Source: apps/repo-manage/schemas/types/*.schema.json   → src/types.ts
```

To modify the interface or types:

1. Edit the source JSON Schema files
2. Run `pnpm gen:bindings` from the repository root
3. The generator script is `scripts/gen-from-schema.ts`

## Exports

The package provides two entry points:

```typescript
import { BackendAPI, ProgressCallback } from "@repo-edu/backend-interface"
import type { Group, GroupSet, Assignment, Roster } from "@repo-edu/backend-interface/types"
```

## Implementations

Two implementations exist:

- **Tauri backend** (`apps/repo-manage/src/bindings/commands.ts`) — wraps Rust commands
- **Mock backend** (`@repo-edu/backend-mock`) — in-memory implementation for testing/demos

Both are injected via `setBackend()` from `@repo-edu/app-core`.

# CLAUDE.md

This package contains pure domain types and rules (`@repo-edu/domain`).

## Responsibility

`@repo-edu/domain` is side-effect free and host-agnostic. It defines:

- canonical persisted settings/course/roster/group/assignment types
- zod validation for boundary payloads
- roster normalization and validation
- system group-set maintenance
- group-set import/export semantics
- repository planning and collision semantics

## Rules

- No filesystem/network/process/UI imports.
- No Electron/CLI/runtime assumptions.
- Keep functions deterministic and pure for easy cross-surface reuse.
- Add or update invariant tests when behavior changes.

# CLAUDE.md

Pure TypeScript types defining the `LmsClient` interface for LMS provider operations.

## Purpose

Declares the contract for Canvas and Moodle adapters:

- Connection verification
- Course listing
- Roster fetching (with `onProgress` callback)
- Group set listing and fetching
- Remote DTO types (`RemoteLmsMember`, `RemoteLmsGroup`, `RemoteLmsGroupSet`, `LmsFetchedGroupSet`) so LMS adapters never reuse domain entity types

`supportedLmsProviders` constant: `["canvas", "moodle"]`.

## Rules

- Browser-safe: no Node/Electron imports.
- Zero implementation — types and constants only.
- `LmsClient` is stateless: every method takes `LmsConnectionDraft` explicitly.
- Implementations live in `@repo-edu/integrations-lms`.

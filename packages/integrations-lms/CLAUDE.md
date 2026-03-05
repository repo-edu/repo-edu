# CLAUDE.md

This package contains LMS adapters (`@repo-edu/integrations-lms`).

## Responsibility

Implement Canvas and Moodle clients behind `LmsClient` from
`@repo-edu/integrations-lms-contract`.

- `src/index.ts`: provider dispatch (`createLmsClient`)
- `src/canvas/*`: Canvas adapter over `HttpPort`
- `src/moodle/*`: Moodle adapter over `HttpPort`

## Rules

- No direct global `fetch`; use injected `HttpPort`.
- Keep provider-specific HTTP/details inside this package.
- Return contract/domain shapes only; do not leak provider SDK/API response types.
- Keep business semantics in `@repo-edu/application` and `@repo-edu/domain`.

## Adding LMS Capabilities

1. Extend contract types/interfaces in `@repo-edu/integrations-lms-contract`.
2. Implement both Canvas and Moodle adapters (or explicitly document unsupported paths).
3. Add adapter tests for both providers.

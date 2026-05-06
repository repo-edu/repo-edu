# CLAUDE.md

Deterministic, runtime-generated fixture data for tests across the monorepo.

## Purpose

Provides a matrix of `PersistedCourse` + `PersistedAppSettings` + CSV/JSON artifacts, keyed by tier (`small`/`medium`/`stress`) and preset (`shared-teams`/`task-groups`/`repobee-teams`). The `repobee-teams` preset emits `courseKind: "repobee"` (no LMS connection); the LMS-backed presets emit `courseKind: "lms"`.

- `src/fixture-defs.ts` — tier/preset definitions and guards
- `src/generator-lib.ts` — seeded faker-based generation (students, staff, groups, assignments, artifacts); uses counter-based IDs (`g_`, `gs_`, `m_`, `a_`, `ut_`) with `idSequences`
- `src/fixture-matrix.ts` — builds `fixtureMatrix` via `buildFixtureMatrix()` at import time
- `src/fixtures.ts` — `FixtureMatrix`, `FixtureRecord`, `getFixture()` accessor
- `src/fixtures-validate.ts` — `validateFixtureMatrix()` used during `check:fixtures`
- `src/source-overlay.ts` — `applyFixtureSourceOverlay()` to simulate LMS-connected course state

Tier sizes: small=24 students/2 staff, medium=67/3, stress=180/8.

## Rules

- Generation is deterministic: `faker.seed()` with a computed seed from tier+preset (base seed `20260310`).
- `fixtureMatrix` is built once at module import time. Consumers must `structuredClone()` before mutating.
- `applyFixtureSourceOverlay` mutates in place — always clone the fixture first.
- Browser-safe: relies only on `@faker-js/faker` and `@repo-edu/domain`.

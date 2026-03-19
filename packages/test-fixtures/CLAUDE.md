# CLAUDE.md

Deterministic, runtime-generated fixture data for tests across the monorepo.

## Purpose

Provides a matrix of `PersistedCourse` + `PersistedAppSettings` + CSV/JSON artifacts, keyed by tier (`small`/`medium`/`stress`) and preset (`shared-teams`/`assignment-scoped`).

- `src/fixture-defs.ts` — tier/preset definitions and guards
- `src/generator-lib.ts` — seeded faker-based generation (students, staff, groups, assignments, artifacts)
- `src/fixtures.ts` — `FixtureMatrix`, `FixtureRecord`, `getFixture()` accessor
- `src/source-overlay.ts` — `applyFixtureSourceOverlay()` to simulate LMS-connected course state

Tier sizes: small=24 students/2 staff, medium=72/4, stress=180/8.

## Rules

- Generation is deterministic: `faker.seed()` with a computed seed from tier+preset (base seed `20260310`).
- `fixtureMatrix` is built once at module import time. Consumers must `structuredClone()` before mutating.
- `applyFixtureSourceOverlay` mutates in place — always clone the fixture first.
- Browser-safe: relies only on `@faker-js/faker` and `@repo-edu/domain`.

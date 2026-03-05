# CLAUDE.md

This package is the shared UI library (`@repo-edu/ui`).

## Purpose

`@repo-edu/ui` contains reusable UI primitives and helpers used by app surfaces.

Exports include:

- `@repo-edu/ui` (main index)
- `@repo-edu/ui/components/ui/*` (component entrypoints)
- `@repo-edu/ui/components/icons` (curated icon exports)
- `@repo-edu/ui/lib/*` (utilities)

## Component Conventions

- Use Radix primitives and `class-variance-authority` patterns consistently.
- Keep component APIs generic and app-agnostic.
- Re-export shared icons from `components/icons.ts` instead of ad hoc per-app icon imports.
- Avoid coupling this package to workflow/domain/business logic.

# CLAUDE.md

This package provides browser-safe host mocks (`@repo-edu/host-browser-mock`).

## Purpose

`@repo-edu/host-browser-mock` provides in-memory host capabilities for docs/tests:

- `RendererHost` behavior (file pickers, external links, environment snapshots)
- `UserFilePort` behavior (read/write text-backed file refs)

This keeps docs/runtime flows executable in a pure browser context.

## Rules

- Keep this package browser-safe (no Node/Electron APIs).
- Maintain deterministic mock behavior and seeded fixtures.
- Expose only contract-level behaviors, not app-specific state mutations.

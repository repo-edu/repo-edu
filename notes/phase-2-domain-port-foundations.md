# Phase 2 Domain and Port Foundations

Date: 2026-03-04

This note records the Phase 2 implementation pass that established the shared
contracts and browser-safe boundaries required before feature migration.

## Implemented Contracts

- `packages/domain` now defines the hand-authored persistence and domain types
  for app settings, profiles, roster, group sets, assignments, and repository
  templates.
- `packages/domain` also defines runtime validation for the new
  `repo-edu.app-settings.v1` and `repo-edu.profile.v1` persisted file formats.
- `packages/application-contract` now defines:
  - the canonical workflow definition map
  - typed workflow inputs, outputs, results, and execution metadata
  - `WorkflowClient`
  - `WorkflowEvent`
  - the shared `AppError` taxonomy plus ownership rules
  - the cross-shell `UserFileRef` / `UserSaveTargetRef` DTOs
- `packages/renderer-host-contract` now defines the renderer-safe host
  capability surface for file picking, save targets, external URL opening, and
  environment snapshots.
- `packages/host-runtime-contract` now defines `UserFilePort` alongside the
  existing `HttpPort`.
- `packages/integrations-lms-contract` and
  `packages/integrations-git-contract` now define app-owned integration
  contracts instead of placeholder package stubs.

## Proof Points

- `packages/application` now uses the new `UserFilePort` boundary through:
  - `runInspectUserFileWorkflow()`
  - `runUserFileExportPreviewWorkflow()`
- `packages/host-browser-mock` now provides:
  - an in-memory `UserFilePort`
  - a browser-safe `RendererHost` mock
- `packages/app` and `apps/docs` now exercise the opaque file-ref boundary in a
  browser-safe path.
- `apps/desktop` now wraps the typed tRPC subscription stream in a desktop
  `WorkflowClient` adapter so the renderer consumes the shared promise-based
  workflow contract rather than raw transport wiring.

## Validation

Validated with:

- `pnpm typecheck`
- `pnpm build`

Both commands passed after the Phase 2 refactor.

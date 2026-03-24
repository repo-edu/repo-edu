---
title: Catalog & Execution Profiles
description: How workflows declare their delivery surfaces and execution characteristics
---

The `workflowCatalog` in `packages/application-contract/src/index.ts` is a `Record<WorkflowId, WorkflowMetadata>` that associates every workflow with two pieces of metadata: which delivery surfaces support it, and how it behaves at runtime.

## Delivery surfaces

Each workflow declares a `delivery` array listing which surfaces support it:

```typescript
type DeliverySurface = "desktop" | "docs" | "cli"
```

Not all workflows are available everywhere. For example:

- File-selection workflows (`userFile.*`) require Electron's file dialog and are desktop-only
- Roster/group-set workflows that depend on file dialogs are desktop and docs only
- Validation workflows run on all three surfaces

The catalog is the authoritative source for which workflows run where. The CLI filters its handler registry to workflows that include `"cli"` in their delivery array. The docs demo runtime wires only workflows that include `"docs"`.

Alignment tests (`workflow-alignment.test.ts` in both `apps/docs` and `apps/cli`) enforce that every workflow marked for a surface is actually wired in that surface's runtime.

## Execution profiles

Each catalog entry includes an execution profile with two axes:

### Progress granularity

```typescript
type WorkflowProgressGranularity = "none" | "milestone" | "granular"
```

- **none** — the workflow completes instantly with no intermediate steps (e.g. `course.list`, `validation.roster`). The `progress` channel type is `never`.
- **milestone** — the workflow reports discrete logical steps (e.g. "Connecting to LMS", "Fetching roster", "Saving course"). This is the most common profile. The `progress` channel type is `MilestoneProgress`.
- **granular** — reserved for workflows that report fine-grained progress (e.g. byte-level transfer). Not currently used.

### Cancellation guarantee

```typescript
type WorkflowCancellationGuarantee = "non-cancellable" | "best-effort" | "cooperative"
```

- **non-cancellable** — the workflow is too fast or too atomic to cancel meaningfully.
- **best-effort** — the workflow involves network calls that may or may not respect the abort signal. Cancellation is attempted but not guaranteed.
- **cooperative** — the handler explicitly checks `signal.aborted` at defined points and stops cleanly.

## Reading the catalog

The catalog lives in `packages/application-contract/src/index.ts` as the `workflowCatalog` constant. Each entry looks like:

```typescript
"course.load": {
  delivery: ["desktop", "docs", "cli"],
  progress: "milestone",
  cancellation: "best-effort",
}
```

Inspect the catalog source directly for the complete list of workflows, their delivery surfaces, and execution profiles. The catalog is the single source of truth — any static table would drift as workflows are added or modified.

## Adding to the catalog

When adding a new workflow, you must add a corresponding catalog entry. See [Adding a Workflow](/repo-edu/development/workflow-adding/) for the full procedure.

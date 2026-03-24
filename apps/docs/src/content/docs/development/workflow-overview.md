---
title: Workflow Overview
description: What workflows are and how they unify execution across delivery surfaces
---

A **workflow** is a named, typed unit of work — for example `"course.load"`, `"repo.create"`, or `"connection.verifyLmsDraft"`. Workflows are the central execution abstraction of repo-edu: every user-facing operation that involves I/O, progress reporting, or error handling runs as a workflow.

## Why workflows exist

repo-edu ships three delivery surfaces: a desktop Electron app, a CLI, and a browser-based demo. Each surface has different transport mechanics (IPC, in-process, in-browser), but the underlying business logic is identical. Workflows decouple **what** the application does from **how** each surface delivers it.

A single workflow definition in `@repo-edu/application-contract` is enough for all three surfaces to execute the same operation with full type safety — typed input, typed progress events, typed output, and typed result.

## Core concepts

### Workflow ID

Every workflow has a unique string identifier following the pattern `domain.verb`, for example:

- `"course.load"`, `"course.save"`, `"course.delete"`
- `"connection.verifyLmsDraft"`, `"connection.verifyGitDraft"`
- `"repo.create"`, `"repo.clone"`, `"repo.update"`

The `WorkflowId` type is the union of all valid IDs, derived from the keys of `WorkflowPayloads`.

### WorkflowPayloads

The `WorkflowPayloads` type map in `packages/application-contract/src/index.ts` is the single source of truth. It maps each workflow ID to four typed channels:

```typescript
type WorkflowPayloads = {
  "course.load": {
    input: { courseId: string }
    progress: MilestoneProgress
    output: DiagnosticOutput
    result: PersistedCourse
  }
  // ... every other workflow
}
```

See [Payload Channels](/repo-edu/development/workflow-channels/) for what each channel means.

### WorkflowClient

`WorkflowClient` is the interface that callers use to run workflows. It has a single generic method:

```typescript
type WorkflowClient = {
  run<TId extends WorkflowId>(
    workflowId: TId,
    input: WorkflowInput<TId>,
    options?: WorkflowCallOptions<WorkflowProgress<TId>, WorkflowOutput<TId>>,
  ): Promise<WorkflowResult<TId>>
}
```

Callers never know (or care) which transport delivers the execution. The React renderer calls `client.run("course.load", { courseId })` the same way regardless of whether the client is backed by tRPC-electron IPC, an in-process handler, or a browser mock.

### WorkflowHandler

On the other side, each workflow has a handler — a function that receives the typed input and optional callbacks, and returns the typed result:

```typescript
type WorkflowHandler<TId extends WorkflowId> = (
  input: WorkflowInput<TId>,
  options?: WorkflowCallOptions<WorkflowProgress<TId>, WorkflowOutput<TId>>,
) => Promise<WorkflowResult<TId>>
```

Handlers live in `packages/application/src/` and are grouped by domain (course, connection, roster, etc.). They orchestrate calls to ports (HTTP, Git, filesystem) and domain logic.

## Domain groups

Workflows are organized into domain groups:

- **course** — list, load, save, delete courses
- **settings** — load and save application settings
- **connection** — verify LMS and Git connection drafts, list LMS courses
- **roster** — import rosters from file or LMS, export members
- **groupSet** — fetch, connect, sync, preview import, and export group sets
- **gitUsernames** — import Git usernames for roster members
- **validation** — validate roster and assignment configurations
- **repo** — create, clone, and update repositories
- **userFile** — inspect file selections and preview exports

Not all workflows are available on all surfaces. The [workflow catalog](/repo-edu/development/workflow-catalog/) declares which surfaces support each workflow.

## Where to look

| Concept | Location |
|---------|----------|
| Type definitions and catalog | `packages/application-contract/src/index.ts` |
| Workflow handlers | `packages/application/src/*-workflows.ts` |
| Desktop transport (tRPC) | `apps/desktop/src/trpc.ts` |
| Desktop client (renderer) | `apps/desktop/src/workflow-client.ts` |
| CLI transport (in-process) | `apps/cli/src/workflow-runtime.ts` |
| Docs transport (in-browser) | `apps/docs/src/demo-runtime.ts` |
| React context | `packages/renderer-app/src/contexts/workflow-client.tsx` |

---
title: Workflow Overview
description: What workflows are and how they unify execution across delivery surfaces
---

A **workflow** is a named, typed unit of work — for example `"course.load"`, `"repo.create"`, or
`"connection.verifyLmsDraft"`. Workflows are the central execution abstraction of repo-edu: every
user-facing operation that involves I/O, progress reporting, or error handling runs as a workflow.

## Why workflows exist

repo-edu ships two delivery surfaces: a desktop Electron app and a CLI. Each surface has different
transport mechanics (IPC or in-process), but the underlying business logic is identical. Workflows
decouple **what** the application does from **how** each surface delivers it.

A single workflow definition in `@repo-edu/application-contract` lets both surfaces execute the same
operation with full type safety — typed input, typed progress events, typed output, and typed
result.

## Core concepts

### Workflow ID

Every workflow has a unique string identifier following the pattern `domain.verb`, for example:

- `"course.load"`, `"course.save"`, `"course.delete"`
- `"connection.verifyLmsDraft"`, `"connection.verifyGitDraft"`
- `"repo.create"`, `"repo.clone"`, `"repo.update"`

The `WorkflowId` type is the union of all valid IDs, derived from the keys of `WorkflowPayloads`.

### WorkflowPayloads

The `WorkflowPayloads` type map in `packages/application-contract/src/workflow-payloads.ts` is the
source of truth. It maps each workflow ID to four typed channels:

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

`workflowInputSchemas` adds exhaustive runtime validation with the same keys as
`WorkflowId`. The desktop gateway validates the sender, envelope and schema
before admission or dispatch. Types alone do not validate incoming messages.

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

The CLI invokes handlers in-process. Desktop ordinary calls use a desktop-owned
tRPC adapter behind its sole gateway. Accepted exclusive commands use request
ports. Renderer features receive the session operation gateway; its owner alone
holds the raw client and reserves complete bodies through publication and
semantic follow-up. Command reservation freezes semantic changes until retirement.

Exclusive declarations state whether a command changes the course. One
application transition owner composes its complete next course from immutable
input and the official result. Durable save and renderer application consume
that same value with its host stamp. Bounded settlement applies before
acknowledgement, host release and renderer retirement. See
[Transport Adapters](/repo-edu/development/workflow-transport/).

### WorkflowHandler

On the other side, each workflow has a handler — a function that receives the typed input and
optional callbacks, and returns the typed result:

```typescript
type WorkflowHandler<TId extends WorkflowId> = (
  input: WorkflowInput<TId>,
  options?: WorkflowCallOptions<WorkflowProgress<TId>, WorkflowOutput<TId>>,
) => Promise<WorkflowResult<TId>>
```

Handlers live in `packages/application/src/` and are grouped by domain (course, connection, roster,
etc.). They orchestrate calls to ports (HTTP, Git, filesystem) and domain logic.

## Domain groups

Workflows are organized into domain groups:

- **course** — list, load, save, delete courses
- **settings** — load application settings sections and save credentials or preferences
  independently
- **connection** — verify LMS, Git, and LLM connection drafts; list LMS courses
- **roster** — import rosters from file or LMS, export members
- **groupSet** — fetch, connect, sync, preview import, and export group sets
- **gitUsernames** — import Git usernames for roster members
- **validation** — validate roster and assignment configurations
- **repo** — create, clone, update, list namespace repositories, and bulk-clone repositories
- **userFile** — inspect file selections and preview exports
- **analysis** — run log analysis, blame files, discover repositories, and browse folder files
- **examination** — generate/lookup examination questions and import/export the examination archive

Not all workflows are available on all surfaces. The
[workflow catalog](/repo-edu/development/workflow-catalog/) declares which surfaces support each
workflow.

## Where to look

| Concept | Location |
|---------|----------|
| Type definitions and catalog | `packages/application-contract/src/index.ts` |
| Workflow handlers | `packages/application/src/*-workflows.ts` |
| Runtime input schemas | `packages/application-contract/src/workflow-input-schemas.ts` |
| Desktop gateway | `apps/desktop/src/desktop-entry-gateway.ts` |
| Ordinary transport | `apps/desktop/src/desktop-trpc-adapter.ts` |
| Exclusive settlement | `apps/desktop/src/host-command-settlement.ts` |
| Course transition owner | `packages/application/src/course-command-transition.ts` |
| Desktop client (renderer) | `apps/desktop/src/workflow-client.ts` |
| Renderer session owner | `packages/renderer-app/src/session/session-controller.ts` |
| Renderer operation owner | `packages/renderer-app/src/session/session-operations.ts` |
| CLI transport (in-process) | `apps/cli/src/workflow-runtime.ts` |
| React context | `packages/renderer-app/src/contexts/workflow-client.tsx` |

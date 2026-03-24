---
title: Adding a Workflow
description: Step-by-step guide to adding a new workflow to the system
---

This guide walks through adding a new workflow end-to-end. The example assumes a workflow called `"course.archive"` that archives a course.

## 1. Define the workflow ID and payloads

In `packages/application-contract/src/index.ts`, add an entry to `WorkflowPayloads`:

```typescript
"course.archive": {
  input: { courseId: string }
  progress: MilestoneProgress
  output: DiagnosticOutput
  result: undefined
}
```

Choose the appropriate channel types:

- Use `MilestoneProgress` / `DiagnosticOutput` if the workflow has observable steps
- Use `never` for channels that won't emit events
- Use `undefined` for result if the workflow has no meaningful return value

## 2. Add a catalog entry

In the same file, add an entry to `workflowCatalog`:

```typescript
"course.archive": {
  delivery: ["desktop", "cli"],
  progress: "milestone",
  cancellation: "best-effort",
}
```

Decide:

- **delivery** — which surfaces should support this workflow
- **progress** — `"none"` for instant, `"milestone"` for step-based, `"granular"` for fine-grained
- **cancellation** — `"non-cancellable"`, `"best-effort"`, or `"cooperative"`

## 3. Implement the handler

In `packages/application/src/`, add the handler to the appropriate factory. For a course workflow, that's `course-workflows.ts`:

```typescript
"course.archive": async (input, options) => {
  options?.onProgress?.({ step: 1, totalSteps: 2, label: "Loading course" })
  const course = await ports.courseStore.loadCourse(input.courseId, options?.signal)
  if (!course) {
    throw { type: "not-found", message: `Course ${input.courseId} not found`, resource: "course" }
  }

  options?.onProgress?.({ step: 2, totalSteps: 2, label: "Archiving" })
  options?.onOutput?.({ channel: "info", message: `Archiving course ${course.name}` })
  await ports.courseStore.saveCourse({ ...course, archived: true }, options?.signal)
}
```

Key patterns:

- Call `onProgress` at each logical step
- Call `onOutput` for diagnostic messages
- Throw typed `AppError` objects for failures
- Pass `options?.signal` to async operations for cancellation support

## 4. Wire into desktop

If the handler was added to an existing factory (e.g. `createCourseWorkflowHandlers`), it auto-registers — the factory's return value is spread into the desktop router in `apps/desktop/src/trpc.ts` via `createDesktopWorkflowRegistry()`.

If you created a new handler factory, add its spread to `createDesktopWorkflowRegistry()`:

```typescript
...createMyNewWorkflowHandlers(ports),
```

The tRPC router automatically generates subscription procedures for every entry in the registry.

## 5. Wire into CLI

If the workflow includes `"cli"` in its delivery array:

1. Add the handler to `createCliWorkflowHandlers()` in `apps/cli/src/workflow-runtime.ts`
2. Add a Commander command in `apps/cli/src/commands/` that calls `workflowClient.run("course.archive", input)`

## 6. Wire into docs

If the workflow includes `"docs"` in its delivery array:

Add the handler to the workflow handlers object in `apps/docs/src/demo-runtime.ts`, providing mock port implementations as needed.

## 7. Add tests

- Add a workflow behavior test in `packages/application/src/__tests__/` that verifies the handler's logic with mock ports
- Existing alignment tests catch missing wiring:
  - `apps/docs/src/__tests__/workflow-alignment.test.ts` — verifies every docs-delivered workflow is wired in the demo runtime
  - `apps/cli/src/__tests__/workflow-alignment.test.ts` — verifies every CLI-delivered workflow is wired in the CLI runtime
  - Note: there is no equivalent desktop alignment test currently

## Checklist

- [ ] `WorkflowPayloads` entry with all four channels
- [ ] `workflowCatalog` entry with delivery and execution profile
- [ ] Handler implementation in `packages/application/src/`
- [ ] Desktop wiring (if desktop-delivered)
- [ ] CLI wiring + Commander command (if CLI-delivered)
- [ ] Docs wiring + mock ports (if docs-delivered)
- [ ] Behavior test in `packages/application/src/__tests__/`
- [ ] Alignment tests pass (`pnpm test`)

## Contract evolution

When modifying an existing workflow (not adding a new one), changes propagate through the same layers:

1. **Update contract types and metadata** in `packages/application-contract/src/index.ts`. Changing `WorkflowPayloads` entries or `workflowCatalog` metadata will produce type errors in every handler and caller that needs updating — follow the compiler.

2. **Update handlers** in `packages/application/src/`. Adjust the implementation to match the new types.

3. **Update surface wiring** for each surface in the workflow's `delivery` array: desktop router/client, CLI runtime + Commander command, docs runtime.

4. **Update tests.** Behavior tests in `packages/application/src/__tests__/` must match the new contract. Alignment tests (`pnpm test`) will catch missing wiring automatically.

The source of truth is always `packages/application-contract/src/index.ts`. The [guardrail tests](/development/contributing/#guardrail-tests) enforce that all surfaces stay in sync with the catalog.

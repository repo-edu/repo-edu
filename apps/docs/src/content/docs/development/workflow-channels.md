---
title: Payload Channels
description: The four typed channels that define a workflow's communication contract
---

Every workflow in `WorkflowPayloads` maps to four typed channels: **input**, **progress**, **output**, and **result**. These channels form the complete communication contract between a workflow caller and its handler.

## The four channels

### input

What the caller provides to start the workflow. Can be a structured object or `undefined` for queries that need no parameters.

```typescript
// Structured input
"course.load": { input: { courseId: string } }

// No input needed
"course.list": { input: undefined }
```

### progress

Intermediate status updates emitted during execution, used to drive progress bars and step indicators in the UI. Workflows that complete instantly use `never` (no progress events).

The standard progress type is `MilestoneProgress`:

```typescript
type MilestoneProgress = {
  step: number       // Current step (1-based)
  totalSteps: number // Total number of steps
  label: string      // Human-readable description of the current step
}
```

Handlers emit progress by calling `options.onProgress`:

```typescript
options?.onProgress?.({ step: 1, totalSteps: 3, label: "Connecting to LMS" })
```

### output

Diagnostic messages emitted during execution — informational logs, warnings, or raw process output. Workflows that produce no diagnostic output use `never`.

The standard output type is `DiagnosticOutput`:

```typescript
type DiagnosticOutput = {
  channel: "info" | "warn" | "stdout" | "stderr"
  message: string
}
```

The CLI surfaces these on stderr/stdout. The desktop UI may display them in a log panel.

### result

The typed return value on successful completion. Can be a structured object or `undefined` for fire-and-forget operations.

```typescript
"course.load":   { result: PersistedCourse }
"course.delete": { result: undefined }
"repo.create":   { result: RepositoryCreateResult }
```

## WorkflowCallOptions

The `options` parameter passed to `WorkflowClient.run()` and `WorkflowHandler` provides callbacks for progress and output, plus an `AbortSignal` for cancellation:

```typescript
type WorkflowCallOptions<TProgress, TOutput> = {
  onProgress?: (event: TProgress) => void
  onOutput?: (event: TOutput) => void
  signal?: AbortSignal
}
```

- `onProgress` — called by the handler at each milestone step
- `onOutput` — called by the handler when emitting diagnostic messages
- `signal` — an `AbortSignal` that the handler checks for cancellation requests

## WorkflowEvent

When workflows cross a transport boundary (like tRPC-electron), events are serialized as a discriminated union:

```typescript
type WorkflowEvent<TProgress, TOutput, TResult> =
  | { type: "progress"; data: TProgress }
  | { type: "output"; data: TOutput }
  | { type: "completed"; data: TResult }
  | { type: "failed"; error: AppError }
```

The desktop tRPC router emits `WorkflowEvent` values over subscriptions. The renderer-side client unpacks them back into `onProgress`/`onOutput` callbacks and a resolved/rejected promise.

In-process transports (CLI, docs) skip serialization entirely — callbacks are called directly.

## Type extraction helpers

The contract package exports helper types to extract individual channels from `WorkflowPayloads`:

```typescript
WorkflowInput<TId>    // WorkflowPayloads[TId]["input"]
WorkflowProgress<TId> // WorkflowPayloads[TId]["progress"]
WorkflowOutput<TId>   // WorkflowPayloads[TId]["output"]
WorkflowResult<TId>   // WorkflowPayloads[TId]["result"]
WorkflowEventFor<TId> // WorkflowEvent<Progress, Output, Result> for TId
```

These are used throughout the codebase to derive types without repeating them.

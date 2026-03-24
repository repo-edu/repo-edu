---
title: Error Taxonomy
description: The AppError discriminated union and how errors propagate through the workflow system
---

All workflow errors are represented as `AppError` — a discriminated union on the `type` field defined in `packages/application-contract/src/index.ts`. This gives every layer a consistent, typed error vocabulary.

## AppError variants

### transport

IPC or bridge-level failure. Only transport adapters create these.

```typescript
{ type: "transport"; message: string; reason: TransportErrorReason; retryable: boolean }
```

`TransportErrorReason` is `"ipc-disconnected" | "serialization" | "host-crash" | "timeout"`.

Created by the desktop renderer client when tRPC subscriptions fail, time out, or disconnect.

### cancelled

The workflow was aborted via `AbortSignal`.

```typescript
{ type: "cancelled"; message: string }
```

Created by handlers or transport adapters when `signal.aborted` is detected.

### validation

Domain validation failure. Carries structured issues for display.

```typescript
{ type: "validation"; message: string; issues: AppValidationIssue[] }
```

Created by application-layer handlers when input or domain state fails validation rules.

### not-found

A required resource does not exist.

```typescript
{ type: "not-found"; message: string; resource: "connection" | "course" | "group-set" | "assignment" | "repository" | "file" }
```

Created by handlers when a lookup returns nothing (e.g. loading a course that was deleted).

### conflict

A write or identity collision.

```typescript
{ type: "conflict"; message: string; resource: "course" | "connection" | "group-set" | "assignment" | "repository" | "file"; reason: string }
```

Created by handlers when an operation would violate uniqueness or consistency constraints.

### provider

LMS, Git, or subprocess adapter failure.

```typescript
{ type: "provider"; message: string; provider: LmsProviderKind | GitProviderKind | "git"; operation: string; retryable: boolean }
```

Created by handlers when an external service call fails (API error, authentication failure, rate limit).

### persistence

Settings, course, or user-file storage failure.

```typescript
{ type: "persistence"; message: string; operation: "read" | "write" | "decode" | "encode"; pathHint?: string }
```

Created at the storage boundary when file I/O or serialization fails.

### unexpected

Catch-all for unclassified errors.

```typescript
{ type: "unexpected"; message: string; retryable: boolean }
```

Created when an error doesn't fit any other category. Indicates a bug or unhandled edge case.

## Error ownership

Each layer is responsible for creating specific error types:

| Error type | Created by |
|------------|------------|
| `transport` | Transport adapters only (desktop renderer client) |
| `cancelled` | Transport adapters or handlers |
| `validation` | Application-layer handlers |
| `not-found` | Application-layer handlers |
| `conflict` | Application-layer handlers |
| `provider` | Application-layer handlers (normalizing adapter errors) |
| `persistence` | Storage ports / application-layer handlers |
| `unexpected` | Any layer (last resort) |

## Helper functions

```typescript
createTransportAppError(reason, message, retryable?)  // → transport AppError
createCancelledAppError(message?)                      // → cancelled AppError
isAppError(value)                                      // → boolean type guard
```

## Error propagation through transports

### Desktop (tRPC)

Handlers throw `AppError` instances. The tRPC router catches them in `emitFailure()`, which:

1. Checks if the error is already an `AppError` (passes through)
2. Otherwise wraps it as `unexpected`
3. Emits a `{ type: "failed", error }` event on the subscription

The renderer client receives the `failed` event and rejects the `run()` promise with the `AppError`.

### CLI (in-process)

Errors bubble directly from the handler to the Commander error handler. No serialization or wrapping occurs — the `AppError` is thrown and caught as-is.

### Docs (in-browser)

Same as CLI — errors propagate directly. The React UI catches them and displays appropriate feedback.

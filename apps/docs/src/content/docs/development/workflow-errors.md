---
title: Error Taxonomy
description: The AppError discriminated union and how errors propagate through the workflow system
---

`AppError` describes workflow failures. Exclusive commands separately carry
effect-owned dispositions: refusal, stop, completion or uncertainty. A category
alone cannot prove whether an effect happened. Durable-owner failures enter
desktop terminal handling instead of a recoverable settlement.

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
{ type: "provider"; message: string; provider: LmsProviderKind | GitProviderKind | "git" | "llm"; operation: string; retryable: boolean }
```

Created by handlers when an external service call fails (API error, authentication failure, rate
limit).

### persistence

Settings or user-file storage failure. Course storage has its own terminal variant.

```typescript
{ type: "persistence"; message: string; operation: "read" | "write" | "decode" | "encode"; retryable: boolean; pathHint?: string }
```

Created when file I/O or serialisation fails. A retryability field does not
authorise desktop to retry a failed durable owner. Settings write failures are
terminal; user-file effects need their own proven disposition.

### course-storage

Every course-store failure, including a row mismatch, is terminal:

```typescript
{ type: "course-storage"; message: string }
```

A missing course on load remains an expected absent result at the store and
becomes `not-found` at the workflow boundary. A failed course write cannot
become a settleable conflict or a paused writer.

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
| `persistence` | Application-layer handlers normalizing storage-port failures |
| `course-storage` | Course adapters and application handlers; terminal on desktop |
| `unexpected` | Any layer (last resort) |

## Helper functions

```typescript
createTransportAppError(reason, message, retryable?)  // → transport AppError
createCancelledAppError(message?)                      // → cancelled AppError
isAppError(value)                                      // → boolean type guard
```

## Error propagation through transports

### Desktop ordinary calls

The desktop-owned tRPC adapter receives only gateway-validated input. The router
preserves expected `AppError` values and wraps unclassified errors as
`unexpected`. Expected failures emit a `failed` event. Course-storage and
settings-store failures enter terminal admission before the call retires.
Invalid senders, envelopes and request stages also enter terminal shutdown.

### Desktop exclusive commands

`CommandOutcomeError` preserves the effect owner's official outcome. Proven
refusal, stop and completion can settle through the request port while owners
remain healthy. Confirmation expiry settles as unknown without a result,
course transition or settlement reads. The producer warns once and the session
continues after acknowledgement, host release and renderer retirement. The
unknown action is never retried. Other uncertainty and durable failures are terminal.

### CLI (in-process)

Errors bubble directly from the handler to the Commander error handler. No serialization or wrapping
occurs — the `AppError` is thrown and caught as-is.

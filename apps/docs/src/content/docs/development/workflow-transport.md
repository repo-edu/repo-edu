---
title: Transport Adapters
description: Desktop gateway, ordinary tRPC calls, exclusive request ports and CLI execution
---

Desktop and CLI share workflow contracts and application handlers. Electron's
main process hosts desktop application work; the CLI calls handlers in-process.
The renderer reaches desktop through one validated gateway.

## Desktop entry and ordinary calls

`desktop-entry-gateway.ts` is the only renderer IPC registration owner. It
installs before the initial document load and proves the current window and main
frame before reading message identity. It validates the complete envelope and
input with Zod. `workflowInputSchemas` in `application-contract` has exactly one
schema for every `WorkflowId`, reusing schemas from their concept owners.

Ordinary calls use `desktop-trpc-link.ts` and `desktop-trpc-adapter.ts`, owned by
desktop and built on public tRPC APIs. The adapter receives only validated
messages. It records accepted-call identity before asynchronous dispatch and
settles each host call once. A valid unknown, late or duplicate
`subscription.stop` is an idempotent no-op. Sender or schema violations enter
terminal shutdown before admission or handler execution.

`createDesktopWorkflowRegistry(ports)` in `trpc.ts` composes the application
handlers. `createDesktopWorkflowRouter(registry)` exposes subscription
procedures. `createDesktopWorkflowClient()` delivers ordinary progress, output
and a final completed or failed event through those procedures. Host admission
refusal has its own browser-safe result; it is not a storage failure.

`HostAdmission` owns starts. Startup calls are accepted in `starting`, ordinary
calls in `interactive`. Bootstrap acknowledgement requires all startup calls to
have settled. Exclusive intent requires no accepted ordinary calls. Shell
actions have fixed definitions; lifetime actions still go through the reducer.

## Exclusive commands

The renderer session operation owner reserves the whole body and freezes
semantic changes and worker starts before intent. Preload retains a message
port and transfers its peer with the intent. Busy and accepted responses go
only to that attempt's endpoint. Once accepted, the live port and reducer stage
authorise every message; there is no detached attempt identity.

The accepted request follows this order:

1. Host requests preparation. The session settles accepted saves and sends
   eligible dirty snapshots. Main commits the bundle through application handlers.
2. Renderer applies committed stamps, then captures immutable command input.
3. Host validates input and executes the command. Progress and streamed output
   are allowed only while running.
4. The effect owner fixes the official outcome. For a course-changing command,
   `composeCourseCommandTransition` in `application` composes the complete next
   course. Main saves it, applies its host stamp and sends that same course.
   Effect-only commands declare no course transition. Other declared
   authoritative values are read before settlement is sent.
5. Renderer applies settlement without an ordinary reload, acknowledges it and
   waits for host admission release before retiring its transaction.

Cancellation before execution prevents the effect but lets accepted persistence
settle. During execution it is forwarded once. After the official outcome is
fixed it cannot change that outcome. `examination.stopGeneration` is current-port
control and has no independent workflow start.

The effect owner proves refusal, stop, completion or uncertainty. Confirmation
expiry during a session settles as unknown with no command result, course
transition or settlement reads. Preparation stamps remain applied. The producer
warns once and the request acknowledges, releases and retires normally. The
unknown action is never retried. Other uncertainty and durable-owner failures
are terminal.

`host-request-transport.ts`, `preload-request-transport.ts` and the
`request-port-*` modules own endpoint retention, validation, stages and cleanup.
Malformed, duplicate, late or out-of-stage request messages and unexpected
current-port loss are terminal. The ordinary-stop idempotency rule does not
apply to request-port messages.

## Clean close and update restart

Interactive close enters `closing.draining`, refuses new calls and waits for
accepted ordinary calls to settle. Main then transfers one close port. Its
renderer body queues behind existing session work, stops worker starts at its
turn, prepares persistence and acknowledges ready. A save refused while close
drains keeps its dirty snapshot eligible for this preparation.

Accepted close never returns to interactive admission. Close during startup or
a command uses `closing.aborting` and skips another renderer preparation. Both
paths ask the child-process controller to end owned work before process exit.
Update restart is accepted only from interactive admission and uses the same
clean sequence. Installation starts only after confirmed ending.

The [architecture guide](/repo-edu/development/architecture/#desktop-process-lifetime)
describes detected failure, fatal entry and process-owned gate release.

## Fixed entry inventories

Each entry list has its own owner: gateway workflow starts and direct actions,
request-port messages, reducer starts, terminal sources, fatal sources,
same-program starts, main-process menu actions, updater menu actions, safe native
roles and updater presentation messages. Architecture checks compare their
actual declarations and registrations against those separate lists. Missing,
extra or differently classified entries fail. The workflow catalogue alone
does not grant admission.

## Renderer and CLI wiring

`RendererSessionRoot` gives ordinary and exclusive clients to the session owner.
Features receive `SessionOperationGateway` through `useWorkflowClient()` or the
non-React getter. A direct or Query-backed body keeps callbacks, publication and
semantic follow-up inside its reservation. Presentation-only calls cannot commit
session state. See [Renderer App](/repo-edu/development/renderer-app/).

`apps/cli/src/workflow-runtime.ts` composes CLI-delivered handlers and invokes
them in-process. Commander commands own terminal output and cancellation. The
CLI shares durable adapters and the program gate with desktop, but has no
renderer session or Electron transport.

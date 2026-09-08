---
title: Adding a Workflow
description: Contract, admission, session ownership and verification for a new workflow
---

A workflow needs a typed contract, runtime input validation, a handler and an
explicit owner on each delivery surface. Desktop classification is separate
from delivery metadata. A new catalogue entry does not grant host admission.

## 1. Define the shared contract

Add input, progress, output and result types to `WorkflowPayloads` in
`packages/application-contract/src/workflow-payloads.ts`, exported through the
package root. Add delivery, progress and cancellation metadata to
`workflowCatalog`.

Add the matching Zod schema to `workflowInputSchemas`. Reuse schemas from their
browser-safe concept owners. The map must have exactly the `WorkflowId` keys.
Add representative valid and invalid input fixtures to the contract tests.

For an exclusive command, extend `exclusiveCommandDeclarations` and its closed
input/outcome/settlement contracts. Declare whether it requires a course
transition. Define any bounded authoritative values needed at settlement.
Keep Electron wire details out of shared contracts.

## 2. Implement the application handler

Use the appropriate `create*WorkflowHandlers` factory in
`packages/application`. Keep business rules in domain and effects behind ports.
Pass cancellation and report progress/output through `WorkflowCallOptions`.

Ordinary expected failures use `AppError`. Exclusive effect outcomes must prove
refusal before mutation, stop, completion or uncertainty. Preserve the
producer's `confirmation-expired` reason for unknown outcomes. Do not infer
disposition from error categories or cancellation state.

Course and settings storage failures are terminal on desktop, including course
row mismatches. Save handlers return no full document: settings saves return
no value and course saves return only `{ revision, updatedAt }`.

For a course-changing command, add its composition to
`course-command-transition.ts`. Compose immutable input and the official result
into one complete next course before durable save. The desktop settlement owner
saves and publishes that same course with its host stamp. Features must not
repeat the composition. Effect-only commands bypass this owner.

## 3. Assign desktop admission and transport

Assign the workflow's host start class in `host-entry-inventory.ts` and its
renderer class in `session-operation-inventory.ts`. Extend the matching
architecture inventory so it checks the actual declarations. New entry classes
or product decisions require a plan decision; do not create an unclassified route.

Wire the handler into `createDesktopWorkflowRegistry` in `trpc.ts`.
Ordinary workflows use the desktop-owned tRPC adapter through the gateway.
Exclusive commands use the request owner after host acceptance and persistence
preparation. Add command wire schemas for prepared input, progress, output and
settlement in the existing desktop schema owners.

Only `desktop-entry-gateway.ts` may register renderer IPC. A feature cannot
install a raw listener, retain the raw client or bypass sender/input validation.
A new direct action, request message, lifecycle source, native menu action or
updater message must update its own separate list and check.

## 4. Keep renderer publication inside the body

Features use `SessionOperationGateway`. Reserve the entire session-changing
body, including callbacks, Query publication and explicit semantic follow-up.
Use `scope.publish` for state publication and `scope.follow` for asynchronous
follow-up. React effects may present a result but cannot commit semantic state.
Read-only results that supply command input remain session-changing.

An exclusive reservation freezes semantic edits and worker starts until
retirement. Input capture follows committed preparation stamps. Settlement
application precedes acknowledgement, host release and retirement. Cancellation
uses the current command port, never a separate workflow start.

## 5. Wire CLI delivery

For a CLI-delivered workflow, add its handler to the CLI runtime and invoke it
from the appropriate Commander command. The CLI runs in-process and shares
application handlers, durable adapters and program exclusion with desktop.
It does not implement renderer admission or request ports.

## 6. Verify the behaviour and boundaries

Add package-boundary tests for the handler's observable behaviour. Contract
tests cover schema completeness and closed outcomes. Desktop tests cover
admission, request stages and settlement where applicable. Course-changing
commands must prove saved and applied course equality, including host stamps.

Run workspace `pnpm check` and `pnpm test`. These include architecture and
alignment checks. Runtime artifact builders are run by the user.

## Changing an existing workflow

Update payloads, metadata, runtime schemas and all consuming surfaces together.
A classification change also updates the separate desktop and renderer
inventories. A settlement change updates its transition, wire validation and
application tests. Type errors identify consumers; runtime and architecture
checks prove the input and ownership boundaries.

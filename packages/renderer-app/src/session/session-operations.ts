import type {
  WorkflowCallOptions,
  WorkflowClient,
  WorkflowId,
  WorkflowInput,
  WorkflowOutput,
  WorkflowProgress,
  WorkflowResult,
} from "@repo-edu/application-contract"
import {
  isSessionWorkflow,
  type PresentationDirectId,
  type PresentationWorkflowId,
  type SessionDirectId,
  type SessionOperationId,
  type SessionWorkflowId,
  sessionDirectClasses,
  sessionOperationKind,
  sessionWorkflowClasses,
} from "./session-operation-inventory.js"
import {
  canAdmitSessionChange,
  type SessionControllerSnapshot,
} from "./session-reducer.js"
import {
  SessionSurfaceTransactions,
  type SessionTransactionScope,
} from "./session-surface-transactions.js"
import type { AppWorkflowId, ControllerWorkflowId } from "./workflow-types.js"

type CallOptions<K extends WorkflowId> = WorkflowCallOptions<
  WorkflowProgress<K>,
  WorkflowOutput<K>
>

export type SessionOperationScope = {
  run<K extends SessionWorkflowId>(
    id: K,
    input: WorkflowInput<K>,
    options?: CallOptions<K>,
  ): Promise<WorkflowResult<K>>
  direct<T>(id: SessionDirectId, start: () => Promise<T>): Promise<T>
  /** Hold asynchronous callback work, publication and semantic follow-up. */
  follow<T>(body: () => Promise<T>): Promise<T>
  /** Publish only while this admitted body still owns its turn. */
  publish<T>(apply: () => T): T
  canContinue(): boolean
}

export type SessionOperationReservation<T> = {
  run(body: (scope: SessionOperationScope) => Promise<T>): Promise<T>
  cancel(error?: unknown): Promise<T>
}

export type SessionOperationGateway = {
  // A complete single-call body. Callers with publication or semantic follow-up
  // reserve explicitly and keep that work inside the supplied body.
  run<K extends AppWorkflowId>(
    id: K,
    input: WorkflowInput<K>,
    options?: CallOptions<K>,
  ): Promise<WorkflowResult<K>>
  presentation<K extends PresentationWorkflowId>(
    id: K,
    input: WorkflowInput<K>,
    options?: CallOptions<K>,
  ): Promise<WorkflowResult<K>>
  presentationDirect<T>(
    id: PresentationDirectId,
    start: () => Promise<T>,
  ): Promise<T>
  reserve<T>(
    operation: SessionOperationId,
  ): SessionOperationReservation<T> | null
  change(apply: () => void): boolean
}

/** The session's only raw client holder. The inherited queue is the existing
 * transaction queue; classification and publication introduce no second queue. */
export class SessionOperations extends SessionSurfaceTransactions {
  constructor(
    private readonly client: WorkflowClient,
    callbacks: ConstructorParameters<typeof SessionSurfaceTransactions>[0],
    private readonly snapshot: () => SessionControllerSnapshot,
  ) {
    super(callbacks)
  }

  readonly gateway: SessionOperationGateway = {
    run: (id, input, options) => this.runFeature(id, input, options),
    presentation: (id, input, options) => this.present(id, input, options),
    presentationDirect: async (id, start) => {
      if (sessionDirectClasses[id] !== "presentation-only")
        throw new Error("The direct action is not presentation-only.")
      if (this.snapshot().lifecycle.kind !== "live")
        throw new Error("The session is not accepting presentation calls.")
      return await start()
    },
    reserve: (operation) => this.reserveOperation(operation),
    change: (apply) => {
      if (!canAdmitSessionChange(this.snapshot())) return false
      apply()
      return true
    },
  }

  // These calls already belong to bootstrap, surface transactions or the
  // persistence owners. They never reserve recursively inside their own turn.
  // Request-owned worker preparation is integrated in steps 9–11.
  get controllerClient(): WorkflowClient<ControllerWorkflowId> {
    return {
      run: (id, input, options) => {
        if (this.snapshot().lifecycle.kind === "disposed")
          return Promise.reject(new Error("The session is disposed."))
        return this.client.run(id, input, options)
      },
    }
  }

  private reserveOperation<T>(
    operation: SessionOperationId,
  ): SessionOperationReservation<T> | null {
    const reservation = this.reserve<T>({
      kind: sessionOperationKind(operation),
      operation,
    })
    if (reservation === null) return null
    return {
      run: (body) =>
        reservation.run((scope) => body(this.operationScope(scope, operation))),
      cancel: reservation.cancel,
    }
  }

  private operationScope(
    scope: SessionTransactionScope,
    operation: SessionOperationId,
  ): SessionOperationScope {
    const publish = <T>(apply: () => T): T => {
      if (!scope.canContinue())
        throw new Error("The session operation has retired.")
      return apply()
    }
    return {
      run: (id, input, options) =>
        this.runScoped(scope, operation, id, input, options),
      direct: (id, start) =>
        scope.required(() => {
          if (id !== operation)
            throw new Error(
              "The direct action does not belong to this reservation.",
            )
          return start()
        }),
      follow: (body) => scope.required(body),
      publish,
      canContinue: () => scope.canContinue(),
    }
  }

  private runScoped<K extends WorkflowId>(
    scope: SessionTransactionScope,
    operation: SessionOperationId,
    id: K,
    input: WorkflowInput<K>,
    options?: CallOptions<K>,
  ): Promise<WorkflowResult<K>> {
    const callback = <T>(apply: ((event: T) => void) | undefined) =>
      apply === undefined
        ? undefined
        : (event: T): void => {
            // TypeScript permits async functions in a void callback slot. Retain
            // their actual promise so transport completion cannot retire them.
            void scope.required(async () => apply(event)).catch(() => undefined)
          }
    return scope.required(() => {
      const classification = sessionWorkflowClasses[id]
      if (
        classification !== "session-changing" &&
        (classification !== "command" || id !== operation)
      )
        throw new Error("The workflow does not belong to this reservation.")
      return this.client
        .run(id, input, {
          signal: options?.signal,
          onProgress: callback(options?.onProgress),
          onOutput: callback(options?.onOutput),
        })
        .then((result) => {
          if (!scope.canContinue())
            throw new Error("The session operation has retired.")
          return result
        })
    })
  }

  private present<K extends WorkflowId>(
    id: K,
    input: WorkflowInput<K>,
    options?: CallOptions<K>,
  ): Promise<WorkflowResult<K>> {
    if (sessionWorkflowClasses[id] !== "presentation-only")
      return Promise.reject(new Error("The workflow is not presentation-only."))
    if (this.snapshot().lifecycle.kind !== "live")
      return Promise.reject(
        new Error("The session is not accepting presentation calls."),
      )
    return this.client.run(id, input, options)
  }

  private runFeature<K extends AppWorkflowId>(
    id: K,
    input: WorkflowInput<K>,
    options?: CallOptions<K>,
  ): Promise<WorkflowResult<K>> {
    const classification = sessionWorkflowClasses[id]
    if (classification === "presentation-only")
      return this.present(id, input, options)
    if (classification === "request-control")
      return Promise.reject(
        new Error("Cancellation belongs to the current request port."),
      )
    if (!isSessionWorkflow(id))
      return Promise.reject(new Error("The workflow is not classified."))
    const reservation = this.reserve<WorkflowResult<K>>({
      kind: sessionOperationKind(id),
      operation: id,
    })
    if (reservation === null)
      return Promise.reject(
        new Error("The session is not accepting operations."),
      )
    return reservation.run((scope) =>
      this.runScoped(scope, id, id, input, options),
    )
  }
}

import type {
  AnalysisDiscoverReposResult,
  CommitPersistencePreparation,
  ExclusiveAuthoritativeValues,
  ExclusiveBodyClient,
  ExclusiveCommandClient,
  ExclusiveCommandId,
  ExclusiveSettlementInput,
  OrdinaryWorkflowId,
  WorkflowCallOptions,
  WorkflowClient,
  WorkflowId,
  WorkflowInput,
  WorkflowOutput,
  WorkflowProgress,
  WorkflowResult,
} from "@repo-edu/application-contract"
import { exclusiveCommandDeclarations } from "@repo-edu/application-contract"
import type { PersistedActiveSurface } from "@repo-edu/domain/active-surface"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCourseStore } from "../stores/course-store.js"
import type { CourseMutationActions } from "./course-mutation-controller.js"
import { captureSessionCommandInput } from "./session-command-input.js"
import {
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
import type { ControllerWorkflowId } from "./workflow-types.js"

type CallOptions<K extends WorkflowId> = WorkflowCallOptions<
  WorkflowProgress<K>,
  WorkflowOutput<K>
> & {
  settlementInput?: K extends ExclusiveCommandId
    ? ExclusiveSettlementInput<K>
    : never
  applyAuthoritative?: K extends "examination.archive.import"
    ? (values: ExclusiveAuthoritativeValues<K>) => void | Promise<void>
    : never
}

export type SessionOperationScope = {
  preparePersistence(commit: CommitPersistencePreparation): Promise<void>
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
  mutateCourse(
    courseId: string,
    apply: (actions: CourseMutationActions) => void,
  ): void
  canContinue(): boolean
  activateSurface(surface: PersistedActiveSurface): Promise<boolean>
  reconcileDiscovery(
    surface: PersistedActiveSurface,
    folder: string,
    result: AnalysisDiscoverReposResult,
  ): Promise<void>
}

export type SessionOperationReservation<T> = {
  run(body: (scope: SessionOperationScope) => Promise<T>): Promise<T>
  cancel(error?: unknown): Promise<T>
}

export type SessionOperationGateway = {
  execute<T>(
    operation: SessionOperationId,
    body: (scope: SessionOperationScope) => Promise<T>,
  ): Promise<T | undefined>
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
    private readonly client: WorkflowClient<OrdinaryWorkflowId>,
    private readonly commands: ExclusiveCommandClient,
    callbacks: ConstructorParameters<typeof SessionSurfaceTransactions>[0],
    private readonly snapshot: () => SessionControllerSnapshot,
    private readonly reconcileDiscovery: (
      scope: SessionTransactionScope,
      surface: PersistedActiveSurface,
      folder: string,
      result: AnalysisDiscoverReposResult,
    ) => Promise<void> = async () => {
      throw new Error("Discovery follow-up is not installed.")
    },
    private readonly preparePersistence?: (
      scope: SessionTransactionScope,
      commit: CommitPersistencePreparation,
    ) => Promise<void>,
    private readonly applyCommittedCourse?: (course: PersistedCourse) => void,
    private readonly enterSurface?: (
      scope: SessionTransactionScope,
      surface: PersistedActiveSurface,
    ) => Promise<boolean>,
  ) {
    super(callbacks)
  }

  readonly gateway: SessionOperationGateway = {
    execute: async <T>(
      operation: SessionOperationId,
      body: (scope: SessionOperationScope) => Promise<T>,
    ) => {
      const reservation = this.reserveOperation<T>(operation)
      if (reservation === null) return undefined
      return await reservation.run(body)
    },
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
        reservation.run((scope) => this.runBody(scope, operation, body)),
      cancel: reservation.cancel,
    }
  }

  private runBody<T>(
    scope: SessionTransactionScope,
    operation: SessionOperationId,
    body: (scope: SessionOperationScope) => Promise<T>,
  ): Promise<T> {
    if (sessionOperationKind(operation) !== "command")
      return body(this.operationScope(scope, operation))
    const prepare = this.preparePersistence
    if (!prepare)
      throw new Error("The session persistence owner is not installed.")
    return this.commands.runBody(
      operation as ExclusiveCommandId,
      (commit) => prepare(scope, commit),
      (client) => body(this.operationScope(scope, operation, client)),
      async () => {
        await scope.settle()
        scope.close()
      },
    )
  }

  private operationScope(
    scope: SessionTransactionScope,
    operation: SessionOperationId,
    command?: ExclusiveBodyClient,
  ): SessionOperationScope {
    const publish = <T>(apply: () => T): T => {
      if (!scope.canContinue())
        throw new Error("The session operation has retired.")
      return apply()
    }
    return {
      preparePersistence: (commit) =>
        scope.required(() => {
          if (
            sessionOperationKind(operation) !== "command" ||
            !this.preparePersistence
          )
            throw new Error("Only the command owner may prepare persistence.")
          return this.preparePersistence(scope, commit)
        }),
      run: (id, input, options) =>
        this.runScoped(scope, operation, id, input, options, command),
      direct: (id, start) =>
        scope.tolerated(() => {
          if (sessionDirectClasses[id] !== "session-changing")
            throw new Error(
              "The direct action does not belong to this reservation.",
            )
          return start().then((result) => publish(() => result))
        }),
      follow: (body) => scope.required(body),
      publish,
      mutateCourse: (courseId, apply) =>
        publish(() => {
          if (sessionOperationKind(operation) === "command")
            throw new Error(
              "Commands apply complete course transitions, not partial course mutations.",
            )
          const state = useCourseStore.getState()
          if (state.course?.id !== courseId) return
          apply(state)
        }),
      canContinue: () => scope.canContinue(),
      activateSurface: (surface) =>
        scope.required(() => {
          if (
            sessionOperationKind(operation) === "command" ||
            !this.enterSurface
          )
            throw new Error("This operation cannot enter a surface.")
          return this.enterSurface(scope, surface)
        }),
      reconcileDiscovery: (surface, folder, result) =>
        scope.required(() =>
          this.reconcileDiscovery(scope, surface, folder, result),
        ),
    }
  }

  private runScoped<K extends WorkflowId>(
    scope: SessionTransactionScope,
    operation: SessionOperationId,
    id: K,
    input: WorkflowInput<K>,
    options?: CallOptions<K>,
    command?: ExclusiveBodyClient,
  ): Promise<WorkflowResult<K>> {
    const callback = <T>(apply: ((event: T) => void) | undefined) =>
      apply === undefined
        ? undefined
        : (event: T): void => {
            // TypeScript permits async functions in a void callback slot. Retain
            // their actual promise so transport completion cannot retire them.
            void scope.required(async () => apply(event)).catch(() => undefined)
          }
    return scope.tolerated(() => {
      const classification = sessionWorkflowClasses[id]
      if (
        classification !== "session-changing" &&
        (classification !== "command" || id !== operation)
      )
        throw new Error("The workflow does not belong to this reservation.")
      const courseCommand =
        classification === "command" &&
        exclusiveCommandDeclarations[id as ExclusiveCommandId]
          .courseTransition === "required"
      if (courseCommand && options?.applyAuthoritative)
        throw new Error("Course settlement belongs to the session owner.")
      const applyAuthoritative = courseCommand
        ? (values: ExclusiveAuthoritativeValues<"repo.clone">) => {
            if (!scope.canContinue())
              throw new Error("The session operation has retired.")
            if (!this.applyCommittedCourse)
              throw new Error("The course settlement owner is not installed.")
            this.applyCommittedCourse(
              structuredClone(values.course) as PersistedCourse,
            )
          }
        : options?.applyAuthoritative
      const callbacks = {
        applyAuthoritative:
          applyAuthoritative === undefined
            ? undefined
            : (values: never) =>
                scope.required(async () => applyAuthoritative(values)),
        settlementInput: options?.settlementInput,
        signal: options?.signal,
        onProgress: callback(options?.onProgress),
        onOutput: callback(options?.onOutput),
      }
      if (classification === "command" && !command)
        throw new Error("The command reservation carries no command client.")
      const running =
        classification === "command" && command
          ? (command.run(
              id as ExclusiveCommandId,
              () =>
                captureSessionCommandInput(
                  id as ExclusiveCommandId,
                  input as never,
                  this.snapshot(),
                ),
              callbacks as never,
            ) as Promise<WorkflowResult<K>>)
          : // The classification above proves this is not a command id.
            (this.client.run(
              id as OrdinaryWorkflowId,
              input as never,
              callbacks as never,
            ) as Promise<WorkflowResult<K>>)
      return running.then((result) => {
        if (!scope.canContinue())
          throw new Error("The session operation has retired.")
        return result
      })
    })
  }

  private present<K extends PresentationWorkflowId>(
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
}

import type {
  AppError,
  WorkflowCallOptions,
  WorkflowClient,
  WorkflowEventFor,
  WorkflowHandlerMap,
  WorkflowInput,
  WorkflowOutput,
  WorkflowProgress,
  WorkflowResult,
} from "@repo-edu/application-contract"
import {
  createCancelledAppError,
  createTransportAppError,
  createWorkflowClient,
  HostAdmissionRefusedError,
  type OrdinaryWorkflowId,
} from "@repo-edu/application-contract"
import { createTRPCClient } from "@trpc/client"
import { desktopTrpcLink } from "./desktop-trpc-link"
import { desktopTrpcWorkflowIds } from "./host-entry-inventory"
import type { DesktopRouter } from "./trpc"

/** Exclusive commands and their cancellation use request ports. */
type DesktopWorkflowId = OrdinaryWorkflowId

type SubscriptionHandlers<TWorkflowId extends DesktopWorkflowId> = {
  signal?: AbortSignal
  onData(
    event: WorkflowEventFor<TWorkflowId> | { type: "admission-refused" },
  ): void
  onError(error: Error): void
  onComplete(): void
}

let trpcClient: ReturnType<typeof createTRPCClient<DesktopRouter>> | null = null

function getTrpcClient(): ReturnType<typeof createTRPCClient<DesktopRouter>> {
  if (trpcClient !== null) {
    return trpcClient
  }

  const bridge = window.repoEduTrpc
  if (!bridge) throw new Error("The desktop workflow bridge is unavailable.")
  trpcClient = createTRPCClient<DesktopRouter>({
    links: [desktopTrpcLink(bridge)],
  })
  return trpcClient
}

export function runSubscriptionFromFactory<
  TWorkflowId extends DesktopWorkflowId,
>(
  subscribe: (handlers: SubscriptionHandlers<TWorkflowId>) => {
    unsubscribe(): void
  },
  options?: WorkflowCallOptions<
    WorkflowProgress<TWorkflowId>,
    WorkflowOutput<TWorkflowId>
  >,
): Promise<WorkflowResult<TWorkflowId>> {
  if (options?.signal?.aborted) {
    return Promise.reject(createCancelledAppError())
  }

  return new Promise((resolve, reject) => {
    let settled = false

    subscribe({
      signal: options?.signal,
      onData(event) {
        switch (event.type) {
          case "admission-refused":
            settled = true
            reject(new HostAdmissionRefusedError())
            return
          case "progress":
            options?.onProgress?.(event.data)
            return
          case "output":
            options?.onOutput?.(event.data)
            return
          case "completed":
            settled = true
            resolve(event.data)
            return
          case "failed":
            settled = true
            reject(event.error)
        }
      },
      onError(error) {
        settled = true
        reject(normalizeTransportError(error))
      },
      onComplete() {
        if (settled) {
          return
        }

        settled = true
        reject(
          options?.signal?.aborted
            ? createCancelledAppError()
            : createTransportAppError(
                "host-crash",
                "Subscription completed without a terminal workflow event.",
                false,
              ),
        )
      },
    })
  })
}

function subscribeWorkflow<TWorkflowId extends DesktopWorkflowId>(
  workflowId: TWorkflowId,
  input: WorkflowInput<TWorkflowId>,
  handlers: SubscriptionHandlers<TWorkflowId>,
): { unsubscribe(): void } {
  const procedure = getTrpcClient()[workflowId] as {
    subscribe(
      value: WorkflowInput<TWorkflowId>,
      subscriptionHandlers: SubscriptionHandlers<TWorkflowId>,
    ): { unsubscribe(): void }
  }

  return procedure.subscribe(input, handlers)
}

function runDesktopWorkflow<TWorkflowId extends DesktopWorkflowId>(
  workflowId: TWorkflowId,
  input: WorkflowInput<TWorkflowId>,
  options?: WorkflowCallOptions<
    WorkflowProgress<TWorkflowId>,
    WorkflowOutput<TWorkflowId>
  >,
): Promise<WorkflowResult<TWorkflowId>> {
  return runSubscriptionFromFactory(
    (handlers) => subscribeWorkflow(workflowId, input, handlers),
    options,
  )
}

function normalizeTransportError(error: Error): AppError {
  const reason = /timeout/i.test(error.message) ? "timeout" : "ipc-disconnected"

  return createTransportAppError(reason, error.message)
}

function createDesktopWorkflowHandlers(): WorkflowHandlerMap<DesktopWorkflowId> {
  return Object.fromEntries(
    desktopTrpcWorkflowIds.map((workflowId) => [
      workflowId,
      (
        input: WorkflowInput<typeof workflowId>,
        options?: WorkflowCallOptions<
          WorkflowProgress<typeof workflowId>,
          WorkflowOutput<typeof workflowId>
        >,
      ) => runDesktopWorkflow(workflowId, input, options),
    ]),
  ) as WorkflowHandlerMap<DesktopWorkflowId>
}

export function createDesktopWorkflowClient(): WorkflowClient<DesktopWorkflowId> {
  return createWorkflowClient(createDesktopWorkflowHandlers())
}

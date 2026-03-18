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
  workflowCatalog,
} from "@repo-edu/application-contract"
import { createTRPCProxyClient } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import type { DesktopRouter } from "./trpc"

type DesktopWorkflowId = keyof typeof workflowCatalog

type SubscriptionHandlers<TWorkflowId extends DesktopWorkflowId> = {
  onData(event: WorkflowEventFor<TWorkflowId>): void
  onError(error: Error): void
  onComplete(): void
}

let trpcClient: ReturnType<typeof createTRPCProxyClient<DesktopRouter>> | null =
  null

function getTrpcClient(): ReturnType<
  typeof createTRPCProxyClient<DesktopRouter>
> {
  if (trpcClient !== null) {
    return trpcClient
  }

  trpcClient = createTRPCProxyClient<DesktopRouter>({
    links: [ipcLink<DesktopRouter>()],
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

    const abort = () => {
      if (settled) {
        return
      }

      settled = true
      subscription.unsubscribe()
      cleanup()
      reject(createCancelledAppError())
    }

    const cleanup = () => {
      options?.signal?.removeEventListener("abort", abort)
    }

    const subscription = subscribe({
      onData(event) {
        switch (event.type) {
          case "progress":
            options?.onProgress?.(event.data)
            return
          case "output":
            options?.onOutput?.(event.data)
            return
          case "completed":
            settled = true
            cleanup()
            resolve(event.data)
            return
          case "failed":
            settled = true
            cleanup()
            reject(event.error)
        }
      },
      onError(error) {
        settled = true
        cleanup()
        reject(normalizeTransportError(error))
      },
      onComplete() {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        reject(
          createTransportAppError(
            "host-crash",
            "Subscription completed without a terminal workflow event.",
            false,
          ),
        )
      },
    })

    options?.signal?.addEventListener("abort", abort, { once: true })
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
  const workflowIds = Object.keys(
    workflowCatalog,
  ) as readonly DesktopWorkflowId[]

  return Object.fromEntries(
    workflowIds.map((workflowId) => [
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

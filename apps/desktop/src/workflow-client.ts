import {
  createCancelledAppError,
  createTransportAppError,
  createWorkflowClient,
} from "@repo-edu/application-contract"
import type {
  AppError,
  WorkflowCallOptions,
  WorkflowClient,
  WorkflowEventFor,
  WorkflowOutput,
  WorkflowProgress,
  WorkflowResult,
} from "@repo-edu/application-contract"
import { createTRPCProxyClient } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import type { DesktopRouter } from "./trpc"

type DesktopWorkflowId = "spike.e2e-trpc" | "spike.cors-http"

const trpcClient = createTRPCProxyClient<DesktopRouter>({
  links: [ipcLink<DesktopRouter>()],
})

function runSubscriptionFromFactory<TWorkflowId extends DesktopWorkflowId>(
  subscribe: (handlers: {
    onData(event: WorkflowEventFor<TWorkflowId>): void
    onError(error: Error): void
    onComplete(): void
  }) => { unsubscribe(): void },
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

function runDesktopWorkflow<TWorkflowId extends DesktopWorkflowId>(
  workflowId: TWorkflowId,
  options?: WorkflowCallOptions<
    WorkflowProgress<TWorkflowId>,
    WorkflowOutput<TWorkflowId>
  >,
): Promise<WorkflowResult<TWorkflowId>> {
  if (workflowId === "spike.e2e-trpc") {
    return runSubscriptionFromFactory<"spike.e2e-trpc">(
      (handlers) => trpcClient.spikeWorkflow.subscribe(undefined, handlers),
      options as WorkflowCallOptions<
        WorkflowProgress<"spike.e2e-trpc">,
        WorkflowOutput<"spike.e2e-trpc">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>
  }

  return runSubscriptionFromFactory<"spike.cors-http">(
    (handlers) => trpcClient.spikeCorsWorkflow.subscribe(undefined, handlers),
    options as WorkflowCallOptions<
      WorkflowProgress<"spike.cors-http">,
      WorkflowOutput<"spike.cors-http">
    >,
  ) as Promise<WorkflowResult<TWorkflowId>>
}

function normalizeTransportError(error: Error): AppError {
  const reason = /timeout/i.test(error.message) ? "timeout" : "ipc-disconnected"

  return createTransportAppError(reason, error.message)
}

export function createDesktopWorkflowClient(): WorkflowClient<DesktopWorkflowId> {
  return createWorkflowClient<DesktopWorkflowId>({
    "spike.e2e-trpc": (_input, options) =>
      runDesktopWorkflow("spike.e2e-trpc", options),
    "spike.cors-http": (_input, options) =>
      runDesktopWorkflow("spike.cors-http", options),
  })
}

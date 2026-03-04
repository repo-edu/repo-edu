import type {
  AppError,
  SpikeCorsWorkflowEvent,
  SpikeWorkflowEvent,
} from "@repo-edu/application-contract"
import { runSpikeCorsWorkflow, runSpikeWorkflow } from "@repo-edu/application"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import { initTRPC } from "@trpc/server"
import { observable } from "@trpc/server/observable"

const t = initTRPC.create()

export type DesktopProgressEvent = {
  index: number
  label: string
}

const phaseOneEvents: readonly DesktopProgressEvent[] = [
  {
    index: 1,
    label: "IPC request reached the Electron main process.",
  },
  {
    index: 2,
    label: "Typed subscription payload streamed back to the renderer.",
  },
  {
    index: 3,
    label: "Subscription completed cleanly after multiple progress events.",
  },
] as const

/**
 * Creates the desktop tRPC router with injected host ports.
 *
 * Ports are injected at construction so use-cases run Node-side with real
 * adapters while the router definition remains declarative.
 */
export function createDesktopRouter(ports: { http: HttpPort }) {
  return t.router({
    phaseOneProgress: t.procedure.subscription(() =>
      observable<DesktopProgressEvent>((emit) => {
        let nextIndex = 0

        const interval = setInterval(() => {
          const nextEvent = phaseOneEvents[nextIndex]

          if (!nextEvent) {
            clearInterval(interval)
            emit.complete()
            return
          }

          emit.next(nextEvent)
          nextIndex += 1
        }, 60)

        return () => {
          clearInterval(interval)
        }
      }),
    ),

    spikeWorkflow: t.procedure.subscription(() =>
      observable<SpikeWorkflowEvent>((emit) => {
        const abortController = new AbortController()

        runSpikeWorkflow({
          onProgress(data) {
            emit.next({ type: "progress", data })
          },
          onOutput(data) {
            emit.next({ type: "output", data })
          },
          signal: abortController.signal,
        })
          .then((result) => {
            emit.next({ type: "completed", data: result })
            emit.complete()
          })
          .catch((error) => {
            emitFailure(emit, abortController.signal, error)
          })

        return () => {
          abortController.abort()
        }
      }),
    ),

    spikeCorsWorkflow: t.procedure.subscription(() =>
      observable<SpikeCorsWorkflowEvent>((emit) => {
        const abortController = new AbortController()

        runSpikeCorsWorkflow(
          { http: ports.http },
          {
            onProgress(data) {
              emit.next({ type: "progress", data })
            },
            onOutput(data) {
              emit.next({ type: "output", data })
            },
            signal: abortController.signal,
          },
        )
          .then((result) => {
            emit.next({ type: "completed", data: result })
            emit.complete()
          })
          .catch((error) => {
            emitFailure(emit, abortController.signal, error)
          })

        return () => {
          abortController.abort()
        }
      }),
    ),
  })
}

function emitFailure(
  emit: { next(value: { type: "failed"; error: AppError }): void; complete(): void },
  signal: AbortSignal,
  error: unknown,
) {
  if (signal.aborted) {
    emit.next({
      type: "failed",
      error: { type: "cancelled", message: "Workflow was cancelled." },
    })
  } else {
    emit.next({
      type: "failed",
      error: {
        type: "internal",
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }
  emit.complete()
}

export type DesktopRouter = ReturnType<typeof createDesktopRouter>

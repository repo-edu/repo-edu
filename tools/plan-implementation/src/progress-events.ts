import type { PlanImplementationEvent } from "./contracts.js"
import type { PlanImplementationTranscript } from "./transcript.js"

type WithoutTimestamp<T> = T extends { readonly timestamp: string }
  ? Omit<T, "timestamp">
  : never

export type PlanImplementationEventInput =
  WithoutTimestamp<PlanImplementationEvent>

export type PlanImplementationEventObserver = {
  event(event: PlanImplementationEvent): void
  close(): void
}

export type PlanImplementationEventStream = {
  emit(event: PlanImplementationEventInput): void
  close(): void
}

const noPresentation: PlanImplementationEventObserver = {
  event() {},
  close() {},
}

export function createPlanImplementationEventStream(options: {
  readonly transcript: PlanImplementationTranscript
  readonly presentation?: PlanImplementationEventObserver
  readonly now?: () => Date
}): PlanImplementationEventStream {
  const presentation = options.presentation ?? noPresentation
  const now = options.now ?? (() => new Date())
  let closed = false

  return {
    emit(input) {
      if (closed) {
        throw new Error("The runner cannot emit to a closed event stream.")
      }
      const event = {
        timestamp: now().toISOString(),
        ...input,
      } as PlanImplementationEvent
      options.transcript.write(event)
      try {
        presentation.event(event)
      } catch {
        // Presentation cannot move the run owner.
      }
    },
    close() {
      if (closed) return
      closed = true
      try {
        presentation.close()
      } catch {
        // Presentation cannot keep the transcript open.
      } finally {
        options.transcript.close()
      }
    },
  }
}

import type { ChildProcessLifetimeAdapter } from "@repo-edu/host-node/child-process-lifetime"
import type { CodingRun } from "./contracts.js"

export type PlanImplementationOwnedChildren = Pick<
  ChildProcessLifetimeAdapter,
  "stopAndConfirm"
>

export type PlanImplementationRunLifetime = {
  setActiveCodingRun(run: CodingRun | null): void
  stopAndConfirm(): Promise<void>
  dispose(): void
}

export function createRunLifetime(options: {
  readonly signal?: AbortSignal
  readonly ownedChildren: PlanImplementationOwnedChildren
  readonly stopRequested: (reason: string) => void
}): PlanImplementationRunLifetime {
  let activeCodingRun: CodingRun | null = null
  let childShutdown: Promise<void> | null = null

  const stopAndConfirm = (): Promise<void> => {
    if (childShutdown === null) {
      childShutdown = options.ownedChildren.stopAndConfirm()
      void childShutdown.catch(() => undefined)
    }
    return childShutdown
  }
  const requestedReason = (): string => {
    const reason = options.signal?.reason
    return typeof reason === "string" && reason.trim().length > 0
      ? reason
      : "Stop was requested."
  }
  const requestStop = (): void => {
    options.stopRequested(requestedReason())
    try {
      activeCodingRun?.abort()
    } finally {
      void stopAndConfirm()
    }
  }

  options.signal?.addEventListener("abort", requestStop, { once: true })
  if (options.signal?.aborted) requestStop()

  return {
    setActiveCodingRun(run) {
      activeCodingRun = run
      if (run !== null && options.signal?.aborted) {
        run.abort()
      }
    },
    stopAndConfirm,
    dispose() {
      options.signal?.removeEventListener("abort", requestStop)
    },
  }
}

import type { ChildProcessLifetimeAdapter } from "@repo-edu/host-node/child-process-lifetime"

export type PlanImplementationOwnedChildren = Pick<
  ChildProcessLifetimeAdapter,
  "stopAndConfirm"
>

export type PlanImplementationRunLifetime = {
  stopAndConfirm(): Promise<void>
  dispose(): void
}

export function createRunLifetime(options: {
  readonly signal?: AbortSignal
  readonly ownedChildren: PlanImplementationOwnedChildren
  readonly stopRequested: (reason: string) => void
}): PlanImplementationRunLifetime {
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
  }

  options.signal?.addEventListener("abort", requestStop, { once: true })
  if (options.signal?.aborted) requestStop()

  return {
    stopAndConfirm,
    dispose() {
      options.signal?.removeEventListener("abort", requestStop)
    },
  }
}

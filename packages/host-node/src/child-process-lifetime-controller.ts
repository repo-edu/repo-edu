import {
  type ChildProcessLifetimeLaunch,
  type ChildProcessLifetimePlatformAdapter,
  type ChildProcessLifetimeResult,
  type ChildProcessLifetimeStopPolicy,
  type ChildProcessOutcome,
  type ChildProcessSecondaryFailureDiagnostic,
  type ChildProcessTargetResult,
  ChildProcessTreeUnconfirmedError,
  createChildProcessLaunchAbortError,
  isPendingLaunchStoppedError,
  type OwnedChildProcessTree,
  type PlatformOwnedChildProcessTree,
} from "./child-process-lifetime-contract.js"
import { posixChildProcessLifetimeAdapter } from "./posix-child-process-lifetime-adapter.js"

export const childProcessStopGracePeriodMs = 5_000
export const childProcessForcedStopConfirmationPeriodMs = 5_000
export const childProcessUnconfirmedTreeMessage =
  "Repo Edu could not confirm its outside work had stopped. Some of that work may still be running."

export const childProcessLifetimeStopPolicy: ChildProcessLifetimeStopPolicy = {
  forcedStopConfirmationPeriodMs: childProcessForcedStopConfirmationPeriodMs,
  gracefulStopPeriodMs: childProcessStopGracePeriodMs,
}

export type ChildProcessLifetimeController = {
  launch<
    TCompleted = ChildProcessLifetimeResult,
    TFailed = ChildProcessLifetimeResult,
  >(
    request: ChildProcessLifetimeLaunch,
  ): Promise<OwnedChildProcessTree<TCompleted, TFailed>>
  stopAndConfirm(): Promise<void>
}

export type ChildProcessLifetimeControllerOptions = {
  readonly diagnosticSink: (
    diagnostic: ChildProcessSecondaryFailureDiagnostic,
  ) => void
  readonly onUnconfirmedTree: (
    error: ChildProcessTreeUnconfirmedError,
  ) => never | Promise<never>
  readonly runtimePlatform?: NodeJS.Platform
  readonly windowsAdapter?: ChildProcessLifetimePlatformAdapter
}

type RegisteredProcessTree = {
  confirm(): Promise<void>
}

type PendingProcessTree = {
  readonly command: string
  readonly completion: Promise<PlatformOwnedChildProcessTree>
  requestStop(): void
}

type RunFacts<TCompleted, TFailed> = {
  cancelRequested: boolean
  failures: unknown[]
  proofLosses: unknown[]
  result?: ChildProcessTargetResult<TCompleted, TFailed>
  workStarted: boolean
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createChildProcessLaunchAbortError()
  }
}

function isExpectedPendingLaunchStop(error: unknown): boolean {
  return (
    isPendingLaunchStoppedError(error) ||
    (error instanceof DOMException && error.name === "AbortError")
  )
}

function selectPlatformAdapter(
  options: ChildProcessLifetimeControllerOptions,
): ChildProcessLifetimePlatformAdapter {
  const runtimePlatform = options.runtimePlatform ?? process.platform
  if (runtimePlatform === "darwin" || runtimePlatform === "linux") {
    return posixChildProcessLifetimeAdapter
  }
  if (runtimePlatform === "win32") {
    if (options.windowsAdapter === undefined) {
      throw new Error(
        "The Windows child-process lifetime adapter is not configured.",
      )
    }
    return options.windowsAdapter
  }
  throw new Error(
    `The child-process lifetime controller does not support ${runtimePlatform}.`,
  )
}

function directTargetResult(
  result: ChildProcessLifetimeResult,
): ChildProcessTargetResult<
  ChildProcessLifetimeResult,
  ChildProcessLifetimeResult
> {
  if (result.exitCode === 0 && result.signal === null) {
    return { outcome: "completed", value: result }
  }
  return {
    outcome: "failed",
    message: `The target exited with ${result.exitCode ?? result.signal ?? "an unknown result"}.`,
    value: result,
  }
}

function selectedOutcome<TCompleted, TFailed>(
  facts: RunFacts<TCompleted, TFailed>,
  targetResult: ChildProcessLifetimeResult | undefined,
): ChildProcessOutcome<TCompleted, TFailed> {
  if (facts.proofLosses.length > 0) {
    return { outcome: "unknown" }
  }
  if (facts.cancelRequested) {
    return { outcome: "cancelled" }
  }
  if (facts.result !== undefined) {
    return { ...facts.result, targetResult }
  }
  throw new Error("The child-process run ended without a result fact.")
}

function secondaryFailures<TCompleted, TFailed>(
  facts: RunFacts<TCompleted, TFailed>,
  outcome: ChildProcessOutcome<TCompleted, TFailed>,
): readonly unknown[] {
  const failures = [...facts.failures]
  if (outcome.outcome === "unknown") {
    failures.push(...facts.proofLosses.slice(1))
  } else {
    failures.push(...facts.proofLosses)
  }
  if (facts.result?.outcome === "failed" && outcome.outcome !== "failed") {
    failures.push(new Error(facts.result.message))
  }
  return failures
}

function unconfirmedTreeError(
  error: unknown,
): ChildProcessTreeUnconfirmedError {
  return error instanceof ChildProcessTreeUnconfirmedError
    ? error
    : new ChildProcessTreeUnconfirmedError(
        "The owned child-process tree could not be confirmed gone.",
        { cause: error },
      )
}

export function createChildProcessLifetimeController(
  options: ChildProcessLifetimeControllerOptions,
): ChildProcessLifetimeController {
  const activeTrees = new Map<symbol, RegisteredProcessTree>()
  const pendingLaunches = new Set<PendingProcessTree>()
  let shutdown: Promise<void> | undefined

  const reportSecondaryFailure = (command: string, failure: unknown): void => {
    options.diagnosticSink({
      command,
      failure,
      kind: "child-process-secondary-failure",
    })
  }

  const endSessionForUnconfirmedTree = async (
    error: unknown,
  ): Promise<never> => {
    return await options.onUnconfirmedTree(unconfirmedTreeError(error))
  }

  return {
    async launch<TCompleted, TFailed>(request: ChildProcessLifetimeLaunch) {
      if (shutdown !== undefined) {
        throw new Error("The child-process lifetime controller is stopped.")
      }
      throwIfAborted(request.signal)

      const pendingStop = new AbortController()
      const completion = selectPlatformAdapter(options).launch(
        request,
        pendingStop.signal,
        childProcessLifetimeStopPolicy,
      )
      const pending: PendingProcessTree = {
        command: request.command,
        completion,
        requestStop() {
          pendingStop.abort()
        },
      }
      pendingLaunches.add(pending)
      let platformTree: PlatformOwnedChildProcessTree
      try {
        platformTree = await completion
      } catch (error) {
        if (error instanceof ChildProcessTreeUnconfirmedError) {
          return await endSessionForUnconfirmedTree(error)
        }
        throw error
      } finally {
        pendingLaunches.delete(pending)
      }

      const key = Symbol("owned-process-tree")
      let confirmation: Promise<void> | undefined
      const confirm = (): Promise<void> => {
        confirmation ??= (async () => {
          try {
            await platformTree.stopAndConfirm()
          } catch (error) {
            return await endSessionForUnconfirmedTree(error)
          } finally {
            activeTrees.delete(key)
          }
        })()
        return confirmation
      }
      activeTrees.set(key, { confirm })

      const facts: RunFacts<TCompleted, TFailed> = {
        cancelRequested: false,
        failures: [],
        proofLosses: [],
        workStarted: request.proof === "target-exit",
      }
      const settled =
        Promise.withResolvers<ChildProcessOutcome<TCompleted, TFailed>>()
      let targetResult: ChildProcessLifetimeResult | undefined
      let targetEndedBeforeReportedResult = false
      const targetResultObserved = platformTree.result.then(
        (result) => {
          targetResult = result
          if (request.proof === "reported") {
            targetEndedBeforeReportedResult = true
          }
        },
        (error: unknown) => {
          if (request.proof === "target-exit" && !facts.cancelRequested) {
            facts.proofLosses.push(error)
            return
          }
          if (request.proof === "reported") {
            targetEndedBeforeReportedResult = true
            facts.failures.push(error)
            return
          }
          facts.failures.push(error)
        },
      )
      let completionStarted = false
      const complete = (): void => {
        if (completionStarted) {
          return
        }
        completionStarted = true
        void (async () => {
          await confirm()
          await targetResultObserved
          if (
            request.proof === "reported" &&
            targetEndedBeforeReportedResult &&
            facts.workStarted &&
            facts.result === undefined &&
            !facts.cancelRequested &&
            facts.proofLosses.length === 0
          ) {
            facts.proofLosses.push(
              new Error(
                "The target ended before its reported result was received.",
              ),
            )
          }
          const outcome = selectedOutcome(facts, targetResult)
          for (const failure of secondaryFailures(facts, outcome)) {
            reportSecondaryFailure(request.command, failure)
          }
          settled.resolve(outcome)
        })().catch(settled.reject)
      }

      const requestCancellation = () => {
        facts.cancelRequested = true
        complete()
      }
      request.signal?.addEventListener("abort", requestCancellation, {
        once: true,
      })
      if (request.signal?.aborted) {
        requestCancellation()
      }
      const detachCancellation = () => {
        request.signal?.removeEventListener("abort", requestCancellation)
      }
      void settled.promise.then(detachCancellation, detachCancellation)

      void targetResultObserved.then(() => {
        if (request.proof === "target-exit") {
          if (targetResult !== undefined) {
            const result = targetResult
            facts.result = directTargetResult(
              result,
            ) as ChildProcessTargetResult<TCompleted, TFailed>
          }
          complete()
          return
        }
        if (request.proof === "reported") {
          complete()
        }
      })

      const ownedTree: OwnedChildProcessTree<TCompleted, TFailed> = {
        stdin: platformTree.stdin,
        stdout: platformTree.stdout,
        stderr: platformTree.stderr,
        outcome: settled.promise,
        requestCancellation,
        reportFailure(error) {
          facts.failures.push(error)
        },
        reportProofLost(error) {
          if (!facts.workStarted) {
            throw new Error(
              "A proving connection cannot be lost before outside work starts.",
            )
          }
          facts.proofLosses.push(error)
          complete()
        },
        reportResult(result) {
          if (facts.result !== undefined) {
            facts.failures.push(
              new Error("The target reported more than one terminal result."),
            )
            return
          }
          facts.result = result
          complete()
        },
        reportWorkStarted() {
          facts.workStarted = true
        },
      }
      return ownedTree
    },
    stopAndConfirm() {
      shutdown ??= (async () => {
        const pending = [...pendingLaunches]
        for (const launch of pending) {
          launch.requestStop()
        }
        const pendingResults = await Promise.allSettled(
          pending.map(async (launch) => await launch.completion),
        )
        for (const [index, result] of pendingResults.entries()) {
          if (
            result.status === "rejected" &&
            !isExpectedPendingLaunchStop(result.reason)
          ) {
            if (result.reason instanceof ChildProcessTreeUnconfirmedError) {
              return await endSessionForUnconfirmedTree(result.reason)
            }
            reportSecondaryFailure(
              pending[index]?.command ?? "<pending>",
              result.reason,
            )
          }
        }
        await Promise.all(
          [...activeTrees.values()].map((tree) => tree.confirm()),
        )
      })()

      return shutdown
    },
  }
}

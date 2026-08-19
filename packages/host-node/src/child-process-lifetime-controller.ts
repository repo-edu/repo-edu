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
  type PlatformChildProcessTerminal,
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
  readonly warnUnconfirmedTree: (
    error: ChildProcessTreeUnconfirmedError,
  ) => void
  readonly runtimePlatform?: NodeJS.Platform
  readonly windowsAdapter?: ChildProcessLifetimePlatformAdapter
}

type TreeConfirmation =
  | { readonly status: "confirmed" }
  | {
      readonly status: "unconfirmed"
      readonly failure: ChildProcessTreeUnconfirmedError
    }

type RegisteredProcessTree = {
  confirm(): Promise<TreeConfirmation>
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
  treeConfirmation: TreeConfirmation,
): ChildProcessOutcome<TCompleted, TFailed> {
  if (
    treeConfirmation.status === "unconfirmed" ||
    facts.proofLosses.length > 0
  ) {
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
  const failures = [...facts.failures, ...facts.proofLosses]
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

function releaseUnconfirmedTreeStreams(
  tree: PlatformOwnedChildProcessTree,
  failure: ChildProcessTreeUnconfirmedError,
): void {
  for (const stream of [tree.stdin, tree.stdout, tree.stderr]) {
    if (stream.destroyed) {
      continue
    }
    // The consumer still receives the error. This listener only prevents an
    // unobserved stream from turning run cleanup into an uncaught exception.
    stream.once("error", () => {})
    stream.destroy(failure)
  }
}

function isProofLostTerminal(
  terminal: PlatformChildProcessTerminal,
): terminal is Extract<
  PlatformChildProcessTerminal,
  { readonly outcome: "proof-lost" }
> {
  return "outcome" in terminal && terminal.outcome === "proof-lost"
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

  const reportUnconfirmedTree = (
    command: string,
    error: unknown,
  ): ChildProcessTreeUnconfirmedError => {
    const failure = unconfirmedTreeError(error)
    reportSecondaryFailure(command, failure)
    try {
      options.warnUnconfirmedTree(failure)
    } catch (warningFailure) {
      reportSecondaryFailure(command, warningFailure)
    }
    return failure
  }

  return {
    async launch<TCompleted, TFailed>(request: ChildProcessLifetimeLaunch) {
      if (shutdown !== undefined) {
        throw new Error("The child-process lifetime controller is stopped.")
      }
      throwIfAborted(request.signal)

      const facts: RunFacts<TCompleted, TFailed> = {
        cancelRequested: false,
        failures: [],
        proofLosses: [],
        workStarted: request.proof === "target-exit",
      }
      const settled =
        Promise.withResolvers<ChildProcessOutcome<TCompleted, TFailed>>()
      const pendingStop = new AbortController()
      // Register the controller-owned attempt before an adapter may admit the
      // target. This keeps possible work inside the outcome owner even when
      // platform start proof is lost.
      const completion = Promise.resolve()
        .then(
          async () =>
            await selectPlatformAdapter(options).launch(
              request,
              pendingStop.signal,
              childProcessLifetimeStopPolicy,
            ),
        )
        .catch((error: unknown) => {
          if (error instanceof ChildProcessTreeUnconfirmedError) {
            throw reportUnconfirmedTree(request.command, error)
          }
          throw error
        })
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
      } finally {
        pendingLaunches.delete(pending)
      }

      const key = Symbol("owned-process-tree")
      let confirmation: Promise<TreeConfirmation> | undefined
      const confirm = (): Promise<TreeConfirmation> => {
        confirmation ??= (async () => {
          try {
            await platformTree.stopAndConfirm()
            activeTrees.delete(key)
            return { status: "confirmed" }
          } catch (error) {
            const failure = reportUnconfirmedTree(request.command, error)
            releaseUnconfirmedTreeStreams(platformTree, failure)
            return { status: "unconfirmed", failure }
          }
        })()
        return confirmation
      }
      activeTrees.set(key, { confirm })

      let targetResult: ChildProcessLifetimeResult | undefined
      let targetEndedBeforeReportedResult = false
      const recordPlatformTerminalFailure = (failure: unknown): void => {
        if (request.proof === "target-exit" && !facts.cancelRequested) {
          facts.proofLosses.push(failure)
          return
        }
        if (request.proof === "reported") {
          targetEndedBeforeReportedResult = true
        }
        facts.failures.push(failure)
      }
      const targetResultObserved = platformTree.result.then((terminal) => {
        if (isProofLostTerminal(terminal)) {
          recordPlatformTerminalFailure(terminal.failure)
          return
        }
        targetResult = terminal
        if (request.proof === "reported") {
          targetEndedBeforeReportedResult = true
        }
      }, recordPlatformTerminalFailure)
      let completionStarted = false
      const complete = (): void => {
        if (completionStarted) {
          return
        }
        completionStarted = true
        void (async () => {
          const treeConfirmation = await confirm()
          if (treeConfirmation.status === "unconfirmed") {
            const outcome = selectedOutcome(
              facts,
              targetResult,
              treeConfirmation,
            )
            for (const failure of secondaryFailures(facts, outcome)) {
              reportSecondaryFailure(request.command, failure)
            }
            settled.resolve(outcome)
            return
          }
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
          const outcome = selectedOutcome(facts, targetResult, treeConfirmation)
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
              continue
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

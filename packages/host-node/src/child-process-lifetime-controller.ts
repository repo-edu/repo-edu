import {
  type ChildProcessLifetimeLaunch,
  type ChildProcessLifetimePlatformAdapter,
  type ChildProcessLifetimeStopPolicy,
  createChildProcessLaunchAbortError,
  isPendingLaunchStoppedError,
  type OwnedChildProcessTree,
} from "./child-process-lifetime-contract.js"
import { posixChildProcessLifetimeAdapter } from "./posix-child-process-lifetime-adapter.js"

export const childProcessStopGracePeriodMs = 5_000
const childProcessLifetimeStopPolicy: ChildProcessLifetimeStopPolicy = {
  gracefulStopPeriodMs: childProcessStopGracePeriodMs,
}

export type ChildProcessLifetimeController = {
  launch(request: ChildProcessLifetimeLaunch): Promise<OwnedChildProcessTree>
  stopAndConfirm(): Promise<void>
}

export type ChildProcessLifetimeControllerOptions = {
  readonly windowsAdapter?: ChildProcessLifetimePlatformAdapter
}

type RegisteredProcessTree = Pick<OwnedChildProcessTree, "stopAndConfirm">

type PendingProcessTree = {
  readonly completion: Promise<OwnedChildProcessTree>
  requestStop(): void
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

function throwShutdownFailures(failures: readonly unknown[]): void {
  if (failures.length === 0) {
    return
  }
  if (failures.length === 1) {
    throw failures[0]
  }
  throw new AggregateError(
    failures,
    "Child-process shutdown could not confirm every owned tree.",
  )
}

function selectPlatformAdapter(
  options: ChildProcessLifetimeControllerOptions,
): ChildProcessLifetimePlatformAdapter {
  if (process.platform === "darwin" || process.platform === "linux") {
    return posixChildProcessLifetimeAdapter
  }
  if (process.platform === "win32") {
    if (options.windowsAdapter === undefined) {
      throw new Error(
        "The Windows child-process lifetime adapter is not configured.",
      )
    }
    return options.windowsAdapter
  }
  throw new Error(
    `The child-process lifetime controller does not support ${process.platform}.`,
  )
}

export function createChildProcessLifetimeController(
  options: ChildProcessLifetimeControllerOptions = {},
): ChildProcessLifetimeController {
  const activeTrees = new Map<symbol, RegisteredProcessTree>()
  const pendingLaunches = new Set<PendingProcessTree>()
  let shutdown: Promise<void> | undefined

  return {
    async launch(request) {
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
        completion,
        requestStop() {
          pendingStop.abort()
        },
      }
      pendingLaunches.add(pending)
      let platformTree: OwnedChildProcessTree
      try {
        platformTree = await completion
      } finally {
        pendingLaunches.delete(pending)
      }

      const key = Symbol("owned-process-tree")
      const tree: RegisteredProcessTree = {
        stopAndConfirm: platformTree.stopAndConfirm,
      }
      activeTrees.set(key, tree)

      const onAbort = () => {
        void Promise.resolve()
          .then(async () => await tree.stopAndConfirm())
          .catch(() => {
            // The result path and host shutdown retain the observable cleanup
            // failure. This handler only starts the bounded stop operation.
          })
      }
      request.signal?.addEventListener("abort", onAbort, { once: true })
      if (request.signal?.aborted || shutdown !== undefined) {
        onAbort()
      }
      const forgetTree = () => {
        activeTrees.delete(key)
      }
      const detachAbort = () => {
        request.signal?.removeEventListener("abort", onAbort)
      }
      void platformTree.result.then(
        () => {
          detachAbort()
          forgetTree()
        },
        () => {
          detachAbort()
          void tree.stopAndConfirm().then(forgetTree, () => undefined)
        },
      )

      return {
        stdin: platformTree.stdin,
        stdout: platformTree.stdout,
        stderr: platformTree.stderr,
        result: platformTree.result,
        stopAndConfirm: tree.stopAndConfirm,
      }
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
        const activeResults = await Promise.allSettled(
          [...activeTrees.values()].map(async (tree) => {
            await tree.stopAndConfirm()
          }),
        )
        const failures = pendingResults.flatMap((result) =>
          result.status === "rejected" &&
          !isExpectedPendingLaunchStop(result.reason)
            ? [result.reason]
            : [],
        )
        for (const result of activeResults) {
          if (result.status === "rejected") {
            failures.push(result.reason)
          }
        }
        throwShutdownFailures(failures)
      })()

      return shutdown
    },
  }
}

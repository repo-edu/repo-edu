import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import type { Readable, Writable } from "node:stream"

export const childProcessStopGracePeriodMs = 5_000
const groupExitPollMs = 20

export type ChildProcessLifetimeRoute = "direct-adapter" | "managed-helper"

export type ChildProcessLifetimeLaunch = {
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly route: ChildProcessLifetimeRoute
  readonly shell?: boolean | string
  readonly signal?: AbortSignal
}

export type ChildProcessLifetimeResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

export type OwnedChildProcess = {
  readonly route: ChildProcessLifetimeRoute
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly result: Promise<ChildProcessLifetimeResult>
  requestStop(): void
  stopAndConfirm(): Promise<void>
}

export type ChildProcessLifetimeAdapter = {
  launch(request: ChildProcessLifetimeLaunch): Promise<OwnedChildProcess>
  stopAndConfirm(): Promise<void>
}

export type ChildProcessLifetimePlatformTree = OwnedChildProcess & {
  stopAndConfirm(): Promise<void>
}

export type ChildProcessLifetimePlatform = {
  launch(
    request: ChildProcessLifetimeLaunch,
    pendingStopSignal: AbortSignal,
  ): Promise<ChildProcessLifetimePlatformTree>
}

export type ChildProcessLifetimeAdapterOptions = {
  readonly windows?: ChildProcessLifetimePlatform
}

type RegisteredProcessTree = Pick<
  ChildProcessLifetimePlatformTree,
  "requestStop" | "stopAndConfirm"
>

type PendingProcessTree = {
  readonly completion: Promise<ChildProcessLifetimePlatformTree>
  requestStop(): void
}

type ProcessGroup = {
  requestStop(): void
  stopAndConfirm(): Promise<void>
}

const noProcessGroup: ProcessGroup = {
  requestStop() {},
  async stopAndConfirm() {},
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function processGroupExists(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0)
    return true
  } catch (error) {
    if (isErrnoException(error) && error.code === "ESRCH") {
      return false
    }
    if (isErrnoException(error) && error.code === "EPERM") {
      return true
    }
    throw error
  }
}

function signalProcessGroup(
  processGroupId: number,
  signal: "SIGKILL" | "SIGTERM",
): boolean {
  try {
    process.kill(-processGroupId, signal)
    return true
  } catch (error) {
    if (isErrnoException(error) && error.code === "ESRCH") {
      return false
    }
    throw error
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

async function waitForProcessGroupExit(
  processGroupId: number,
  timeoutMs?: number,
): Promise<boolean> {
  const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs

  while (processGroupExists(processGroupId)) {
    if (deadline !== undefined) {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        return false
      }
      await delay(Math.min(groupExitPollMs, remainingMs))
      continue
    }
    await delay(groupExitPollMs)
  }

  return true
}

function createProcessGroup(processGroupId: number): ProcessGroup {
  let gracefulStopStartedAt: number | undefined
  let confirmation: Promise<void> | undefined

  const requestStop = () => {
    if (
      gracefulStopStartedAt !== undefined ||
      !processGroupExists(processGroupId)
    ) {
      return
    }

    gracefulStopStartedAt = Date.now()
    signalProcessGroup(processGroupId, "SIGTERM")
  }

  return {
    requestStop,
    stopAndConfirm() {
      confirmation ??= (async () => {
        requestStop()
        if (!processGroupExists(processGroupId)) {
          return
        }

        const remainingGraceMs = Math.max(
          0,
          childProcessStopGracePeriodMs -
            (Date.now() - (gracefulStopStartedAt ?? Date.now())),
        )
        if (await waitForProcessGroupExit(processGroupId, remainingGraceMs)) {
          return
        }

        signalProcessGroup(processGroupId, "SIGKILL")
        await waitForProcessGroupExit(processGroupId)
      })()

      return confirmation
    },
  }
}

function waitForTerminalResult(
  child: ChildProcessWithoutNullStreams,
): Promise<ChildProcessLifetimeResult> {
  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (exitCode, signal) => {
      resolve({ exitCode, signal })
    })
  })
}

async function holdResultUntilTreeIsGone(
  terminal: Promise<ChildProcessLifetimeResult>,
  group: ProcessGroup,
): Promise<ChildProcessLifetimeResult> {
  let result: ChildProcessLifetimeResult
  try {
    result = await terminal
  } catch (error) {
    try {
      await group.stopAndConfirm()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "The child process failed and its process group could not be confirmed stopped.",
      )
    }
    throw error
  }

  await group.stopAndConfirm()
  return result
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("The child-process launch was cancelled.")
  }
}

const posixChildProcessLifetimePlatform: ChildProcessLifetimePlatform = {
  async launch(request, pendingStopSignal) {
    if (pendingStopSignal.aborted) {
      throw new Error("The pending child-process launch was stopped.")
    }
    const child = spawn(request.command, [...(request.args ?? [])], {
      cwd: request.cwd,
      detached: true,
      env:
        request.env === undefined
          ? process.env
          : { ...process.env, ...request.env },
      shell: request.shell,
      stdio: "pipe",
    })

    const terminal = waitForTerminalResult(child)
    const group =
      child.pid === undefined ? noProcessGroup : createProcessGroup(child.pid)

    return {
      route: request.route,
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      result: holdResultUntilTreeIsGone(terminal, group),
      requestStop: group.requestStop,
      async stopAndConfirm() {
        const [cleanup] = await Promise.allSettled([
          group.stopAndConfirm(),
          terminal,
        ])
        if (cleanup.status === "rejected") {
          throw cleanup.reason
        }
      },
    }
  },
}

function selectPlatform(
  options: ChildProcessLifetimeAdapterOptions,
): ChildProcessLifetimePlatform {
  if (process.platform === "darwin" || process.platform === "linux") {
    return posixChildProcessLifetimePlatform
  }
  if (process.platform === "win32") {
    if (options.windows === undefined) {
      throw new Error(
        "The Windows child-process lifetime platform is not configured.",
      )
    }
    return options.windows
  }
  throw new Error(
    `The child-process lifetime adapter does not support ${process.platform}.`,
  )
}

export class ChildProcessOutcomeUnknownError extends Error {
  override readonly name = "ChildProcessOutcomeUnknownError"
}

export function createChildProcessLifetimeAdapter(
  options: ChildProcessLifetimeAdapterOptions = {},
): ChildProcessLifetimeAdapter {
  const activeTrees = new Map<symbol, RegisteredProcessTree>()
  const pendingLaunches = new Set<PendingProcessTree>()
  let shutdown: Promise<void> | undefined

  return {
    async launch(request) {
      if (shutdown !== undefined) {
        throw new Error("The child-process lifetime adapter is stopped.")
      }
      throwIfAborted(request.signal)

      const pendingStop = new AbortController()
      const completion = selectPlatform(options).launch(
        request,
        pendingStop.signal,
      )
      const pending: PendingProcessTree = {
        completion,
        requestStop() {
          pendingStop.abort()
        },
      }
      pendingLaunches.add(pending)
      let platformTree: ChildProcessLifetimePlatformTree
      try {
        platformTree = await completion
      } finally {
        pendingLaunches.delete(pending)
      }

      const key = Symbol("owned-process-tree")
      const tree: RegisteredProcessTree = {
        requestStop: platformTree.requestStop,
        stopAndConfirm: platformTree.stopAndConfirm,
      }
      activeTrees.set(key, tree)

      const onAbort = () => {
        try {
          tree.requestStop()
        } catch {
          // Cancellation stays a best-effort request. Stop-and-confirm keeps
          // the observable cleanup failure for host shutdown.
        }
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
        route: request.route,
        stdin: platformTree.stdin,
        stdout: platformTree.stdout,
        stderr: platformTree.stderr,
        result: platformTree.result,
        requestStop: tree.requestStop,
        stopAndConfirm: tree.stopAndConfirm,
      }
    },
    stopAndConfirm() {
      shutdown ??= (async () => {
        const pending = [...pendingLaunches]
        for (const launch of pending) {
          launch.requestStop()
        }
        await Promise.allSettled(
          pending.map(async (launch) => await launch.completion),
        )
        await Promise.all(
          [...activeTrees.values()].map(async (tree) => {
            await tree.stopAndConfirm()
          }),
        )
      })()

      return shutdown
    },
  }
}

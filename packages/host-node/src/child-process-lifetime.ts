import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import type { Readable, Writable } from "node:stream"

const stopGracePeriodMs = 5_000
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
}

export type ChildProcessLifetimeAdapter = {
  launch(request: ChildProcessLifetimeLaunch): OwnedChildProcess
  stopAndConfirm(): Promise<void>
}

type RegisteredProcessTree = {
  requestStop(): void
  stopAndConfirm(): Promise<void>
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
          stopGracePeriodMs -
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

function requireSupportedPlatform(): void {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error(
      "The shared child-process lifetime adapter currently supports macOS and Linux.",
    )
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("The child-process launch was cancelled.")
  }
}

export function createChildProcessLifetimeAdapter(): ChildProcessLifetimeAdapter {
  const activeTrees = new Map<symbol, RegisteredProcessTree>()
  let shutdown: Promise<void> | undefined

  return {
    launch(request) {
      if (shutdown !== undefined) {
        throw new Error("The child-process lifetime adapter is stopped.")
      }
      requireSupportedPlatform()
      throwIfAborted(request.signal)

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

      const key = Symbol("owned-process-tree")
      const terminal = waitForTerminalResult(child)
      const group =
        child.pid === undefined ? noProcessGroup : createProcessGroup(child.pid)
      const result = holdResultUntilTreeIsGone(terminal, group)
      const tree: RegisteredProcessTree = {
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
      const forgetTree = () => {
        activeTrees.delete(key)
      }
      const detachAbort = () => {
        request.signal?.removeEventListener("abort", onAbort)
      }
      void result.then(
        () => {
          detachAbort()
          forgetTree()
        },
        () => {
          detachAbort()
          void group.stopAndConfirm().then(forgetTree, () => undefined)
        },
      )

      return {
        route: request.route,
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        result,
        requestStop: tree.requestStop,
      }
    },
    stopAndConfirm() {
      shutdown ??= Promise.all(
        [...activeTrees.values()].map(async (tree) => {
          await tree.stopAndConfirm()
        }),
      ).then(() => undefined)

      return shutdown
    },
  }
}

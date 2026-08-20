import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { throwIfLaunchStopRequested } from "./child-process-launch-stop.js"
import type {
  ChildProcessLifetimePlatformAdapter,
  ChildProcessLifetimeResult,
  PlatformChildProcessStopResult,
} from "./child-process-lifetime-contract.js"
import { ChildProcessTreeUnconfirmedError } from "./child-process-lifetime-contract.js"
import { releaseChildProcessLocalResources } from "./child-process-local-resources.js"

const groupExitPollMs = 20

type OwnedTreeConfirmation = {
  stopAndConfirm(): Promise<PlatformChildProcessStopResult>
}

export type PosixProcessGroupOperations = {
  processGroupExists(processGroupId: number): boolean
  signalProcessGroup(
    processGroupId: number,
    signal: "SIGKILL" | "SIGTERM",
  ): boolean
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

const defaultProcessGroupOperations: PosixProcessGroupOperations = {
  processGroupExists,
  signalProcessGroup,
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now())
}

async function waitForProcessGroupExit(
  processGroupId: number,
  operations: PosixProcessGroupOperations,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (operations.processGroupExists(processGroupId)) {
    const waitMs = remainingMs(deadline)
    if (waitMs <= 0) {
      return false
    }
    await delay(Math.min(groupExitPollMs, waitMs))
  }

  return true
}

function settledWithin(
  promise: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    void promise.then(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

// An output pipe still open after the group is gone means a descendant that
// left the group may hold it, so pipe closure is part of tree confirmation.
// Every wait after the forced stop draws from that stop's one five-second
// deadline; a clean exit whose pipes stay open escalates to the forced stop
// after the graceful allowance instead of waiting without a limit.
function createOwnedTreeConfirmation(
  child: ChildProcessWithoutNullStreams,
  processGroupId: number,
  streamsClosed: Promise<void>,
  gracefulStopPeriodMs: number,
  forcedStopConfirmationPeriodMs: number,
  operations: PosixProcessGroupOperations,
): OwnedTreeConfirmation {
  let gracefulStopStartedAt: number | undefined
  let confirmation: Promise<PlatformChildProcessStopResult> | undefined

  const requestStop = () => {
    if (
      gracefulStopStartedAt !== undefined ||
      !operations.processGroupExists(processGroupId)
    ) {
      return
    }

    gracefulStopStartedAt = Date.now()
    operations.signalProcessGroup(processGroupId, "SIGTERM")
  }

  return {
    stopAndConfirm() {
      confirmation ??= (async () => {
        requestStop()
        const graceDeadline =
          (gracefulStopStartedAt ?? Date.now()) + gracefulStopPeriodMs
        if (
          (await waitForProcessGroupExit(
            processGroupId,
            operations,
            remainingMs(graceDeadline),
          )) &&
          (await settledWithin(streamsClosed, remainingMs(graceDeadline)))
        ) {
          return { outcome: "confirmed" }
        }

        operations.signalProcessGroup(processGroupId, "SIGKILL")
        const forcedDeadline = Date.now() + forcedStopConfirmationPeriodMs
        if (
          !(await waitForProcessGroupExit(
            processGroupId,
            operations,
            remainingMs(forcedDeadline),
          ))
        ) {
          releaseChildProcessLocalResources(child)
          throw new ChildProcessTreeUnconfirmedError(
            "The process group remained after its forced stop.",
          )
        }
        if (
          !(await settledWithin(streamsClosed, remainingMs(forcedDeadline)))
        ) {
          releaseChildProcessLocalResources(child)
          throw new ChildProcessTreeUnconfirmedError(
            "The owned tree's output pipes stayed open after its forced stop.",
          )
        }
        return { outcome: "confirmed" }
      })()

      return confirmation
    },
  }
}

type ChildProcessTerminal = {
  readonly outcome: Promise<ChildProcessLifetimeResult>
  readonly streamsClosed: Promise<void>
}

// Spawn admission is asynchronous on POSIX: success and failure both arrive
// as events, so the launch settles only after the operating system admitted
// or rejected the target.
function waitForSpawn(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSpawn = () => {
      child.off("error", onError)
      resolve()
    }
    const onError = (error: Error) => {
      child.off("spawn", onSpawn)
      reject(error)
    }
    child.once("spawn", onSpawn)
    child.once("error", onError)
  })
}

function observeTerminalResult(
  child: ChildProcessWithoutNullStreams,
): ChildProcessTerminal {
  const outcome = new Promise<ChildProcessLifetimeResult>((resolve, reject) => {
    let settled = false
    child.once("error", (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    child.once("exit", (exitCode, signal) => {
      if (settled) return
      settled = true
      resolve({ exitCode, signal })
    })
  })
  const streamsClosed = new Promise<void>((resolve) => {
    child.once("close", () => resolve())
  })
  return { outcome, streamsClosed }
}

export function createPosixChildProcessLifetimeAdapter(
  operations: PosixProcessGroupOperations = defaultProcessGroupOperations,
): ChildProcessLifetimePlatformAdapter {
  return {
    async launch(request, pendingStopSignal, stopPolicy) {
      throwIfLaunchStopRequested([pendingStopSignal])
      const child = spawn(request.command, [...(request.args ?? [])], {
        cwd: request.cwd,
        detached: true,
        // A supplied environment is the whole target environment, never a set
        // of changes laid over the host's. A caller that removed a variable
        // must not get it back from `process.env`.
        env: request.env,
        shell: request.shell,
        stdio: "pipe",
      })

      const terminal = observeTerminalResult(child)
      try {
        await waitForSpawn(child)
      } catch (error) {
        // The result observer shares the child's error event; silence its
        // rejection so the launch failure is reported once.
        terminal.outcome.catch(() => {})
        throw error
      }
      const processGroupId = child.pid
      if (processGroupId === undefined) {
        child.kill()
        throw new Error("The spawned target did not report a process identity.")
      }
      const confirmation = createOwnedTreeConfirmation(
        child,
        processGroupId,
        terminal.streamsClosed,
        stopPolicy.gracefulStopPeriodMs,
        stopPolicy.forcedStopConfirmationPeriodMs,
        operations,
      )

      return {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        result: terminal.outcome,
        stopAndConfirm: () => confirmation.stopAndConfirm(),
      }
    },
  }
}

export const posixChildProcessLifetimeAdapter =
  createPosixChildProcessLifetimeAdapter()

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import type {
  ChildProcessLifetimePlatformAdapter,
  ChildProcessLifetimeResult,
} from "./child-process-lifetime-contract.js"
import { ChildProcessTreeUnconfirmedError } from "./child-process-lifetime-contract.js"

const groupExitPollMs = 20

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

function createProcessGroup(
  processGroupId: number,
  gracefulStopPeriodMs: number,
  forcedStopConfirmationPeriodMs: number,
): ProcessGroup {
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
          gracefulStopPeriodMs -
            (Date.now() - (gracefulStopStartedAt ?? Date.now())),
        )
        if (await waitForProcessGroupExit(processGroupId, remainingGraceMs)) {
          return
        }

        signalProcessGroup(processGroupId, "SIGKILL")
        if (
          !(await waitForProcessGroupExit(
            processGroupId,
            forcedStopConfirmationPeriodMs,
          ))
        ) {
          throw new ChildProcessTreeUnconfirmedError(
            "The process group remained after its forced stop.",
          )
        }
      })()

      return confirmation
    },
  }
}

type ChildProcessTerminal = {
  readonly outcome: Promise<ChildProcessLifetimeResult>
  readonly streamsClosed: Promise<void>
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

export const posixChildProcessLifetimeAdapter: ChildProcessLifetimePlatformAdapter =
  {
    async launch(request, pendingStopSignal, stopPolicy) {
      if (pendingStopSignal.aborted) {
        throw new Error("The pending child-process launch was stopped.")
      }
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
      const group =
        child.pid === undefined
          ? noProcessGroup
          : createProcessGroup(
              child.pid,
              stopPolicy.gracefulStopPeriodMs,
              stopPolicy.forcedStopConfirmationPeriodMs,
            )

      return {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        result: terminal.outcome,
        async stopAndConfirm() {
          const [cleanup] = await Promise.allSettled([
            group.stopAndConfirm(),
            terminal.streamsClosed,
          ])
          if (cleanup.status === "rejected") {
            throw cleanup.reason
          }
        },
      }
    },
  }

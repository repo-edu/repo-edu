import { type ChildProcess, spawn } from "node:child_process"
import { createInterface, type Interface } from "node:readline"
import type { Readable, Writable } from "node:stream"
import {
  type LaunchStopSignals,
  launchStopRequested,
  pendingLaunchStoppedError,
  throwIfLaunchStopRequested,
  waitForLaunchStop,
} from "./child-process-launch-stop.js"
import {
  type ChildProcessLifetimeLaunch,
  type ChildProcessLifetimePlatform,
  type ChildProcessLifetimePlatformTree,
  type ChildProcessLifetimeResult,
  ChildProcessOutcomeUnknownError,
  childProcessStopGracePeriodMs,
  createChildProcessLaunchAbortError,
  isPendingLaunchStoppedError,
} from "./child-process-lifetime.js"
import {
  createWindowsKillOnCloseJob,
  type SavedWindowsProcessIdentity,
  type WindowsKillOnCloseJob,
} from "./windows-job.js"
import {
  createWindowsLaunchCommand,
  parseWindowsLauncherMessage,
  type WindowsChildLifetimeTarget,
  type WindowsLauncherMessage,
} from "./windows-launcher-protocol.js"

const launcherTimeoutMs = 30_000
const jobExitPollMs = 20
const forcedJobExitCode = 1

export type WindowsChildLifetimeRuntime = {
  readonly executablePath: string
  readonly launcherEntryPath: string
  readonly runAsNode: boolean
}

export type WindowsChildLifetimeEvidence = {
  readonly assignedToJob: true
  readonly identitySavedInSpawnTurn: true
  readonly jobHandleInherited: false
  readonly koffiLoaded: true
  readonly launcherArguments: readonly [string]
  readonly runAsNode: boolean
  readonly targetAdmittedAfterAssignment: boolean
}

export type WindowsLauncherReadinessEvidence = WindowsChildLifetimeEvidence & {
  readonly targetAdmittedAfterAssignment: false
  readonly exitCode: 0
}

type LauncherExit = {
  readonly code: number | null
  readonly error?: Error
  readonly signal: NodeJS.Signals | null
}

type AssignedLauncher = {
  readonly child: ChildProcess
  readonly controlInput: Writable
  readonly controlLines: AsyncIterator<string>
  readonly evidence: WindowsChildLifetimeEvidence
  readonly exit: Promise<LauncherExit>
  readonly job: WindowsKillOnCloseJob
  closeControl(): void
  closeResources(): void
}

type LaunchedWindowsTarget = {
  readonly evidence: WindowsChildLifetimeEvidence & {
    readonly targetAdmittedAfterAssignment: true
  }
  readonly tree: ChildProcessLifetimePlatformTree
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out.`))
    }, launcherTimeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

async function waitForJobExit(
  job: WindowsKillOnCloseJob,
  timeoutMs?: number,
): Promise<boolean> {
  const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs

  while (job.hasActiveProcesses()) {
    if (deadline !== undefined) {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        return false
      }
      await delay(Math.min(jobExitPollMs, remainingMs))
      continue
    }
    await delay(jobExitPollMs)
  }

  return true
}

function requiredProcessId(child: ChildProcess): number {
  if (child.pid === undefined) {
    child.kill()
    throw new Error("The Windows launcher did not return a process identity.")
  }
  return child.pid
}

function requiredInput(child: ChildProcess): Writable {
  if (!child.stdin) {
    throw new Error("The Windows launcher input is unavailable.")
  }
  return child.stdin
}

function requiredOutput(child: ChildProcess): Readable {
  if (!child.stdout) {
    throw new Error("The Windows launcher output is unavailable.")
  }
  return child.stdout
}

function requiredErrorOutput(child: ChildProcess): Readable {
  if (!child.stderr) {
    throw new Error("The Windows launcher error output is unavailable.")
  }
  return child.stderr
}

function requiredControlInput(child: ChildProcess): Writable {
  const stream = child.stdio[3] as Writable | null
  if (!stream) {
    throw new Error("The Windows launcher control input is unavailable.")
  }
  return stream
}

function requiredControlOutput(child: ChildProcess): Readable {
  const stream = child.stdio[4] as Readable | null
  if (!stream) {
    throw new Error("The Windows launcher control output is unavailable.")
  }
  return stream
}

function waitForExit(child: ChildProcess): Promise<LauncherExit> {
  return new Promise((resolve) => {
    let settled = false
    child.once("error", (error) => {
      if (settled) {
        return
      }
      settled = true
      resolve({ code: null, error, signal: null })
    })
    child.once("close", (code, signal) => {
      if (settled) {
        return
      }
      settled = true
      resolve({ code, signal })
    })
  })
}

function formatLauncherExit(exit: LauncherExit): string {
  if (exit.error) {
    return exit.error.message
  }
  return String(exit.code ?? exit.signal ?? "unknown")
}

async function readLauncherMessage(
  launcher: Pick<AssignedLauncher, "controlLines" | "exit">,
  label: string,
  stopSignals: LaunchStopSignals = [],
): Promise<WindowsLauncherMessage> {
  const next = await withTimeout(
    waitForLaunchStop(launcher.controlLines.next(), stopSignals),
    `Windows launcher ${label}`,
  )
  if (next.done) {
    const exit = await withTimeout(launcher.exit, "Windows launcher exit")
    throw new Error(
      `The Windows launcher exited before ${label}: ${formatLauncherExit(exit)}`,
    )
  }
  return parseWindowsLauncherMessage(next.value)
}

function launcherArguments(
  runtime: WindowsChildLifetimeRuntime,
): readonly [string] {
  return [runtime.launcherEntryPath]
}

export function buildWindowsLauncherEnvironment(
  runAsNode: boolean,
  parentEnvironment: Readonly<NodeJS.ProcessEnv> = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...parentEnvironment }
  if (runAsNode) {
    environment.ELECTRON_RUN_AS_NODE = "1"
  } else {
    delete environment.ELECTRON_RUN_AS_NODE
  }
  return environment
}

async function cleanBeforeTargetAdmission(options: {
  readonly assigned: boolean
  readonly child: ChildProcess | null
  readonly controlInput: Writable | null
  readonly controlLines: Interface | null
  readonly exit: Promise<LauncherExit> | null
  readonly job: WindowsKillOnCloseJob
}): Promise<void> {
  options.controlInput?.end()
  options.controlLines?.close()

  if (options.assigned) {
    try {
      options.job.terminate(forcedJobExitCode)
      await waitForJobExit(options.job)
    } finally {
      options.job.close()
    }
    return
  }

  options.child?.kill()
  if (options.exit) {
    await withTimeout(options.exit, "Windows unassigned launcher exit")
  }
  options.job.close()
}

async function startAssignedLauncher(
  runtime: WindowsChildLifetimeRuntime,
  stopSignals: LaunchStopSignals,
): Promise<AssignedLauncher> {
  if (process.platform !== "win32") {
    throw new Error("The Windows child-lifetime route requires Windows.")
  }

  const job = await createWindowsKillOnCloseJob()
  let child: ChildProcess | null = null
  let controlInput: Writable | null = null
  let identity: SavedWindowsProcessIdentity | null = null
  let controlLines: Interface | null = null
  let exit: Promise<LauncherExit> | null = null
  let assigned = false

  try {
    throwIfLaunchStopRequested(stopSignals)
    const fixedLauncherArguments = launcherArguments(runtime)
    child = spawn(runtime.executablePath, fixedLauncherArguments, {
      env: buildWindowsLauncherEnvironment(runtime.runAsNode),
      stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    exit = waitForExit(child)
    requiredInput(child)
    requiredOutput(child)
    requiredErrorOutput(child)

    // This call deliberately stays in the same synchronous turn as spawn.
    // No event-loop yield may let Node release its own process handle first.
    identity = job.saveProcessIdentity(requiredProcessId(child))

    const assignedControlInput = requiredControlInput(child)
    controlInput = assignedControlInput
    assignedControlInput.on("error", () => {
      // Pending writes receive their errors through their callbacks. Later
      // channel loss is classified by the result monitor.
    })
    const controlOutput = requiredControlOutput(child)
    controlLines = createInterface({
      input: controlOutput,
      crlfDelay: Infinity,
    })
    const iterator = controlLines[Symbol.asyncIterator]()

    const ready = await readLauncherMessage(
      { controlLines: iterator, exit },
      "readiness",
      stopSignals,
    )
    if (ready.kind === "failure") {
      throw new Error(`The Windows launcher failed: ${ready.message}`)
    }
    if (ready.kind !== "ready") {
      throw new Error(
        "The Windows launcher admitted a target before readiness.",
      )
    }

    job.assign(identity)
    assigned = true
    if (!job.contains(identity)) {
      throw new Error("The saved Windows launcher is not in its assigned job.")
    }
    identity.close()
    identity = null

    let resourcesClosed = false
    return {
      child,
      controlInput: assignedControlInput,
      controlLines: iterator,
      evidence: {
        assignedToJob: true,
        identitySavedInSpawnTurn: true,
        jobHandleInherited: false,
        koffiLoaded: true,
        launcherArguments: fixedLauncherArguments,
        runAsNode: runtime.runAsNode,
        targetAdmittedAfterAssignment: false,
      },
      exit,
      job,
      closeControl() {
        if (
          !assignedControlInput.destroyed &&
          !assignedControlInput.writableEnded
        ) {
          assignedControlInput.end()
        }
      },
      closeResources() {
        if (resourcesClosed) {
          return
        }
        resourcesClosed = true
        assignedControlInput.destroy()
        controlLines?.close()
        job.close()
      },
    }
  } catch (error) {
    identity?.close()
    try {
      await cleanBeforeTargetAdmission({
        assigned,
        child,
        controlInput,
        controlLines,
        exit,
        job,
      })
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "The Windows launcher setup failed and its cleanup could not be confirmed.",
      )
    }
    throw error
  }
}

async function writeLaunchCommand(
  launcher: AssignedLauncher,
  target: WindowsChildLifetimeTarget,
  stopSignals: LaunchStopSignals,
): Promise<void> {
  const command = createWindowsLaunchCommand(target)
  await waitForLaunchStop(
    new Promise<void>((resolve, reject) => {
      const removeListeners = () => {
        launcher.controlInput.off("error", onError)
        launcher.controlInput.off("finish", onFinish)
      }
      const onError = (error: Error) => {
        removeListeners()
        reject(error)
      }
      const onFinish = () => {
        removeListeners()
        resolve()
      }
      launcher.controlInput.once("error", onError)
      launcher.controlInput.once("finish", onFinish)
      launcher.controlInput.end(`${JSON.stringify(command)}\n`)
    }),
    stopSignals,
  )
}

function createStopAndConfirm(launcher: AssignedLauncher): {
  readonly requestStop: () => void
  readonly stopAndConfirm: () => Promise<void>
} {
  let gracefulStopStartedAt: number | undefined
  let confirmation: Promise<void> | undefined

  const requestStop = () => {
    if (gracefulStopStartedAt !== undefined) {
      return
    }
    gracefulStopStartedAt = Date.now()
    const input = requiredInput(launcher.child)
    if (!input.destroyed && !input.writableEnded) {
      input.end()
    }
  }

  return {
    requestStop,
    stopAndConfirm() {
      confirmation ??= (async () => {
        requestStop()
        const remainingGraceMs = Math.max(
          0,
          childProcessStopGracePeriodMs -
            (Date.now() - (gracefulStopStartedAt ?? Date.now())),
        )
        if (!(await waitForJobExit(launcher.job, remainingGraceMs))) {
          launcher.job.terminate(forcedJobExitCode)
          await waitForJobExit(launcher.job)
        }
        launcher.closeResources()
      })()
      return confirmation
    },
  }
}

async function unknownAfterTargetAdmission(
  error: unknown,
  stopAndConfirm: () => Promise<void>,
): Promise<never> {
  try {
    await stopAndConfirm()
  } catch (cleanupError) {
    throw new ChildProcessOutcomeUnknownError(
      "The Windows launcher was lost after target admission and the job could not be confirmed stopped.",
      { cause: new AggregateError([error, cleanupError]) },
    )
  }
  throw new ChildProcessOutcomeUnknownError(
    "The Windows launcher was lost after target admission, so the target outcome is unknown.",
    { cause: error },
  )
}

async function monitorTerminalResult(
  launcher: AssignedLauncher,
  stopAndConfirm: () => Promise<void>,
): Promise<ChildProcessLifetimeResult> {
  try {
    const terminal = await readLauncherMessage(launcher, "terminal result")
    if (terminal.kind === "failure") {
      throw new Error(`The Windows launcher failed: ${terminal.message}`)
    }
    if (terminal.kind !== "terminal") {
      throw new Error(
        `The Windows launcher reported ${terminal.kind} instead of a terminal result.`,
      )
    }

    const launcherExit = await withTimeout(
      launcher.exit,
      "Windows launcher terminal exit",
    )
    if (launcherExit.code !== 0 || launcherExit.signal !== null) {
      throw new Error(
        `The Windows launcher failed after its target: ${formatLauncherExit(launcherExit)}`,
      )
    }

    await stopAndConfirm()
    return {
      exitCode: terminal.exitCode,
      signal: terminal.signal,
    }
  } catch (error) {
    return await unknownAfterTargetAdmission(error, stopAndConfirm)
  }
}

export async function launchAssignedTarget(
  runtime: WindowsChildLifetimeRuntime,
  target: WindowsChildLifetimeTarget & {
    readonly route: ChildProcessLifetimeLaunch["route"]
    readonly signal?: AbortSignal
  },
  pendingStopSignal?: AbortSignal,
): Promise<LaunchedWindowsTarget> {
  const stopSignals = [pendingStopSignal]
  const readinessStopSignals = [pendingStopSignal, target.signal]
  let launcher: AssignedLauncher
  try {
    throwIfLaunchStopRequested(readinessStopSignals)
    launcher = await startAssignedLauncher(runtime, readinessStopSignals)
  } catch (error) {
    if (isPendingLaunchStoppedError(error) && error.signal === target.signal) {
      throw createChildProcessLaunchAbortError()
    }
    throw error
  }
  const lifecycle = createStopAndConfirm(launcher)
  let targetMayBeAdmitted = false
  let targetLaunchRejected = false

  try {
    if (target.signal?.aborted || launchStopRequested(stopSignals)) {
      launcher.closeControl()
      await lifecycle.stopAndConfirm()
      if (target.signal?.aborted) {
        throw createChildProcessLaunchAbortError()
      }
      throw pendingLaunchStoppedError()
    }

    targetMayBeAdmitted = true
    await writeLaunchCommand(launcher, target, stopSignals)
    const started = await readLauncherMessage(
      launcher,
      "target start",
      stopSignals,
    )
    if (started.kind === "failure") {
      targetLaunchRejected = true
      await lifecycle.stopAndConfirm()
      throw new Error(`The Windows launcher failed: ${started.message}`)
    }
    if (started.kind !== "started") {
      throw new Error(
        `The Windows launcher reported ${started.kind} before target start.`,
      )
    }

    if (target.signal?.aborted || launchStopRequested(stopSignals)) {
      lifecycle.requestStop()
    }
    const result = monitorTerminalResult(launcher, lifecycle.stopAndConfirm)

    return {
      evidence: {
        ...launcher.evidence,
        targetAdmittedAfterAssignment: true,
      },
      tree: {
        route: target.route,
        stdin: requiredInput(launcher.child),
        stdout: requiredOutput(launcher.child),
        stderr: requiredErrorOutput(launcher.child),
        result,
        requestStop: lifecycle.requestStop,
        stopAndConfirm: lifecycle.stopAndConfirm,
      },
    }
  } catch (error) {
    if (error instanceof ChildProcessOutcomeUnknownError) {
      throw error
    }
    if (targetMayBeAdmitted && !targetLaunchRejected) {
      return await unknownAfterTargetAdmission(error, lifecycle.stopAndConfirm)
    }
    try {
      await lifecycle.stopAndConfirm()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "The Windows target launch failed and its job could not be confirmed stopped.",
      )
    }
    throw error
  }
}

export function createWindowsChildProcessLifetimePlatform(
  runtime: WindowsChildLifetimeRuntime,
): ChildProcessLifetimePlatform {
  return {
    async launch(request, pendingStopSignal) {
      return (
        await launchAssignedTarget(
          runtime,
          {
            command: request.command,
            args: request.args,
            cwd: request.cwd,
            env: request.env,
            route: request.route,
            shell: request.shell,
            signal: request.signal,
          },
          pendingStopSignal,
        )
      ).tree
    },
  }
}

export async function proveWindowsLauncherReadiness(
  runtime: WindowsChildLifetimeRuntime,
): Promise<WindowsLauncherReadinessEvidence> {
  const launcher = await startAssignedLauncher(runtime, [])
  try {
    launcher.closeControl()
    requiredInput(launcher.child).end()
    const exit = await withTimeout(launcher.exit, "Windows ready launcher exit")
    if (exit.code !== 0 || exit.signal !== null) {
      throw new Error(
        `The ready Windows launcher did not exit cleanly: ${formatLauncherExit(exit)}`,
      )
    }
    if (!(await waitForJobExit(launcher.job, launcherTimeoutMs))) {
      throw new Error("The ready Windows launcher remained in its job.")
    }
    return {
      ...launcher.evidence,
      targetAdmittedAfterAssignment: false,
      exitCode: 0,
    }
  } finally {
    if (launcher.job.hasActiveProcesses()) {
      launcher.job.terminate(forcedJobExitCode)
      await waitForJobExit(launcher.job)
    }
    launcher.closeResources()
  }
}

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
  type ChildProcessLifetimePlatformAdapter,
  type ChildProcessLifetimeResult,
  type ChildProcessLifetimeStopPolicy,
  ChildProcessTreeUnconfirmedError,
  createChildProcessLaunchAbortError,
  isPendingLaunchStoppedError,
  type PlatformOwnedChildProcessTree,
} from "./child-process-lifetime-contract.js"
import { childProcessForcedStopConfirmationPeriodMs } from "./child-process-lifetime-controller.js"
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

export type WindowsChildLifetimeAdapterOperations = {
  createJob(): Promise<WindowsKillOnCloseJob>
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
  readonly forcedByCleanup: boolean
  readonly signal: NodeJS.Signals | null
}

type LauncherCleanupState = {
  forceStarted: boolean
}

type AssignedLauncher = {
  readonly child: ChildProcess
  readonly cleanupState: LauncherCleanupState
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
  readonly tree: PlatformOwnedChildProcessTree
}

const defaultAdapterOperations: WindowsChildLifetimeAdapterOperations = {
  createJob: createWindowsKillOnCloseJob,
}

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = launcherTimeoutMs,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out.`))
    }, timeoutMs)
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

function waitForExit(
  child: ChildProcess,
  cleanupState: LauncherCleanupState,
): Promise<LauncherExit> {
  return new Promise((resolve) => {
    let settled = false
    child.once("error", (error) => {
      if (settled) {
        return
      }
      settled = true
      resolve({
        code: null,
        error,
        forcedByCleanup: cleanupState.forceStarted,
        signal: null,
      })
    })
    child.once("close", (code, signal) => {
      if (settled) {
        return
      }
      settled = true
      resolve({
        code,
        forcedByCleanup: cleanupState.forceStarted,
        signal,
      })
    })
  })
}

function formatLauncherExit(exit: LauncherExit): string {
  if (exit.error) {
    return exit.error.message
  }
  return String(exit.code ?? exit.signal ?? "unknown")
}

// The target decides how long it runs, so the wait for its exit line carries no
// bound. The controller policy gives an owned tree one five-second graceful
// stop allowance and no second bound. A bound here would end a long clone or
// AI turn and report an outcome nobody observed.
async function readLauncherMessage(
  launcher: Pick<AssignedLauncher, "controlLines" | "exit">,
  label: string,
  stopSignals: LaunchStopSignals = [],
): Promise<WindowsLauncherMessage> {
  const next = await waitForLaunchStop(
    launcher.controlLines.next(),
    stopSignals,
  )
  if (next.done) {
    const exit = await withTimeout(launcher.exit, "Windows launcher exit")
    throw new Error(
      `The Windows launcher exited before ${label}: ${formatLauncherExit(exit)}`,
    )
  }
  return parseWindowsLauncherMessage(next.value)
}

// A handshake step is bounded, because the launcher owes its answer at once:
// readiness, target start and the reads that follow the target's own exit.
async function readLauncherHandshakeMessage(
  launcher: Pick<AssignedLauncher, "controlLines" | "exit">,
  label: string,
  stopSignals: LaunchStopSignals = [],
): Promise<WindowsLauncherMessage> {
  return await withTimeout(
    readLauncherMessage(launcher, label, stopSignals),
    `Windows launcher ${label}`,
  )
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

export async function cleanBeforeTargetAdmission(options: {
  readonly assigned: boolean
  readonly child: ChildProcess | null
  readonly controlInput: Writable | null
  readonly controlLines: Interface | null
  readonly exit: Promise<LauncherExit> | null
  readonly job: WindowsKillOnCloseJob
  readonly forcedStopConfirmationPeriodMs: number
}): Promise<void> {
  options.controlInput?.end()
  options.controlLines?.close()

  if (options.assigned) {
    try {
      options.job.terminate(forcedJobExitCode)
      if (
        !(await waitForJobExit(
          options.job,
          options.forcedStopConfirmationPeriodMs,
        ))
      ) {
        throw new ChildProcessTreeUnconfirmedError(
          "The assigned Windows launcher remained after its forced stop.",
        )
      }
    } finally {
      options.job.close()
    }
    return
  }

  try {
    options.child?.kill()
    if (options.exit) {
      await withTimeout(
        options.exit,
        "Windows unassigned launcher exit",
        options.forcedStopConfirmationPeriodMs,
      )
    }
  } finally {
    options.job.close()
  }
}

async function startAssignedLauncher(
  runtime: WindowsChildLifetimeRuntime,
  stopSignals: LaunchStopSignals,
  forcedStopConfirmationPeriodMs: number,
  operations: WindowsChildLifetimeAdapterOperations,
): Promise<AssignedLauncher> {
  if (process.platform !== "win32") {
    throw new Error(
      "The Windows child-process lifetime adapter requires Windows.",
    )
  }

  const job = await operations.createJob()
  const cleanupState: LauncherCleanupState = { forceStarted: false }
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
    exit = waitForExit(child, cleanupState)
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

    const ready = await readLauncherHandshakeMessage(
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
      cleanupState,
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
        forcedStopConfirmationPeriodMs,
        job,
      })
    } catch (cleanupError) {
      throw new ChildProcessTreeUnconfirmedError(
        "The Windows launcher setup failed and its cleanup could not be confirmed.",
        { cause: new AggregateError([error, cleanupError]) },
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

function createStopAndConfirm(
  launcher: AssignedLauncher,
  gracefulStopPeriodMs: number,
  forcedStopConfirmationPeriodMs: number,
): {
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
          gracefulStopPeriodMs -
            (Date.now() - (gracefulStopStartedAt ?? Date.now())),
        )
        if (!(await waitForJobExit(launcher.job, remainingGraceMs))) {
          launcher.cleanupState.forceStarted = true
          launcher.job.terminate(forcedJobExitCode)
          if (
            !(await waitForJobExit(
              launcher.job,
              forcedStopConfirmationPeriodMs,
            ))
          ) {
            throw new ChildProcessTreeUnconfirmedError(
              "The Windows job remained after its forced stop.",
            )
          }
        }
        launcher.closeResources()
      })()
      return confirmation
    },
  }
}

function launchFailureForCaller(
  error: unknown,
  callerSignal: AbortSignal | undefined,
): unknown {
  return callerSignal !== undefined &&
    isPendingLaunchStoppedError(error) &&
    error.signal === callerSignal
    ? createChildProcessLaunchAbortError()
    : error
}

async function confirmStoppedAfterTargetAdmissionFailure(
  error: unknown,
  stopAndConfirm: () => Promise<void>,
): Promise<void> {
  try {
    await stopAndConfirm()
  } catch (cleanupError) {
    throw new ChildProcessTreeUnconfirmedError(
      "The Windows launcher was lost after target admission and the job could not be confirmed stopped.",
      { cause: new AggregateError([error, cleanupError]) },
    )
  }
}

async function monitorTerminalResult(
  launcher: AssignedLauncher,
  stopAndConfirm: () => Promise<void>,
): Promise<ChildProcessLifetimeResult> {
  try {
    const exited = await readLauncherMessage(launcher, "target exit")
    if (exited.kind === "failure") {
      throw new Error(`The Windows launcher failed: ${exited.message}`)
    }
    if (exited.kind !== "exited") {
      throw new Error(
        `The Windows launcher reported ${exited.kind} instead of a target exit.`,
      )
    }

    const terminalReport = readLauncherHandshakeMessage(
      launcher,
      "stream completion",
    ).then(
      (message) => ({ status: "fulfilled", message }) as const,
      (error: unknown) =>
        ({
          status: "rejected",
          error,
          forcedByCleanup: launcher.cleanupState.forceStarted,
        }) as const,
    )

    await stopAndConfirm()
    const launcherExit = await withTimeout(
      launcher.exit,
      "Windows launcher terminal exit",
    )
    const terminal = await terminalReport

    if (terminal.status === "fulfilled") {
      if (terminal.message.kind === "failure") {
        throw new Error(
          `The Windows launcher failed: ${terminal.message.message}`,
        )
      }
      if (terminal.message.kind !== "terminal") {
        throw new Error(
          `The Windows launcher reported ${terminal.message.kind} instead of stream completion.`,
        )
      }
      if (
        terminal.message.exitCode !== exited.exitCode ||
        terminal.message.signal !== exited.signal
      ) {
        throw new Error(
          "The Windows launcher changed the target result after its output streams closed.",
        )
      }
    } else if (!terminal.forcedByCleanup) {
      throw terminal.error
    }

    if (
      !launcherExit.forcedByCleanup &&
      (launcherExit.code !== 0 || launcherExit.signal !== null)
    ) {
      throw new Error(
        `The Windows launcher failed after its target: ${formatLauncherExit(launcherExit)}`,
      )
    }

    return {
      exitCode: exited.exitCode,
      signal: exited.signal,
    }
  } catch (error) {
    await confirmStoppedAfterTargetAdmissionFailure(error, stopAndConfirm)
    throw error
  }
}

export async function launchAssignedTarget(
  runtime: WindowsChildLifetimeRuntime,
  target: WindowsChildLifetimeTarget & { readonly signal?: AbortSignal },
  stopPolicy: ChildProcessLifetimeStopPolicy,
  pendingStopSignal?: AbortSignal,
  operations: WindowsChildLifetimeAdapterOperations = defaultAdapterOperations,
): Promise<LaunchedWindowsTarget> {
  const pendingStopSignals = [pendingStopSignal]
  const launchStopSignals = [pendingStopSignal, target.signal]
  let launcher: AssignedLauncher
  try {
    throwIfLaunchStopRequested(launchStopSignals)
    launcher = await startAssignedLauncher(
      runtime,
      launchStopSignals,
      stopPolicy.forcedStopConfirmationPeriodMs,
      operations,
    )
  } catch (error) {
    throw launchFailureForCaller(error, target.signal)
  }
  const lifecycle = createStopAndConfirm(
    launcher,
    stopPolicy.gracefulStopPeriodMs,
    stopPolicy.forcedStopConfirmationPeriodMs,
  )
  let targetMayBeAdmitted = false
  let targetLaunchRejected = false

  try {
    if (target.signal?.aborted || launchStopRequested(pendingStopSignals)) {
      launcher.closeControl()
      await lifecycle.stopAndConfirm()
      if (target.signal?.aborted) {
        throw createChildProcessLaunchAbortError()
      }
      throw pendingLaunchStoppedError()
    }

    targetMayBeAdmitted = true
    await writeLaunchCommand(launcher, target, launchStopSignals)
    const started = await readLauncherHandshakeMessage(
      launcher,
      "target start",
      launchStopSignals,
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

    if (launchStopRequested(launchStopSignals)) {
      lifecycle.requestStop()
    }
    const result = monitorTerminalResult(launcher, lifecycle.stopAndConfirm)

    return {
      evidence: {
        ...launcher.evidence,
        targetAdmittedAfterAssignment: true,
      },
      tree: {
        stdin: requiredInput(launcher.child),
        stdout: requiredOutput(launcher.child),
        stderr: requiredErrorOutput(launcher.child),
        result,
        stopAndConfirm: lifecycle.stopAndConfirm,
      },
    }
  } catch (error) {
    if (error instanceof ChildProcessTreeUnconfirmedError) {
      throw error
    }
    if (targetMayBeAdmitted && !targetLaunchRejected) {
      await confirmStoppedAfterTargetAdmissionFailure(
        error,
        lifecycle.stopAndConfirm,
      )
      throw launchFailureForCaller(error, target.signal)
    }
    try {
      await lifecycle.stopAndConfirm()
    } catch (cleanupError) {
      throw new ChildProcessTreeUnconfirmedError(
        "The Windows target launch failed and its job could not be confirmed stopped.",
        { cause: new AggregateError([error, cleanupError]) },
      )
    }
    throw launchFailureForCaller(error, target.signal)
  }
}

export function createWindowsChildProcessLifetimeAdapter(
  runtime: WindowsChildLifetimeRuntime,
): ChildProcessLifetimePlatformAdapter {
  return {
    async launch(request, pendingStopSignal, stopPolicy) {
      return (
        await launchAssignedTarget(
          runtime,
          {
            command: request.command,
            args: request.args,
            cwd: request.cwd,
            env: request.env,
            shell: request.shell,
            signal: request.signal,
          },
          stopPolicy,
          pendingStopSignal,
        )
      ).tree
    },
  }
}

export async function proveWindowsLauncherReadiness(
  runtime: WindowsChildLifetimeRuntime,
): Promise<WindowsLauncherReadinessEvidence> {
  const launcher = await startAssignedLauncher(
    runtime,
    [],
    childProcessForcedStopConfirmationPeriodMs,
    defaultAdapterOperations,
  )
  let evidence: WindowsLauncherReadinessEvidence | undefined
  let readinessFailure: unknown
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
    evidence = {
      ...launcher.evidence,
      targetAdmittedAfterAssignment: false,
      exitCode: 0,
    }
  } catch (error) {
    readinessFailure = error
  }

  let cleanupFailure: unknown
  try {
    if (launcher.job.hasActiveProcesses()) {
      launcher.job.terminate(forcedJobExitCode)
      if (
        !(await waitForJobExit(
          launcher.job,
          childProcessForcedStopConfirmationPeriodMs,
        ))
      ) {
        cleanupFailure = new ChildProcessTreeUnconfirmedError(
          "The ready Windows launcher remained after its forced stop.",
        )
      }
    }
  } catch (error) {
    cleanupFailure = error
  } finally {
    launcher.closeResources()
  }

  if (cleanupFailure !== undefined) {
    if (readinessFailure !== undefined) {
      throw new ChildProcessTreeUnconfirmedError(
        "The Windows launcher readiness proof failed and its job could not be confirmed stopped.",
        { cause: new AggregateError([readinessFailure, cleanupFailure]) },
      )
    }
    throw cleanupFailure
  }
  if (readinessFailure !== undefined) {
    throw readinessFailure
  }
  if (evidence === undefined) {
    throw new Error(
      "The Windows launcher readiness proof returned no evidence.",
    )
  }
  return evidence
}

import { type ChildProcess, spawn } from "node:child_process"
import { createInterface, type Interface } from "node:readline"
import type { Readable, Writable } from "node:stream"
import type { ProcessResult } from "@repo-edu/host-runtime-contract"
import {
  createWindowsKillOnCloseJob,
  type SavedWindowsProcessIdentity,
  type WindowsKillOnCloseJob,
} from "./windows-job.js"

const launcherProtocolVersion = 1
const launcherTimeoutMs = 30_000
const forcedJobExitCode = 1

export type WindowsChildLifetimeRuntime = {
  readonly executablePath: string
  readonly launcherEntryPath: string
}

export type WindowsChildLifetimeTarget = {
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly stdinText?: string
}

export type WindowsChildLifetimeEvidence = {
  readonly assignedToJob: true
  readonly identitySavedInSpawnTurn: true
  readonly jobHandleInherited: false
  readonly koffiLoaded: true
  readonly launcherArguments: readonly [string]
  readonly runAsNode: true
  readonly targetAdmittedAfterAssignment: boolean
}

export type WindowsLauncherReadinessEvidence = WindowsChildLifetimeEvidence & {
  readonly targetAdmittedAfterAssignment: false
  readonly exitCode: 0
}

export type WindowsChildLifetimeRun = {
  readonly evidence: WindowsChildLifetimeEvidence & {
    readonly targetAdmittedAfterAssignment: true
  }
  readonly result: ProcessResult
}

type LauncherReadyMessage = {
  readonly kind: "ready"
  readonly protocolVersion: number
  readonly runtime: "node"
}

type LauncherTerminalMessage = {
  readonly kind: "terminal"
  readonly exitCode: number | null
  readonly signal: string | null
}

type LauncherFailureMessage = {
  readonly kind: "failure"
  readonly message: string
}

type LauncherMessage =
  | LauncherReadyMessage
  | LauncherTerminalMessage
  | LauncherFailureMessage

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
  readonly output: { stdout: string; stderr: string }
  closeControl(): void
  closeResources(): void
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

function requiredProcessId(child: ChildProcess): number {
  if (child.pid === undefined) {
    child.kill()
    throw new Error("The Windows launcher did not return a process identity.")
  }
  return child.pid
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

function captureOutput(child: ChildProcess) {
  const output = { stdout: "", stderr: "" }
  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  child.stdout?.on("data", (chunk: string) => {
    output.stdout += chunk
  })
  child.stderr?.on("data", (chunk: string) => {
    output.stderr += chunk
  })
  return output
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

function formatLauncherExit(
  exit: LauncherExit,
  output: { stdout: string; stderr: string },
): string {
  if (exit.error) {
    return `${exit.error.message}: ${output.stderr.trim() || output.stdout.trim() || "<no output>"}`
  }
  const terminal = exit.code ?? exit.signal ?? "unknown"
  const detail = output.stderr.trim() || output.stdout.trim() || "<no output>"
  return `${terminal}: ${detail}`
}

function parseLauncherMessage(line: string): LauncherMessage {
  const value = JSON.parse(line) as Partial<LauncherMessage>
  if (value.kind === "ready") {
    if (
      value.protocolVersion !== launcherProtocolVersion ||
      value.runtime !== "node"
    ) {
      throw new Error("The Windows launcher reported an invalid ready state.")
    }
    return value as LauncherReadyMessage
  }
  if (value.kind === "terminal") {
    if (
      !(
        value.exitCode === null ||
        (typeof value.exitCode === "number" &&
          Number.isSafeInteger(value.exitCode))
      ) ||
      !(value.signal === null || typeof value.signal === "string")
    ) {
      throw new Error(
        "The Windows launcher reported an invalid terminal state.",
      )
    }
    return value as LauncherTerminalMessage
  }
  if (value.kind === "failure" && typeof value.message === "string") {
    return value as LauncherFailureMessage
  }
  throw new Error("The Windows launcher reported an unknown control message.")
}

async function readLauncherMessage(
  launcher: Pick<AssignedLauncher, "controlLines" | "exit" | "output">,
  label: string,
): Promise<LauncherMessage> {
  const next = await withTimeout(
    launcher.controlLines.next(),
    `Windows launcher ${label}`,
  )
  if (next.done) {
    const exit = await withTimeout(launcher.exit, "Windows launcher exit")
    throw new Error(
      `The Windows launcher exited before ${label}: ${formatLauncherExit(exit, launcher.output)}`,
    )
  }
  return parseLauncherMessage(next.value)
}

function buildTargetEnvironment(
  overrides: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const environment: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      environment[name] = value
    }
  }
  Object.assign(environment, overrides)
  delete environment.ELECTRON_RUN_AS_NODE
  return environment
}

function launcherArguments(
  runtime: WindowsChildLifetimeRuntime,
): readonly [string] {
  return [runtime.launcherEntryPath]
}

async function startAssignedLauncher(
  runtime: WindowsChildLifetimeRuntime,
): Promise<AssignedLauncher> {
  if (process.platform !== "win32") {
    throw new Error("The Windows child-lifetime route requires Windows.")
  }

  const job = await createWindowsKillOnCloseJob()
  let child: ChildProcess | null = null
  let controlInput: Writable | null = null
  let identity: SavedWindowsProcessIdentity | null = null
  let controlLines: Interface | null = null
  let assigned = false

  try {
    const fixedLauncherArguments = launcherArguments(runtime)
    child = spawn(runtime.executablePath, fixedLauncherArguments, {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    const exit = waitForExit(child)

    // This call deliberately stays in the same synchronous turn as spawn.
    // No event-loop yield may let Node release its own process handle first.
    identity = job.saveProcessIdentity(requiredProcessId(child))

    const assignedControlInput = requiredControlInput(child)
    controlInput = assignedControlInput
    assignedControlInput.on("error", () => {
      // A pending write receives the same error through its callback. Later
      // channel loss is reported by the launcher exit and control reader.
    })
    const controlOutput = requiredControlOutput(child)
    const output = captureOutput(child)
    controlLines = createInterface({
      input: controlOutput,
      crlfDelay: Infinity,
    })
    const iterator = controlLines[Symbol.asyncIterator]()

    const ready = await readLauncherMessage(
      { controlLines: iterator, exit, output },
      "readiness",
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
        runAsNode: true,
        targetAdmittedAfterAssignment: false,
      },
      exit,
      job,
      output,
      closeControl() {
        assignedControlInput.end()
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
    controlInput?.destroy()
    controlLines?.close()
    identity?.close()
    if (child && !assigned) {
      child.kill()
    }
    if (assigned) {
      try {
        job.terminate(forcedJobExitCode)
      } catch {
        // Closing the kill-on-close handle remains the terminal cleanup.
      }
    }
    job.close()
    throw error
  }
}

async function writeLaunchCommand(
  launcher: AssignedLauncher,
  target: WindowsChildLifetimeTarget,
): Promise<void> {
  const command = {
    kind: "launch",
    protocolVersion: launcherProtocolVersion,
    target: {
      command: target.command,
      args: [...(target.args ?? [])],
      cwd: target.cwd,
      env: buildTargetEnvironment(target.env),
    },
  }
  await new Promise<void>((resolve, reject) => {
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
  })
}

export async function proveWindowsLauncherReadiness(
  runtime: WindowsChildLifetimeRuntime,
): Promise<WindowsLauncherReadinessEvidence> {
  const launcher = await startAssignedLauncher(runtime)
  try {
    launcher.closeControl()
    launcher.child.stdin?.end()
    const exit = await withTimeout(launcher.exit, "Windows ready launcher exit")
    if (exit.code !== 0 || exit.signal !== null) {
      throw new Error(
        `The ready Windows launcher did not exit cleanly: ${formatLauncherExit(exit, launcher.output)}`,
      )
    }
    return {
      ...launcher.evidence,
      targetAdmittedAfterAssignment: false,
      exitCode: 0,
    }
  } finally {
    launcher.closeResources()
  }
}

export async function runWindowsChildLifetimeTarget(
  runtime: WindowsChildLifetimeRuntime,
  target: WindowsChildLifetimeTarget,
): Promise<WindowsChildLifetimeRun> {
  const launcher = await startAssignedLauncher(runtime)
  try {
    await writeLaunchCommand(launcher, target)
    launcher.child.stdin?.end(target.stdinText)

    const terminal = await readLauncherMessage(launcher, "terminal result")
    if (terminal.kind === "failure") {
      throw new Error(`The Windows launcher failed: ${terminal.message}`)
    }
    if (terminal.kind !== "terminal") {
      throw new Error("The Windows launcher reported readiness twice.")
    }

    const launcherExit = await withTimeout(
      launcher.exit,
      "Windows launcher terminal exit",
    )
    if (launcherExit.code !== 0 || launcherExit.signal !== null) {
      throw new Error(
        `The Windows launcher failed after its target: ${formatLauncherExit(launcherExit, launcher.output)}`,
      )
    }

    return {
      evidence: {
        ...launcher.evidence,
        targetAdmittedAfterAssignment: true,
      },
      result: {
        exitCode: terminal.exitCode,
        signal: terminal.signal,
        stdout: launcher.output.stdout,
        stderr: launcher.output.stderr,
      },
    }
  } finally {
    launcher.closeResources()
  }
}

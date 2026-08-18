import type { Readable, Writable } from "node:stream"

export type ChildProcessLifetimeLaunch = {
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly shell?: boolean | string
  readonly signal?: AbortSignal
}

export type ChildProcessLifetimeResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

export type OwnedChildProcessTree = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly result: Promise<ChildProcessLifetimeResult>
  stopAndConfirm(): Promise<void>
}

export type ChildProcessLifetimeStopPolicy = {
  readonly gracefulStopPeriodMs: number
}

export type ChildProcessLifetimePlatformAdapter = {
  launch(
    request: ChildProcessLifetimeLaunch,
    pendingStopSignal: AbortSignal,
    stopPolicy: ChildProcessLifetimeStopPolicy,
  ): Promise<OwnedChildProcessTree>
}

export class PendingLaunchStoppedError extends Error {
  override readonly name = "PendingLaunchStoppedError"

  constructor(readonly signal?: AbortSignal) {
    super("The pending child-process launch was stopped.")
  }
}

export function isPendingLaunchStoppedError(
  error: unknown,
): error is PendingLaunchStoppedError {
  return error instanceof PendingLaunchStoppedError
}

export function createChildProcessLaunchAbortError(): DOMException {
  return new DOMException(
    "The child-process launch was cancelled.",
    "AbortError",
  )
}

export class ChildProcessOutcomeUnknownError extends Error {
  override readonly name = "ChildProcessOutcomeUnknownError"
}

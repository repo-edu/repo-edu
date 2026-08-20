import type { Readable, Writable } from "node:stream"

export type ChildProcessLifetimeProof = "reported" | "target-exit"

export type ChildProcessLifetimeLaunch = {
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly shell?: boolean | string
  readonly signal?: AbortSignal
  readonly proof: ChildProcessLifetimeProof
}

export type ChildProcessLifetimeResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

export type PlatformChildProcessTerminal =
  | ChildProcessLifetimeResult
  | {
      readonly outcome: "proof-lost"
      readonly failure: unknown
    }

export type PlatformChildProcessStopResult =
  | { readonly outcome: "confirmed" }
  | {
      readonly outcome: "proof-lost"
      readonly failure: unknown
    }

export type ChildProcessTargetResult<TCompleted, TFailed> =
  | {
      readonly outcome: "completed"
      readonly value: TCompleted
    }
  | {
      readonly outcome: "failed"
      readonly message: string
      readonly value: TFailed
    }

export type ChildProcessOutcome<TCompleted, TFailed> =
  | { readonly outcome: "unknown" }
  | { readonly outcome: "cancelled" }
  | {
      readonly outcome: "completed"
      readonly targetResult?: ChildProcessLifetimeResult
      readonly value: TCompleted
    }
  | {
      readonly outcome: "failed"
      readonly message: string
      readonly targetResult?: ChildProcessLifetimeResult
      readonly value: TFailed
    }

export type OwnedChildProcessTree<
  TCompleted = ChildProcessLifetimeResult,
  TFailed = ChildProcessLifetimeResult,
> = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly outcome: Promise<ChildProcessOutcome<TCompleted, TFailed>>
  requestCancellation(): void
  reportFailure(error: unknown): void
  reportProofLost(error: unknown): void
  reportResult(result: ChildProcessTargetResult<TCompleted, TFailed>): void
}

export type PlatformOwnedChildProcessTree = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly result: Promise<PlatformChildProcessTerminal>
  stopAndConfirm(): Promise<PlatformChildProcessStopResult>
}

export type ChildProcessLifetimeStopPolicy = {
  readonly forcedStopConfirmationPeriodMs: number
  readonly gracefulStopPeriodMs: number
}

export type ChildProcessLifetimePlatformAdapter = {
  launch(
    request: ChildProcessLifetimeLaunch,
    pendingStopSignal: AbortSignal,
    stopPolicy: ChildProcessLifetimeStopPolicy,
  ): Promise<PlatformOwnedChildProcessTree>
}

export type ChildProcessSecondaryFailureDiagnostic = {
  readonly command: string
  readonly failure: unknown
  readonly kind: "child-process-secondary-failure"
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

export class ChildProcessTreeUnconfirmedError extends Error {
  override readonly name = "ChildProcessTreeUnconfirmedError"
}

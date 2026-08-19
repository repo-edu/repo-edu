import type { Readable, Writable } from "node:stream"
import type { ChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import {
  CancellationTokenSource,
  createMessageConnection,
  NullLogger,
  type ResponseError,
} from "vscode-jsonrpc/node"
import { CodingEventQueue } from "./coding-event-queue.js"
import type {
  CodingAdapter,
  CodingEvent,
  CodingRequest,
  CodingResult,
  CodingRun,
} from "./contracts.js"
import { createStepCodexSdkHostCommand } from "./step-codex-sdk-host-command.js"
import {
  type StepCodexSdkHostProtocolFailure,
  stepCodexSdkHostEventNotification,
  stepCodexSdkHostRunRequest,
} from "./step-codex-sdk-host-protocol.js"

type StepCodexSdkHostProcessResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

type StepCodexSdkHostProcess = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly outcome: Promise<
    | { readonly outcome: "unknown" }
    | { readonly outcome: "cancelled" }
    | {
        readonly outcome: "completed"
        readonly targetResult?: StepCodexSdkHostProcessResult
        readonly value: CodingResult
      }
    | {
        readonly outcome: "failed"
        readonly message: string
        readonly targetResult?: StepCodexSdkHostProcessResult
        readonly value: StepCodexSdkHostProtocolFailure
      }
  >
  requestCancellation(): void
  reportFailure(error: unknown): void
  reportProofLost(error: unknown): void
  reportResult(
    result:
      | { readonly outcome: "completed"; readonly value: CodingResult }
      | {
          readonly outcome: "failed"
          readonly message: string
          readonly value: StepCodexSdkHostProtocolFailure
        },
  ): void
  reportWorkStarted(): void
}

export type StepCodexSdkHostLaunch = (
  request: CodingRequest,
  signal?: AbortSignal,
) => Promise<StepCodexSdkHostProcess>

export class StepCodexSdkHostOutcomeUnknownError extends Error {
  override readonly name = "StepCodexSdkHostOutcomeUnknownError"
}

const SDK_HOST_ERROR_OUTPUT_LIMIT = 2_000

// A read failure on the stream is a secondary diagnostic, never a crash.
function readErrorOutputTail(
  stream: Readable,
  onFailure: (error: unknown) => void,
): () => string {
  let tail = ""
  stream.setEncoding("utf8")
  stream.on("error", onFailure)
  stream.on("data", (chunk: string) => {
    tail = (tail + chunk).slice(-SDK_HOST_ERROR_OUTPUT_LIMIT)
  })
  return () => tail.trim()
}

function withErrorOutput(message: string, errorOutput: string): string {
  return errorOutput.length === 0 ? message : `${message}\n${errorOutput}`
}

function readStepCodexSdkHostFailure(
  error: unknown,
): StepCodexSdkHostProtocolFailure | null {
  const data = (error as ResponseError<StepCodexSdkHostProtocolFailure>)?.data
  return data?.type === "cancelled" || data?.type === "sdk-host-error"
    ? data
    : null
}

function mapStepCodexSdkHostError(
  failure: StepCodexSdkHostProtocolFailure,
): Error {
  if (failure.type === "cancelled") {
    return new Error(failure.message)
  }
  return new Error(failure.message)
}

function defaultLaunch(
  childProcessLifetimeController: ChildProcessLifetimeController,
): StepCodexSdkHostLaunch {
  return async (request, signal) => {
    const sdkHostCommand = createStepCodexSdkHostCommand()
    return await childProcessLifetimeController.launch<
      CodingResult,
      StepCodexSdkHostProtocolFailure
    >({
      command: sdkHostCommand.command,
      args: sdkHostCommand.arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
      proof: "reported",
      shell: false,
      ...(signal === undefined ? {} : { signal }),
    })
  }
}

function createCodingRun(
  request: CodingRequest,
  sdkHostProcess: StepCodexSdkHostProcess,
  signal?: AbortSignal,
): CodingRun {
  const errorOutput = readErrorOutputTail(sdkHostProcess.stderr, (error) =>
    sdkHostProcess.reportFailure(error),
  )
  const connection = createMessageConnection(
    sdkHostProcess.stdout,
    sdkHostProcess.stdin,
    NullLogger,
  )
  const events = new CodingEventQueue<CodingEvent>()
  const cancellation = new CancellationTokenSource()
  const abort = () => {
    cancellation.cancel()
    sdkHostProcess.requestCancellation()
    events.close()
  }
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) abort()

  const eventSubscription = connection.onNotification(
    stepCodexSdkHostEventNotification,
    (event) => events.push(event),
  )
  connection.listen()

  let observedOutcome: Awaited<StepCodexSdkHostProcess["outcome"]> | undefined
  const requestCompletion = connection
    .sendRequest(stepCodexSdkHostRunRequest, request, cancellation.token)
    .then((codingResult) => {
      sdkHostProcess.reportResult({
        outcome: "completed",
        value: codingResult,
      })
    })
    .catch((error: unknown) => {
      if (signal?.aborted) {
        sdkHostProcess.requestCancellation()
        return
      }
      const failure = readStepCodexSdkHostFailure(error)
      if (failure === null) {
        sdkHostProcess.reportProofLost(error)
        return
      }
      sdkHostProcess.reportResult({
        outcome: "failed",
        message: failure.message,
        value: failure,
      })
    })
    .finally(() => {
      events.close()
      if (
        observedOutcome?.outcome !== "unknown" &&
        observedOutcome?.outcome !== "cancelled" &&
        !sdkHostProcess.stdin.writableEnded
      ) {
        sdkHostProcess.stdin.end()
      }
    })
  sdkHostProcess.reportWorkStarted()
  const processOutcome = sdkHostProcess.outcome.then((outcome) => {
    observedOutcome = outcome
    if (outcome.outcome === "unknown" || outcome.outcome === "cancelled") {
      events.close()
      connection.dispose()
    }
    return outcome
  })

  const result = (async (): Promise<CodingResult> => {
    try {
      await requestCompletion
      const outcome = await processOutcome
      if (outcome.outcome === "unknown") {
        throw new StepCodexSdkHostOutcomeUnknownError(
          withErrorOutput(
            "The plan-step Codex SDK host process exited before its result was known.",
            errorOutput(),
          ),
        )
      }
      if (outcome.outcome === "cancelled") {
        throw new DOMException("Coding was stopped.", "AbortError")
      }
      if (outcome.outcome === "failed") {
        throw mapStepCodexSdkHostError(outcome.value)
      }
      return outcome.value
    } finally {
      signal?.removeEventListener("abort", abort)
      eventSubscription.dispose()
      connection.dispose()
      cancellation.dispose()
    }
  })()

  return {
    events,
    result,
    abort,
  }
}

export function createCodingAdapter(
  childProcessLifetimeController: ChildProcessLifetimeController,
  options: { readonly launch?: StepCodexSdkHostLaunch } = {},
): CodingAdapter {
  const launch = options.launch ?? defaultLaunch(childProcessLifetimeController)
  return {
    async start(request, signal) {
      return createCodingRun(request, await launch(request, signal), signal)
    },
  }
}

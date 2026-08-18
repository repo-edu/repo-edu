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
  readonly result: Promise<StepCodexSdkHostProcessResult>
  stopAndConfirm(): Promise<void>
}

export type StepCodexSdkHostLaunch = (
  request: CodingRequest,
  signal?: AbortSignal,
) => Promise<StepCodexSdkHostProcess>

export class StepCodexSdkHostOutcomeUnknownError extends Error {
  override readonly name = "StepCodexSdkHostOutcomeUnknownError"
}

const SDK_HOST_ERROR_OUTPUT_LIMIT = 2_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readErrorOutputTail(stream: Readable): () => string {
  let tail = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    tail = (tail + chunk).slice(-SDK_HOST_ERROR_OUTPUT_LIMIT)
  })
  return () => tail.trim()
}

function withErrorOutput(message: string, errorOutput: string): string {
  return errorOutput.length === 0 ? message : `${message}\n${errorOutput}`
}

function mapStepCodexSdkHostError(error: unknown): Error {
  const data = (
    error as ResponseError<StepCodexSdkHostProtocolFailure> | undefined
  )?.data
  if (data?.type === "cancelled") {
    return new DOMException(data.message, "AbortError")
  }
  if (data?.type === "sdk-host-error") {
    return new Error(data.message, { cause: error })
  }
  return new Error(
    `The plan-step Codex SDK host process failed: ${errorMessage(error)}`,
    { cause: error },
  )
}

function defaultLaunch(
  childProcessLifetimeController: ChildProcessLifetimeController,
): StepCodexSdkHostLaunch {
  return async (request, signal) => {
    const sdkHostCommand = createStepCodexSdkHostCommand()
    return await childProcessLifetimeController.launch({
      command: sdkHostCommand.command,
      args: sdkHostCommand.arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
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
  const errorOutput = readErrorOutputTail(sdkHostProcess.stderr)
  const connection = createMessageConnection(
    sdkHostProcess.stdout,
    sdkHostProcess.stdin,
    NullLogger,
  )
  const events = new CodingEventQueue<CodingEvent>()
  const cancellation = new CancellationTokenSource()
  let abortRequested = false
  let sdkHostStop: Promise<void> | null = null
  const stopSdkHostProcess = (): Promise<void> => {
    sdkHostStop ??= Promise.resolve().then(
      async () => await sdkHostProcess.stopAndConfirm(),
    )
    void sdkHostStop.catch(() => {
      // The result path awaits the same promise and keeps the failure visible.
    })
    return sdkHostStop
  }
  const abort = () => {
    abortRequested = true
    cancellation.cancel()
    void stopSdkHostProcess()
  }
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) abort()
  let requestSettled = false
  const processState: {
    endedBeforeRequest: boolean
    error: unknown
  } = { endedBeforeRequest: false, error: undefined }

  const eventSubscription = connection.onNotification(
    stepCodexSdkHostEventNotification,
    (event) => events.push(event),
  )
  connection.listen()

  const sdkHostCompletion = sdkHostProcess.result.then(
    () => {
      if (!requestSettled) {
        processState.endedBeforeRequest = true
        events.close()
        connection.dispose()
      }
    },
    (error: unknown) => {
      processState.error = error
      if (!requestSettled) {
        processState.endedBeforeRequest = true
        events.close()
        connection.dispose()
      }
    },
  )

  const requestCompletion = connection
    .sendRequest(stepCodexSdkHostRunRequest, request, cancellation.token)
    .finally(() => {
      requestSettled = true
      events.close()
      if (!sdkHostProcess.stdin.writableEnded) {
        sdkHostProcess.stdin.end()
      }
    })

  const result = (async (): Promise<CodingResult> => {
    try {
      let codingResult: CodingResult
      try {
        codingResult = await requestCompletion
      } catch (error) {
        await stopSdkHostProcess()
        await sdkHostCompletion
        if (processState.endedBeforeRequest && !abortRequested) {
          throw new StepCodexSdkHostOutcomeUnknownError(
            withErrorOutput(
              "The plan-step Codex SDK host process exited before its result was known.",
              errorOutput(),
            ),
            { cause: processState.error ?? error },
          )
        }
        if (abortRequested) {
          throw new DOMException("Coding was stopped.", "AbortError")
        }
        throw mapStepCodexSdkHostError(error)
      }

      await stopSdkHostProcess()
      await sdkHostCompletion
      return codingResult
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

import type { Readable, Writable } from "node:stream"
import type { ChildProcessLifetimeAdapter } from "@repo-edu/host-node/child-process-lifetime"
import {
  CancellationTokenSource,
  createMessageConnection,
  NullLogger,
  type ResponseError,
} from "vscode-jsonrpc/node"
import { CodingEventQueue } from "./coding-event-queue.js"
import { createCodingHelperCommand } from "./coding-helper-command.js"
import {
  type CodingHelperFailure,
  codingHelperEventNotification,
  codingHelperRunRequest,
} from "./coding-helper-protocol.js"
import type {
  CodingAdapter,
  CodingEvent,
  CodingRequest,
  CodingResult,
  CodingRun,
} from "./contracts.js"

type CodingHelperProcessResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

type CodingHelperProcess = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly result: Promise<CodingHelperProcessResult>
  stopAndConfirm(): Promise<void>
}

export type CodingHelperLaunch = (
  request: CodingRequest,
  signal?: AbortSignal,
) => Promise<CodingHelperProcess>

export class CodingHelperOutcomeUnknownError extends Error {
  override readonly name = "CodingHelperOutcomeUnknownError"
}

const HELPER_ERROR_OUTPUT_LIMIT = 2_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readErrorOutputTail(stream: Readable): () => string {
  let tail = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    tail = (tail + chunk).slice(-HELPER_ERROR_OUTPUT_LIMIT)
  })
  return () => tail.trim()
}

function withErrorOutput(message: string, errorOutput: string): string {
  return errorOutput.length === 0 ? message : `${message}\n${errorOutput}`
}

function mappedHelperError(error: unknown): Error {
  const data = (error as ResponseError<CodingHelperFailure> | undefined)?.data
  if (data?.type === "cancelled") {
    return new DOMException(data.message, "AbortError")
  }
  if (data?.type === "helper-error") {
    return new Error(data.message, { cause: error })
  }
  return new Error(`The coding helper failed: ${errorMessage(error)}`, {
    cause: error,
  })
}

function defaultLaunch(
  childLifetime: ChildProcessLifetimeAdapter,
): CodingHelperLaunch {
  return async (request, signal) => {
    const helper = createCodingHelperCommand()
    return await childLifetime.launch({
      command: helper.command,
      args: helper.arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
      route: "managed-helper",
      shell: false,
      ...(signal === undefined ? {} : { signal }),
    })
  }
}

function createCodingRun(
  request: CodingRequest,
  helper: CodingHelperProcess,
  signal?: AbortSignal,
): CodingRun {
  const errorOutput = readErrorOutputTail(helper.stderr)
  const connection = createMessageConnection(
    helper.stdout,
    helper.stdin,
    NullLogger,
  )
  const events = new CodingEventQueue<CodingEvent>()
  const cancellation = new CancellationTokenSource()
  let abortRequested = false
  let helperStop: Promise<void> | null = null
  const stopHelper = (): Promise<void> => {
    helperStop ??= Promise.resolve().then(
      async () => await helper.stopAndConfirm(),
    )
    void helperStop.catch(() => {
      // The result path awaits the same promise and keeps the failure visible.
    })
    return helperStop
  }
  const abort = () => {
    abortRequested = true
    cancellation.cancel()
    void stopHelper()
  }
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) abort()
  let requestSettled = false
  const processState: {
    endedBeforeRequest: boolean
    error: unknown
  } = { endedBeforeRequest: false, error: undefined }

  const eventSubscription = connection.onNotification(
    codingHelperEventNotification,
    (event) => events.push(event),
  )
  connection.listen()

  const helperCompletion = helper.result.then(
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
    .sendRequest(codingHelperRunRequest, request, cancellation.token)
    .finally(() => {
      requestSettled = true
      events.close()
      if (!helper.stdin.writableEnded) {
        helper.stdin.end()
      }
    })

  const result = (async (): Promise<CodingResult> => {
    try {
      let codingResult: CodingResult
      try {
        codingResult = await requestCompletion
      } catch (error) {
        await stopHelper()
        await helperCompletion
        if (processState.endedBeforeRequest && !abortRequested) {
          throw new CodingHelperOutcomeUnknownError(
            withErrorOutput(
              "The coding helper exited before its result was known.",
              errorOutput(),
            ),
            { cause: processState.error ?? error },
          )
        }
        if (abortRequested) {
          throw new DOMException("Coding was stopped.", "AbortError")
        }
        throw mappedHelperError(error)
      }

      await stopHelper()
      await helperCompletion
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
  childLifetime: ChildProcessLifetimeAdapter,
  options: { readonly launch?: CodingHelperLaunch } = {},
): CodingAdapter {
  const launch = options.launch ?? defaultLaunch(childLifetime)
  return {
    async start(request, signal) {
      return createCodingRun(request, await launch(request, signal), signal)
    },
  }
}

import type { Readable, Writable } from "node:stream"
import {
  createMessageConnection,
  ErrorCodes,
  NullLogger,
  ResponseError,
} from "vscode-jsonrpc/node"
import {
  type CodingHelperFailure,
  codingHelperEventNotification,
  codingHelperRunRequest,
} from "./coding-helper-protocol.js"
import { runCodexCodingStep } from "./coding-sdk.js"
import type { CodingEvent, CodingRequest, CodingResult } from "./contracts.js"

export type CodingHelperRun = (options: {
  readonly request: CodingRequest
  readonly signal: AbortSignal
  readonly emit: (event: CodingEvent) => void | Promise<void>
}) => Promise<CodingResult>

export type CodingHelperServerOptions = {
  readonly run?: CodingHelperRun
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function helperFailure(error: unknown): CodingHelperFailure {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { type: "cancelled", message: error.message }
  }
  return { type: "helper-error", message: errorMessage(error) }
}

export async function runCodingHelperServer(
  input: Readable,
  output: Writable,
  options: CodingHelperServerOptions = {},
): Promise<void> {
  const connection = createMessageConnection(input, output, NullLogger)
  const run: CodingHelperRun =
    options.run ??
    (({ request, signal, emit }) =>
      runCodexCodingStep(request, { signal, emit }))
  let accepted = false
  const requestState: { activeController: AbortController | null } = {
    activeController: null,
  }
  let activeRequest: Promise<void> | null = null
  const closed = new Promise<void>((resolve) => {
    connection.onClose(resolve)
  })

  connection.onRequest(codingHelperRunRequest, async (request, token) => {
    if (accepted) {
      throw new ResponseError(
        ErrorCodes.InvalidRequest,
        "The coding helper accepts exactly one request.",
      )
    }
    accepted = true
    const controller = new AbortController()
    requestState.activeController = controller
    if (token.isCancellationRequested) {
      controller.abort()
    }
    const cancellation = token.onCancellationRequested(() => {
      controller.abort()
    })
    const settled = Promise.withResolvers<void>()
    activeRequest = settled.promise

    try {
      return await run({
        request,
        signal: controller.signal,
        emit: (event) =>
          connection.sendNotification(codingHelperEventNotification, event),
      })
    } catch (error) {
      throw new ResponseError(
        ErrorCodes.InternalError,
        errorMessage(error),
        helperFailure(error),
      )
    } finally {
      cancellation.dispose()
      requestState.activeController = null
      settled.resolve()
    }
  })

  connection.listen()
  await closed
  requestState.activeController?.abort()
  await activeRequest
  connection.dispose()
}

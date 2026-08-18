import type { Readable, Writable } from "node:stream"
import {
  createMessageConnection,
  ErrorCodes,
  NullLogger,
  ResponseError,
} from "vscode-jsonrpc/node"
import { runCodexCodingStep } from "./coding-sdk.js"
import type { CodingEvent, CodingRequest, CodingResult } from "./contracts.js"
import {
  type StepCodexSdkHostProtocolFailure,
  stepCodexSdkHostEventNotification,
  stepCodexSdkHostRunRequest,
} from "./step-codex-sdk-host-protocol.js"

export type StepCodexSdkHostRun = (options: {
  readonly request: CodingRequest
  readonly signal: AbortSignal
  readonly emit: (event: CodingEvent) => void | Promise<void>
}) => Promise<CodingResult>

export type StepCodexSdkHostServerOptions = {
  readonly run?: StepCodexSdkHostRun
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toStepCodexSdkHostProtocolFailure(
  error: unknown,
): StepCodexSdkHostProtocolFailure {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { type: "cancelled", message: error.message }
  }
  return { type: "sdk-host-error", message: errorMessage(error) }
}

export async function runStepCodexSdkHostServer(
  input: Readable,
  output: Writable,
  options: StepCodexSdkHostServerOptions = {},
): Promise<void> {
  const connection = createMessageConnection(input, output, NullLogger)
  const run: StepCodexSdkHostRun =
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

  connection.onRequest(stepCodexSdkHostRunRequest, async (request, token) => {
    if (accepted) {
      throw new ResponseError(
        ErrorCodes.InvalidRequest,
        "The plan-step Codex SDK host process accepts exactly one request.",
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
          connection.sendNotification(stepCodexSdkHostEventNotification, event),
      })
    } catch (error) {
      throw new ResponseError(
        ErrorCodes.InternalError,
        errorMessage(error),
        toStepCodexSdkHostProtocolFailure(error),
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

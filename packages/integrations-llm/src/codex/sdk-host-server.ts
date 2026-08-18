import type { Readable, Writable } from "node:stream"
import {
  LlmError,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import {
  createMessageConnection,
  ErrorCodes,
  NullLogger,
  ResponseError,
} from "vscode-jsonrpc/node"
import { runCodexQueryStream } from "./runner.js"
import {
  type CodexSdkHostProtocolFailure,
  type CodexSdkHostRunParams,
  codexSdkHostEventNotification,
  codexSdkHostRunRequest,
  codexSdkHostTraceNotification,
} from "./sdk-host-protocol.js"
import type { TraceSink } from "./trace.js"

export type CodexSdkHostRun = (options: {
  readonly request: CodexSdkHostRunParams
  readonly signal: AbortSignal
  readonly trace: TraceSink
}) => AsyncIterable<LlmStreamEvent>

export type CodexSdkHostServerOptions = {
  readonly run?: CodexSdkHostRun
}

const defaultRun: CodexSdkHostRun = ({ request, signal, trace }) =>
  runCodexQueryStream(
    {
      spec: request.spec,
      prompt: request.prompt,
      signal,
      trace,
    },
    request.config,
  )

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toCodexSdkHostProtocolFailure(
  error: unknown,
): CodexSdkHostProtocolFailure {
  if (error instanceof LlmError) {
    return {
      type: "llm-error",
      kind: error.kind,
      message: error.message,
      context: error.context,
    }
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { type: "cancelled", message: error.message }
  }
  return { type: "sdk-host-error", message: errorMessage(error) }
}

export async function runCodexSdkHostServer(
  input: Readable,
  output: Writable,
  options: CodexSdkHostServerOptions = {},
): Promise<void> {
  const connection = createMessageConnection(input, output, NullLogger)
  const run = options.run ?? defaultRun
  let acceptedRequest = false
  const requestState: { activeController: AbortController | null } = {
    activeController: null,
  }
  let requestSettled: Promise<void> | null = null

  const connectionClosed = new Promise<void>((resolve) => {
    connection.onClose(resolve)
  })

  connection.onRequest(codexSdkHostRunRequest, async (request, token) => {
    if (acceptedRequest) {
      throw new ResponseError(
        ErrorCodes.InvalidRequest,
        "The Codex SDK host process accepts exactly one request.",
      )
    }
    acceptedRequest = true
    const controller = new AbortController()
    requestState.activeController = controller
    if (token.isCancellationRequested) {
      controller.abort()
    }
    const cancellation = token.onCancellationRequested(() => {
      controller.abort()
    })
    let settleRequest: (() => void) | undefined
    requestSettled = new Promise<void>((resolve) => {
      settleRequest = resolve
    })
    let traceWrite = Promise.resolve()
    const trace: TraceSink = (text) => {
      traceWrite = traceWrite.then(() =>
        connection.sendNotification(codexSdkHostTraceNotification, text),
      )
    }

    try {
      for await (const event of run({
        request,
        signal: controller.signal,
        trace,
      })) {
        await connection.sendNotification(codexSdkHostEventNotification, event)
      }
      await traceWrite
      return { status: "completed" as const }
    } catch (error) {
      throw new ResponseError(
        ErrorCodes.InternalError,
        errorMessage(error),
        toCodexSdkHostProtocolFailure(error),
      )
    } finally {
      cancellation.dispose()
      requestState.activeController = null
      settleRequest?.()
    }
  })

  connection.listen()
  await connectionClosed
  requestState.activeController?.abort()
  await requestSettled
  connection.dispose()
}

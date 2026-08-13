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
import {
  type CodexHelperFailure,
  type CodexHelperRunParams,
  codexHelperEventNotification,
  codexHelperRunRequest,
  codexHelperTraceNotification,
} from "./helper-protocol.js"
import { runCodexQueryStream } from "./runner.js"
import type { TraceSink } from "./trace.js"

export type CodexHelperRun = (options: {
  readonly request: CodexHelperRunParams
  readonly signal: AbortSignal
  readonly trace: TraceSink
}) => AsyncIterable<LlmStreamEvent>

export type CodexHelperServerOptions = {
  readonly run?: CodexHelperRun
}

const defaultRun: CodexHelperRun = ({ request, signal, trace }) =>
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

function toHelperFailure(error: unknown): CodexHelperFailure {
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
  return { type: "helper-error", message: errorMessage(error) }
}

export async function runCodexHelperServer(
  input: Readable,
  output: Writable,
  options: CodexHelperServerOptions = {},
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

  connection.onRequest(codexHelperRunRequest, async (request, token) => {
    if (acceptedRequest) {
      throw new ResponseError(
        ErrorCodes.InvalidRequest,
        "The Codex helper accepts exactly one request.",
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
        connection.sendNotification(codexHelperTraceNotification, text),
      )
    }

    try {
      for await (const event of run({
        request,
        signal: controller.signal,
        trace,
      })) {
        await connection.sendNotification(codexHelperEventNotification, event)
      }
      await traceWrite
      return { status: "completed" as const }
    } catch (error) {
      throw new ResponseError(
        ErrorCodes.InternalError,
        errorMessage(error),
        toHelperFailure(error),
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

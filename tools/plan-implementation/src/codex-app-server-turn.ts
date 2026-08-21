import type { OwnedChildProcessTree } from "@repo-edu/host-node/child-process-lifetime"
import {
  ErrorCodes,
  NotificationType,
  RequestType,
  ResponseError,
} from "vscode-jsonrpc/node"
import type { CodexAppServerConnection } from "./codex-app-server-connection.js"
import {
  type CodexAppServerAgentMessage,
  codexAppServerAgentMessageSchema,
  codexAppServerProtocolErrorSchema,
  codexAppServerTurnCompletedNotificationSchema,
  codexAppServerTurnStartResponseSchema,
} from "./codex-app-server-schemas.js"
import { codingResultJsonSchema, parseCodingOutput } from "./coding-result.js"
import type { CodingResult } from "./contracts.js"

export type CodexAppServerTurnStartParams = ReturnType<
  typeof buildCodexAppServerTurnStartParams
>

export type CodexAppServerTurnFailure = {
  readonly kind: "invalid-result" | "server-error" | "turn-interrupted"
  readonly message: string
}

export type CodexAppServerTurnProcess = Pick<
  OwnedChildProcessTree<CodingResult, CodexAppServerTurnFailure>,
  "reportFailure" | "reportProofLost" | "reportResult" | "requestCancellation"
>

export type CodexAppServerTurn = {
  readonly completion: Promise<void>
  abort(): void
}

export type CodexAppServerTurnOptions = {
  readonly prompt: string
  readonly signal?: AbortSignal
}

const turnStartRequest = new RequestType<
  CodexAppServerTurnStartParams,
  unknown,
  unknown
>("turn/start")
const turnInterruptRequest = new RequestType<
  { readonly threadId: string; readonly turnId: string },
  unknown,
  unknown
>("turn/interrupt")
const turnCompletedNotification = new NotificationType<unknown>(
  "turn/completed",
)

export function buildCodexAppServerTurnStartParams(
  threadId: string,
  prompt: string,
) {
  if (threadId.length === 0) {
    throw new Error("The Codex app-server thread ID must not be empty.")
  }
  if (prompt.trim().length === 0) {
    throw new Error("The Codex app-server turn prompt must not be empty.")
  }
  return {
    threadId,
    input: [{ type: "text", text: prompt, text_elements: [] }],
    outputSchema: codingResultJsonSchema,
  } as const
}

function withErrorOutput(message: string, errorOutput: string): string {
  return errorOutput.length === 0 ? message : `${message}\n${errorOutput}`
}

function responseError(error: unknown) {
  if (!(error instanceof ResponseError)) return null
  const parsed = codexAppServerProtocolErrorSchema.safeParse({
    code: error.code,
    data: error.data,
    message: error.message,
  })
  return parsed.success ? parsed.data : null
}

function isConnectionResponseError(code: number): boolean {
  return (
    code === ErrorCodes.ConnectionInactive ||
    code === ErrorCodes.MessageWriteError ||
    code === ErrorCodes.PendingResponseRejected
  )
}

function finalAgentMessage(
  items: readonly unknown[],
): CodexAppServerAgentMessage | undefined {
  const messages: CodexAppServerAgentMessage[] = []
  for (const item of items) {
    const parsed = codexAppServerAgentMessageSchema.safeParse(item)
    if (
      parsed.success &&
      (parsed.data.phase === "final_answer" || parsed.data.phase == null)
    ) {
      messages.push(parsed.data)
    }
  }
  return messages.at(-1)
}

export function startCodexAppServerTurn(
  connection: CodexAppServerConnection,
  process: CodexAppServerTurnProcess,
  options: CodexAppServerTurnOptions,
): CodexAppServerTurn {
  const completion = Promise.withResolvers<void>()
  const subscriptions: { dispose(): void }[] = []
  let factReported = false
  let workStarted = false
  let turnId: string | undefined

  const cleanup = (): void => {
    for (const subscription of subscriptions.splice(0)) {
      subscription.dispose()
    }
    options.signal?.removeEventListener("abort", abort)
  }
  const reportFact = (report: () => void): void => {
    if (factReported) return
    factReported = true
    cleanup()
    report()
    completion.resolve()
  }
  const reportKnownFailure = (
    kind: CodexAppServerTurnFailure["kind"],
    message: string,
  ): void => {
    const failure = {
      kind,
      message: withErrorOutput(message, connection.errorOutput()),
    } as const
    reportFact(() => {
      process.reportResult({
        outcome: "failed",
        message: failure.message,
        value: failure,
      })
    })
  }
  const reportProtocolLoss = (message: string, cause?: unknown): void => {
    const failure = new Error(
      withErrorOutput(message, connection.errorOutput()),
      cause === undefined ? undefined : { cause },
    )
    reportFact(() => process.reportProofLost(failure))
  }
  const reportConnectionFailure = (error: unknown): void => {
    if (factReported) {
      process.reportFailure(error)
      return
    }
    if (workStarted) {
      reportProtocolLoss(
        "The Codex app-server proving connection was lost during the turn.",
        error,
      )
      return
    }
    reportKnownFailure(
      "server-error",
      "The Codex app-server connection failed before the turn started.",
    )
  }
  const admitCompletion = (value: unknown): void => {
    if (factReported) return
    const parsed =
      codexAppServerTurnCompletedNotificationSchema.safeParse(value)
    if (!parsed.success) {
      reportProtocolLoss(
        "Codex app-server sent a malformed turn/completed notification.",
        parsed.error,
      )
      return
    }
    if (parsed.data.threadId !== connection.threadId) return
    if (turnId === undefined) {
      reportProtocolLoss(
        "Codex app-server completed the turn before its start reply was admitted.",
      )
      return
    }
    if (parsed.data.turn.id !== turnId) return

    if (parsed.data.turn.status === "interrupted") {
      reportKnownFailure(
        "turn-interrupted",
        "The Codex app-server turn was interrupted.",
      )
      return
    }
    if (parsed.data.turn.status === "failed") {
      reportKnownFailure(
        "server-error",
        parsed.data.turn.error?.message ??
          "The Codex app-server turn failed without an error message.",
      )
      return
    }

    const message = finalAgentMessage(parsed.data.turn.items)
    if (message === undefined) {
      reportKnownFailure(
        "invalid-result",
        "The Codex app-server turn completed without a final agent message.",
      )
      return
    }
    try {
      const result = parseCodingOutput(message.text)
      reportFact(() =>
        process.reportResult({ outcome: "completed", value: result }),
      )
    } catch (error) {
      reportKnownFailure(
        "invalid-result",
        error instanceof Error
          ? error.message
          : "Codex returned an invalid structured coding result.",
      )
    }
  }

  if (!connection.isWritable()) {
    reportKnownFailure(
      "server-error",
      "The Codex app-server connection is not writable.",
    )
    return { completion: completion.promise, abort }
  }

  subscriptions.push(
    connection.rpc.onNotification(turnCompletedNotification, admitCompletion),
    connection.rpc.onError(([error]) => reportConnectionFailure(error)),
    connection.rpc.onClose(() =>
      reportConnectionFailure(
        new Error("The Codex app-server connection closed."),
      ),
    ),
    connection.rpc.onDispose(() =>
      reportConnectionFailure(
        new Error("The Codex app-server connection was disposed."),
      ),
    ),
  )

  const startWritten = connection.onRequestWritten("turn/start", () => {
    workStarted = true
  })
  subscriptions.push(startWritten)
  let startResponse: Promise<unknown>
  try {
    startResponse = connection.rpc.sendRequest(
      turnStartRequest,
      buildCodexAppServerTurnStartParams(connection.threadId, options.prompt),
    )
  } catch (error) {
    reportConnectionFailure(error)
    return { completion: completion.promise, abort }
  }

  void startResponse
    .then((value) => {
      if (factReported) return
      const parsed = codexAppServerTurnStartResponseSchema.safeParse(value)
      if (!parsed.success) {
        reportProtocolLoss(
          "Codex app-server sent a malformed turn/start reply.",
          parsed.error,
        )
        return
      }
      turnId = parsed.data.turn.id
    })
    .catch((error: unknown) => {
      if (factReported) return
      const serverError = responseError(error)
      if (
        serverError !== null &&
        !isConnectionResponseError(serverError.code)
      ) {
        reportKnownFailure("server-error", serverError.message)
        return
      }
      reportConnectionFailure(error)
    })

  function abort(): void {
    if (factReported) return
    const reportCancellation = (): void =>
      reportFact(() => process.requestCancellation())
    if (turnId === undefined || !connection.isWritable()) {
      reportCancellation()
      return
    }

    const interruptWritten = connection.onRequestWritten(
      "turn/interrupt",
      reportCancellation,
    )
    subscriptions.push(interruptWritten)
    try {
      void connection.rpc
        .sendRequest(turnInterruptRequest, {
          threadId: connection.threadId,
          turnId,
        })
        .catch((error: unknown) => {
          if (factReported) return
          interruptWritten.dispose()
          process.reportFailure(error)
          reportCancellation()
        })
    } catch (error) {
      interruptWritten.dispose()
      process.reportFailure(error)
      reportCancellation()
    }
  }

  options.signal?.addEventListener("abort", abort, { once: true })
  if (options.signal?.aborted) abort()

  return { completion: completion.promise, abort }
}

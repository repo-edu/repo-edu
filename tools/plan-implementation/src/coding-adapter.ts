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
) => Promise<CodingHelperProcess>

export class CodingHelperOutcomeUnknownError extends Error {
  override readonly name = "CodingHelperOutcomeUnknownError"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  return async (request) => {
    const helper = createCodingHelperCommand()
    return await childLifetime.launch({
      command: helper.command,
      args: helper.arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
      route: "managed-helper",
      shell: false,
    })
  }
}

function createCodingRun(
  request: CodingRequest,
  helper: CodingHelperProcess,
): CodingRun {
  helper.stderr.resume()
  const connection = createMessageConnection(
    helper.stdout,
    helper.stdin,
    NullLogger,
  )
  const events = new CodingEventQueue<CodingEvent>()
  const cancellation = new CancellationTokenSource()
  let requestSettled = false
  const processState: {
    endedBeforeRequest: boolean
    error: unknown
    result: CodingHelperProcessResult | null
  } = { endedBeforeRequest: false, error: undefined, result: null }

  const eventSubscription = connection.onNotification(
    codingHelperEventNotification,
    (event) => events.push(event),
  )
  connection.listen()

  const helperCompletion = helper.result.then(
    (processResult) => {
      processState.result = processResult
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
        await helper.stopAndConfirm()
        await helperCompletion
        if (processState.endedBeforeRequest) {
          throw new CodingHelperOutcomeUnknownError(
            "The coding helper exited before its result was known.",
            { cause: processState.error ?? error },
          )
        }
        throw mappedHelperError(error)
      }

      await helperCompletion
      if (processState.error !== undefined) {
        throw new CodingHelperOutcomeUnknownError(
          `The coding helper process failed: ${errorMessage(processState.error)}`,
          { cause: processState.error },
        )
      }
      const processResult = processState.result
      if (
        processResult === null ||
        processResult.exitCode !== 0 ||
        processResult.signal !== null
      ) {
        throw new CodingHelperOutcomeUnknownError(
          `The coding helper outcome is unknown (${processResult?.exitCode ?? "no exit"}, ${processResult?.signal ?? "no signal"}).`,
        )
      }
      return codingResult
    } finally {
      eventSubscription.dispose()
      connection.dispose()
      cancellation.dispose()
    }
  })()

  return {
    events,
    result,
    abort() {
      cancellation.cancel()
    },
  }
}

export function createCodingAdapter(
  childLifetime: ChildProcessLifetimeAdapter,
  options: { readonly launch?: CodingHelperLaunch } = {},
): CodingAdapter {
  const launch = options.launch ?? defaultLaunch(childLifetime)
  return {
    async start(request) {
      return createCodingRun(request, await launch(request))
    },
  }
}

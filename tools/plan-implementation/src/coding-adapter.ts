import type {
  ChildProcessLifetimeController,
  ChildProcessOutcome,
  OwnedChildProcessTree,
} from "@repo-edu/host-node/child-process-lifetime"
import { resolveCodexAppServerCommand } from "./codex-app-server-command.js"
import {
  type CodexAppServerConnection,
  startCodexAppServerConnection,
} from "./codex-app-server-connection.js"
import { createCodexAppServerEventMapper } from "./codex-app-server-events.js"
import { createCodexAppServerReviewOwner } from "./codex-app-server-review.js"
import {
  type CodexAppServerTurn,
  type CodexAppServerTurnFailure,
  startCodexAppServerTurn,
} from "./codex-app-server-turn.js"
import { CodingEventQueue } from "./coding-event-queue.js"
import { buildCodingPrompt } from "./coding-prompt.js"
import type {
  CodingAdapter,
  CodingEvent,
  CodingRequest,
  CodingResult,
  CodingRun,
} from "./contracts.js"
import type { HumanReviewPort } from "./human-review.js"

export type CodexAppServerProcess = OwnedChildProcessTree<
  CodingResult,
  CodexAppServerTurnFailure
>

export type CodexAppServerLaunch = (
  request: CodingRequest,
) => Promise<CodexAppServerProcess>

export type CodingAdapterOptions = {
  readonly humanReview: HumanReviewPort
  readonly launch?: CodexAppServerLaunch
}

function defaultLaunch(
  childProcessLifetimeController: ChildProcessLifetimeController,
): CodexAppServerLaunch {
  return async (request) => {
    const appServerCommand = resolveCodexAppServerCommand()
    return await childProcessLifetimeController.launch<
      CodingResult,
      CodexAppServerTurnFailure
    >({
      command: appServerCommand.command,
      args: appServerCommand.arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
      proof: "reported",
    })
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function reportStartupFailure(
  process: CodexAppServerProcess,
  error: unknown,
): void {
  const message = errorMessage(error)
  process.reportResult({
    outcome: "failed",
    message,
    value: { kind: "server-error", message },
  })
}

function readControllerOutcome(
  outcome: ChildProcessOutcome<CodingResult, CodexAppServerTurnFailure>,
): CodingResult {
  switch (outcome.outcome) {
    case "completed":
      return outcome.value
    case "failed":
      throw new Error(outcome.message)
    case "cancelled":
      throw new DOMException("Coding was stopped.", "AbortError")
    case "unknown":
      throw new Error(
        "The child-process lifetime controller could not prove the Codex app-server result.",
      )
  }
}

function createCodingRun(
  request: CodingRequest,
  prompt: string,
  process: CodexAppServerProcess,
  humanReview: HumanReviewPort,
  signal?: AbortSignal,
): CodingRun {
  const events = new CodingEventQueue<CodingEvent>()
  let connection: CodexAppServerConnection | undefined
  let turn: CodexAppServerTurn | undefined
  let cancellationRequested = false

  const abort = (): void => {
    if (cancellationRequested) return
    cancellationRequested = true
    if (turn === undefined) {
      process.requestCancellation()
    } else {
      turn.abort()
    }
  }
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) abort()

  const result = (async (): Promise<CodingResult> => {
    let notifications: { dispose(): void } | undefined
    let review: { dispose(): void } | undefined
    try {
      if (!cancellationRequested) {
        try {
          connection = await startCodexAppServerConnection(process, {
            repoEduRoot: request.repoEduRoot,
            onStderrFailure: (error) => process.reportFailure(error),
          })
          if (!cancellationRequested) {
            const mapper = createCodexAppServerEventMapper({
              threadId: connection.threadId,
              emit: (event) => events.push(event),
            })
            notifications = connection.onNotification(mapper.notification)
            review = createCodexAppServerReviewOwner(connection, humanReview, {
              emit: (event) => events.push(event),
            })
            turn = startCodexAppServerTurn(connection, process, { prompt })
          }
        } catch (error) {
          if (!cancellationRequested) reportStartupFailure(process, error)
        }
      }

      return readControllerOutcome(await process.outcome)
    } finally {
      signal?.removeEventListener("abort", abort)
      review?.dispose()
      notifications?.dispose()
      connection?.dispose()
      events.close()
    }
  })()

  return { abort, events, result }
}

export function createCodingAdapter(
  childProcessLifetimeController: ChildProcessLifetimeController,
  options: CodingAdapterOptions,
): CodingAdapter {
  const launch = options.launch ?? defaultLaunch(childProcessLifetimeController)
  return {
    async start(request, signal) {
      const prompt = buildCodingPrompt(request)
      const process = await launch(request)
      return createCodingRun(
        request,
        prompt,
        process,
        options.humanReview,
        signal,
      )
    },
  }
}

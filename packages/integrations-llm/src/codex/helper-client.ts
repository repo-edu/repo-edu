import type { Readable, Writable } from "node:stream"
import {
  type CodexLlmProviderRuntimeConfig,
  type GenerateTextRequest,
  type LlmAuthMode,
  LlmError,
  type LlmResult,
  type LlmStreamEvent,
  type LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import {
  CancellationTokenSource,
  createMessageConnection,
  NullLogger,
} from "vscode-jsonrpc/node"
import { resolveCodexAuth } from "./auth.js"
import {
  abortError,
  type HelperFailure,
  mapHelperFailure,
  unknownOutcomeError,
} from "./helper-errors.js"
import { AsyncEventQueue } from "./helper-event-queue.js"
import {
  codexHelperEventNotification,
  codexHelperRunRequest,
  codexHelperTraceNotification,
} from "./helper-protocol.js"
import type { TraceSink } from "./trace.js"

export type CodexHelperProcessResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

export type CodexHelperProcess = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly result: Promise<CodexHelperProcessResult>
  stopAndConfirm(): Promise<void>
}

export type CodexHelperLaunch = (
  startupSignal: AbortSignal,
) => Promise<CodexHelperProcess>

export type CreateCodexLlmTextClientOptions = {
  readonly launch?: CodexHelperLaunch
  readonly trace?: TraceSink
}

function validateRequest(
  request: GenerateTextRequest,
  config: CodexLlmProviderRuntimeConfig | undefined,
): LlmAuthMode {
  if (request.spec.provider !== "codex") {
    throw new Error(
      `Codex adapter received non-codex spec.provider="${request.spec.provider}"`,
    )
  }
  const authMode = resolveCodexAuth(config).authMode
  if (request.spec.effort === "max") {
    throw new LlmError("other", "effort 'max' is not supported on Codex", {
      context: { provider: "codex", authMode },
    })
  }
  return authMode
}

const helperOutputLimit = 8_192

// The helper's error output is kept, not drained away, so a lost helper can
// still say why it died. The limit keeps a noisy helper from filling memory.
function collectHelperOutput(stream: Readable): () => string {
  let collected = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    if (collected.length >= helperOutputLimit) {
      return
    }
    collected = (collected + chunk).slice(0, helperOutputLimit)
  })
  return () => collected
}

async function collectCodexStream(
  stream: AsyncIterable<LlmStreamEvent>,
): Promise<LlmResult> {
  let reply = ""
  let usage: LlmResult["usage"] | null = null
  for await (const event of stream) {
    if (event.kind === "text-delta") {
      reply += event.text
    } else if (event.kind === "done") {
      usage = event.usage
    }
  }
  if (usage === null) {
    throw new Error("Codex stream ended without a terminal usage event.")
  }
  return { reply, usage }
}

async function launchHelperForRequest(
  launch: CodexHelperLaunch,
  requestSignal: AbortSignal | undefined,
): Promise<CodexHelperProcess> {
  const startupStop = new AbortController()
  const stopStartup = () => {
    startupStop.abort(requestSignal?.reason)
  }
  requestSignal?.addEventListener("abort", stopStartup, { once: true })
  if (requestSignal?.aborted) {
    stopStartup()
  }

  try {
    return await launch(startupStop.signal)
  } catch (error) {
    if (requestSignal?.aborted) {
      throw abortError("Operation cancelled.", error)
    }
    throw error
  } finally {
    requestSignal?.removeEventListener("abort", stopStartup)
  }
}

async function throwCancellationAfterStop(
  stopAndConfirm: Promise<void>,
): Promise<never> {
  try {
    await stopAndConfirm
  } catch (error) {
    throw abortError("Operation cancelled.", error)
  }
  throw abortError()
}

async function* runCodexHelperStream(
  request: GenerateTextRequest,
  config: CodexLlmProviderRuntimeConfig | undefined,
  options: CreateCodexLlmTextClientOptions,
): AsyncIterable<LlmStreamEvent> {
  const authMode = validateRequest(request, config)
  if (options.launch === undefined) {
    throw new LlmError("other", "The Codex managed helper is not configured.", {
      context: { provider: "codex", authMode },
    })
  }
  if (request.signal?.aborted) {
    throw abortError()
  }

  const helper = await launchHelperForRequest(options.launch, request.signal)
  if (request.signal?.aborted) {
    if (!helper.stdin.writableEnded) {
      helper.stdin.end()
    }
    return await throwCancellationAfterStop(helper.stopAndConfirm())
  }
  const readHelperOutput = collectHelperOutput(helper.stderr)
  const connection = createMessageConnection(
    helper.stdout,
    helper.stdin,
    NullLogger,
  )
  const events = new AsyncEventQueue<LlmStreamEvent>()
  const cancellation = new CancellationTokenSource()
  const requestState: {
    failure: HelperFailure | null
    settled: boolean
  } = {
    failure: null,
    settled: false,
  }
  const eventSubscription = connection.onNotification(
    codexHelperEventNotification,
    (event) => events.push(event),
  )
  const traceSubscription = connection.onNotification(
    codexHelperTraceNotification,
    (text) => options.trace?.(text),
  )
  connection.listen()

  const cancellationStarted = Promise.withResolvers<void>()
  let cancellationStop: Promise<void> | null = null
  const cancel = (): Promise<void> => {
    cancellation.cancel()
    events.close()
    cancellationStop ??= helper.stopAndConfirm()
    void cancellationStop.catch(() => undefined)
    return cancellationStop
  }
  const onAbort = () => {
    cancellationStarted.resolve()
    void cancel()
  }
  request.signal?.addEventListener("abort", onAbort, { once: true })

  const waitForActiveWork = async <T>(work: Promise<T>): Promise<T> => {
    const winner = await Promise.race([
      work.then((value) => ({ kind: "work", value }) as const),
      cancellationStarted.promise.then(
        () => ({ kind: "cancellation" }) as const,
      ),
    ])
    if (winner.kind === "cancellation") {
      return await throwCancellationAfterStop(cancellationStop ?? cancel())
    }
    return winner.value
  }

  const processCompletion = helper.result.then(
    () => {
      if (!requestState.settled) {
        requestState.failure = {
          error: unknownOutcomeError(authMode, {
            output: readHelperOutput(),
          }),
          outcome: "unknown",
        }
        events.close()
        connection.dispose()
      }
    },
    (error: unknown) => {
      if (!requestState.settled) {
        requestState.failure = {
          error: unknownOutcomeError(authMode, {
            cause: error,
            output: readHelperOutput(),
          }),
          outcome: "unknown",
        }
        events.close()
        connection.dispose()
      }
    },
  )

  const completion = connection
    .sendRequest(
      codexHelperRunRequest,
      {
        config,
        spec: request.spec,
        prompt: request.prompt,
      },
      cancellation.token,
    )
    .catch((error: unknown) => {
      requestState.failure = mapHelperFailure(
        error,
        authMode,
        request.signal,
        readHelperOutput(),
      )
    })
    .finally(() => {
      requestState.settled = true
      events.close()
      if (!request.signal?.aborted && !helper.stdin.writableEnded) {
        helper.stdin.end()
      }
    })

  try {
    for await (const event of events) {
      yield event
    }
    await waitForActiveWork(completion)

    if (requestState.failure?.outcome === "unknown") {
      await helper.stopAndConfirm()
      await waitForActiveWork(processCompletion)
    } else {
      await waitForActiveWork(helper.stopAndConfirm())
      await waitForActiveWork(processCompletion)
    }

    if (requestState.failure !== null) {
      throw requestState.failure.error
    }
  } finally {
    request.signal?.removeEventListener("abort", onAbort)
    if (!requestState.settled) {
      const stop = cancellationStop ?? cancel()
      if (request.signal?.aborted) {
        await stop.catch(() => undefined)
      } else {
        await stop
      }
    }
    eventSubscription.dispose()
    traceSubscription.dispose()
    cancellation.dispose()
    connection.dispose()
  }
}

export function createCodexLlmTextClient(
  config?: CodexLlmProviderRuntimeConfig,
  options: CreateCodexLlmTextClientOptions = {},
): LlmTextClient {
  return {
    generateText(request): Promise<LlmResult> {
      return collectCodexStream(runCodexHelperStream(request, config, options))
    },
    streamText(request): AsyncIterable<LlmStreamEvent> {
      return runCodexHelperStream(request, config, options)
    },
  }
}

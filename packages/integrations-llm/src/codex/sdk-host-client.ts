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
import { addCleanupCause } from "../error-cause.js"
import { AsyncEventQueue } from "./async-event-queue.js"
import { resolveCodexAuth } from "./auth.js"
import {
  abortError,
  type CodexSdkHostFailure,
  mapCodexSdkHostFailure,
  unknownOutcomeError,
} from "./sdk-host-errors.js"
import {
  codexSdkHostEventNotification,
  codexSdkHostRunRequest,
  codexSdkHostTraceNotification,
} from "./sdk-host-protocol.js"
import type { TraceSink } from "./trace.js"

export type CodexSdkHostProcessResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

export type CodexSdkHostProcess = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly result: Promise<CodexSdkHostProcessResult>
  stopAndConfirm(): Promise<void>
}

export type CodexSdkHostLaunch = (
  startupSignal: AbortSignal,
) => Promise<CodexSdkHostProcess>

export type CreateCodexLlmTextClientOptions = {
  readonly launch?: CodexSdkHostLaunch
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

const sdkHostOutputLimit = 8_192

// The Codex SDK host process's error output is kept, not drained away, so a
// lost process can still say why it died. The limit bounds memory use.
function collectSdkHostOutput(stream: Readable): () => string {
  let collected = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    if (collected.length >= sdkHostOutputLimit) {
      return
    }
    collected = (collected + chunk).slice(0, sdkHostOutputLimit)
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

async function launchSdkHostForRequest(
  launch: CodexSdkHostLaunch,
  requestSignal: AbortSignal | undefined,
): Promise<CodexSdkHostProcess> {
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

async function stopSdkHostAfterRequest(options: {
  readonly failure: CodexSdkHostFailure | null
  readonly sdkHostProcess: CodexSdkHostProcess
  readonly requestSignal?: AbortSignal
  readonly waitForActiveWork: <T>(work: Promise<T>) => Promise<T>
}): Promise<void> {
  const preserveFailureDuringStop = options.failure?.outcome === "unknown"

  try {
    const stop = options.sdkHostProcess.stopAndConfirm()
    if (preserveFailureDuringStop) {
      await stop
    } else {
      await options.waitForActiveWork(stop)
    }
  } catch (error) {
    const cancellationWon =
      !preserveFailureDuringStop && options.requestSignal?.aborted === true
    if (options.failure === null || cancellationWon) {
      throw error
    }
    addCleanupCause(options.failure.error, error)
    throw options.failure.error
  }
}

async function* runCodexSdkHostStream(
  request: GenerateTextRequest,
  config: CodexLlmProviderRuntimeConfig | undefined,
  options: CreateCodexLlmTextClientOptions,
): AsyncIterable<LlmStreamEvent> {
  const authMode = validateRequest(request, config)
  if (options.launch === undefined) {
    throw new LlmError(
      "other",
      "The Codex SDK host process is not configured.",
      {
        context: { provider: "codex", authMode },
      },
    )
  }
  if (request.signal?.aborted) {
    throw abortError()
  }

  const sdkHostProcess = await launchSdkHostForRequest(
    options.launch,
    request.signal,
  )
  if (request.signal?.aborted) {
    if (!sdkHostProcess.stdin.writableEnded) {
      sdkHostProcess.stdin.end()
    }
    return await throwCancellationAfterStop(sdkHostProcess.stopAndConfirm())
  }
  const readSdkHostOutput = collectSdkHostOutput(sdkHostProcess.stderr)
  const connection = createMessageConnection(
    sdkHostProcess.stdout,
    sdkHostProcess.stdin,
    NullLogger,
  )
  const events = new AsyncEventQueue<LlmStreamEvent>()
  const cancellation = new CancellationTokenSource()
  const requestState: {
    failure: CodexSdkHostFailure | null
    settled: boolean
  } = {
    failure: null,
    settled: false,
  }
  const eventSubscription = connection.onNotification(
    codexSdkHostEventNotification,
    (event) => events.push(event),
  )
  const traceSubscription = connection.onNotification(
    codexSdkHostTraceNotification,
    (text) => options.trace?.(text),
  )
  connection.listen()

  const cancellationStarted = Promise.withResolvers<void>()
  let cancellationStop: Promise<void> | null = null
  const cancel = (): Promise<void> => {
    cancellation.cancel()
    events.close()
    cancellationStop ??= sdkHostProcess.stopAndConfirm()
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

  const processCompletion = sdkHostProcess.result.then(
    () => {
      if (!requestState.settled) {
        requestState.failure = {
          error: unknownOutcomeError(authMode, {
            output: readSdkHostOutput(),
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
            output: readSdkHostOutput(),
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
      codexSdkHostRunRequest,
      {
        config,
        spec: request.spec,
        prompt: request.prompt,
      },
      cancellation.token,
    )
    .catch((error: unknown) => {
      requestState.failure = mapCodexSdkHostFailure(
        error,
        authMode,
        request.signal,
        readSdkHostOutput(),
      )
    })
    .finally(() => {
      requestState.settled = true
      events.close()
      if (!request.signal?.aborted && !sdkHostProcess.stdin.writableEnded) {
        sdkHostProcess.stdin.end()
      }
    })

  try {
    for await (const event of events) {
      yield event
    }
    await waitForActiveWork(completion)

    await stopSdkHostAfterRequest({
      failure: requestState.failure,
      sdkHostProcess,
      requestSignal: request.signal,
      waitForActiveWork,
    })
    await waitForActiveWork(processCompletion)

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
      return collectCodexStream(runCodexSdkHostStream(request, config, options))
    },
    streamText(request): AsyncIterable<LlmStreamEvent> {
      return runCodexSdkHostStream(request, config, options)
    },
  }
}

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
import { AsyncEventQueue } from "./async-event-queue.js"
import { resolveCodexAuth } from "./auth.js"
import {
  abortError,
  mapCodexSdkHostFailure,
  readCodexSdkHostFailure,
  unknownOutcomeError,
} from "./sdk-host-errors.js"
import {
  type CodexSdkHostProtocolFailure,
  type CodexSdkHostRunResult,
  codexSdkHostEventNotification,
  codexSdkHostRunRequest,
  codexSdkHostTraceNotification,
} from "./sdk-host-protocol.js"
import type { TraceSink } from "./trace.js"

export type CodexSdkHostProcessResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

export type CodexSdkHostTargetResult =
  | {
      readonly outcome: "completed"
      readonly value: CodexSdkHostRunResult
    }
  | {
      readonly outcome: "failed"
      readonly message: string
      readonly value: CodexSdkHostProtocolFailure
    }

export type CodexSdkHostOutcome =
  | { readonly outcome: "unknown" }
  | { readonly outcome: "cancelled" }
  | (CodexSdkHostTargetResult & {
      readonly targetResult?: CodexSdkHostProcessResult
    })

export type CodexSdkHostProcess = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly outcome: Promise<CodexSdkHostOutcome>
  requestCancellation(): void
  reportFailure(error: unknown): void
  reportProofLost(error: unknown): void
  reportResult(result: CodexSdkHostTargetResult): void
  reportWorkStarted(): void
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
    sdkHostProcess.requestCancellation()
    await sdkHostProcess.outcome
    throw abortError()
  }
  const readSdkHostOutput = collectSdkHostOutput(sdkHostProcess.stderr)
  const connection = createMessageConnection(
    sdkHostProcess.stdout,
    sdkHostProcess.stdin,
    NullLogger,
  )
  const events = new AsyncEventQueue<LlmStreamEvent>()
  const cancellation = new CancellationTokenSource()
  const eventSubscription = connection.onNotification(
    codexSdkHostEventNotification,
    (event) => events.push(event),
  )
  const traceSubscription = connection.onNotification(
    codexSdkHostTraceNotification,
    (text) => options.trace?.(text),
  )
  connection.listen()

  let resultReported = false
  const cancel = (): void => {
    cancellation.cancel()
    events.close()
    sdkHostProcess.requestCancellation()
  }
  const onAbort = () => {
    cancel()
  }
  request.signal?.addEventListener("abort", onAbort, { once: true })

  let observedOutcome: CodexSdkHostOutcome | undefined
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
    .then((result) => {
      sdkHostProcess.reportResult({ outcome: "completed", value: result })
      resultReported = true
    })
    .catch((error: unknown) => {
      if (request.signal?.aborted) {
        sdkHostProcess.requestCancellation()
      } else {
        const failure = readCodexSdkHostFailure(error)
        if (failure === null) {
          sdkHostProcess.reportProofLost(error)
        } else {
          sdkHostProcess.reportResult({
            outcome: "failed",
            message: failure.message,
            value: failure,
          })
        }
      }
      resultReported = true
    })
    .finally(() => {
      events.close()
      if (
        observedOutcome?.outcome !== "unknown" &&
        observedOutcome?.outcome !== "cancelled" &&
        !sdkHostProcess.stdin.writableEnded
      ) {
        sdkHostProcess.stdin.end()
      }
    })
  sdkHostProcess.reportWorkStarted()
  const processOutcome = sdkHostProcess.outcome.then((outcome) => {
    observedOutcome = outcome
    if (outcome.outcome === "unknown" || outcome.outcome === "cancelled") {
      events.close()
      connection.dispose()
    }
    return outcome
  })

  try {
    for await (const event of events) {
      yield event
    }
    await completion
    const outcome = await processOutcome
    if (outcome.outcome === "unknown") {
      throw unknownOutcomeError(authMode, { output: readSdkHostOutput() })
    }
    if (outcome.outcome === "cancelled") {
      throw abortError()
    }
    if (outcome.outcome === "failed") {
      throw mapCodexSdkHostFailure(outcome.value, authMode)
    }
  } finally {
    request.signal?.removeEventListener("abort", onAbort)
    if (!resultReported && observedOutcome === undefined) {
      cancel()
      await sdkHostProcess.outcome
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

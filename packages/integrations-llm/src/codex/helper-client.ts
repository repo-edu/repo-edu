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

export type CodexHelperLaunch = () => Promise<CodexHelperProcess>

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

  const helper = await options.launch()
  if (request.signal?.aborted) {
    await helper.stopAndConfirm()
    throw abortError()
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
  const processState: {
    error: unknown
    result: CodexHelperProcessResult | null
  } = {
    error: undefined,
    result: null,
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

  const cancel = () => {
    cancellation.cancel()
    if (!helper.stdin.writableEnded) {
      helper.stdin.end()
    }
  }
  request.signal?.addEventListener("abort", cancel, { once: true })

  const processCompletion = helper.result.then(
    (result) => {
      processState.result = result
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
      processState.error = error
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
      if (!helper.stdin.writableEnded) {
        helper.stdin.end()
      }
    })

  try {
    for await (const event of events) {
      yield event
    }
    await completion

    if (
      requestState.failure?.outcome === "unknown" ||
      request.signal?.aborted
    ) {
      await helper.stopAndConfirm()
      await processCompletion
    } else {
      await processCompletion
      if (processState.error !== undefined) {
        throw unknownOutcomeError(authMode, {
          cause: processState.error,
          output: readHelperOutput(),
        })
      }
      const result = processState.result
      if (result === null || result.exitCode !== 0 || result.signal !== null) {
        throw unknownOutcomeError(authMode, { output: readHelperOutput() })
      }
    }

    if (requestState.failure !== null) {
      throw requestState.failure.error
    }
  } finally {
    request.signal?.removeEventListener("abort", cancel)
    if (!requestState.settled) {
      cancel()
      await helper.stopAndConfirm()
      await completion
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

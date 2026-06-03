import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk"
import type {
  MessageCreateParams,
  MessageStreamEvent,
  OutputConfig,
} from "@anthropic-ai/sdk/resources/messages"
import {
  type ClaudeLlmProviderRuntimeConfig,
  LlmError,
  type LlmModelSpec,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import {
  claudeAbortError,
  isAbortLikeError,
  throwIfClaudeAborted,
} from "./abort"
import type { ResolvedClaudeApiAuth } from "./auth"
import { claudeNativeEffort } from "./effort"
import { toClaudeLlmError } from "./errors"
import {
  mergeUsageSnapshot,
  type RawClaudeUsage,
  usageFromSnapshot,
} from "./usage"

type ClaudeApiStream = AsyncIterable<MessageStreamEvent> & {
  abort(): void
}

export type ClaudeApiClient = {
  messages: {
    stream(
      body: MessageCreateParams,
      options?: { signal?: AbortSignal | null },
    ): ClaudeApiStream
  }
}
export type ClaudeApiClientFactory = (options: ClientOptions) => ClaudeApiClient

export type ClaudeApiRunOptions = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
  factory?: ClaudeApiClientFactory
}

export async function* runClaudeApiStream(
  options: ClaudeApiRunOptions,
  config: ClaudeLlmProviderRuntimeConfig | undefined,
  resolved: ResolvedClaudeApiAuth,
): AsyncIterable<LlmStreamEvent> {
  if (options.spec.provider !== "claude") {
    throw new Error(
      `Claude adapter received non-claude spec.provider="${options.spec.provider}"`,
    )
  }
  throwIfClaudeAborted(options.signal)
  const maxTokens = validatedMaxTokens(config?.maxTokens)
  const client = (options.factory ?? defaultClaudeApiClientFactory)({
    apiKey: resolved.apiKey,
    baseURL: resolved.baseUrl,
  })
  const start = Date.now()
  let usage: RawClaudeUsage = null
  let emittedDone = false

  try {
    yield { kind: "activity", label: "Contacting Claude." }
    const stream = client.messages.stream(
      buildMessageParams(options.spec, options.prompt, maxTokens),
      {
        signal: options.signal,
      },
    )

    for await (const event of stream as AsyncIterable<MessageStreamEvent>) {
      if (options.signal?.aborted) {
        stream.abort()
        throw claudeAbortError(options.signal.reason)
      }
      if (event.type === "message_stop" && usage == null) {
        throw new LlmError(
          "other",
          "Claude API stream ended without a usage snapshot before message_stop.",
          { context: { provider: "claude", authMode: "api" } },
        )
      }

      for (const output of eventsFromApiStreamEvent(
        event,
        options.spec,
        start,
        usage,
      )) {
        if (output.kind === "done") {
          emittedDone = true
        }
        if (output.kind === "usage-snapshot") {
          usage = output.usage
          continue
        }
        yield output
      }
    }

    if (!emittedDone) {
      throw new LlmError(
        "other",
        "Claude API stream ended without a message_stop event.",
        { context: { provider: "claude", authMode: "api" } },
      )
    }
  } catch (cause) {
    if (options.signal?.aborted || isAbortLikeError(cause)) {
      throw claudeAbortError(cause)
    }
    throw toClaudeLlmError(cause, "api")
  }
}

function defaultClaudeApiClientFactory(
  options: ClientOptions,
): ClaudeApiClient {
  return new Anthropic(options)
}

function validatedMaxTokens(value: number | undefined): number {
  if (value !== undefined && Number.isInteger(value) && value > 0) {
    return value
  }
  throw new LlmError(
    "other",
    "Claude API runtime config requires a positive integer maxTokens value.",
    { context: { provider: "claude", authMode: "api" } },
  )
}

function buildMessageParams(
  spec: LlmModelSpec,
  prompt: string,
  maxTokens: number,
): MessageCreateParams {
  const nativeEffort = claudeNativeEffort(spec.effort, "api")
  const outputConfig =
    nativeEffort === null
      ? {}
      : {
          output_config: {
            effort: nativeEffort,
          } satisfies OutputConfig,
        }
  return {
    model: spec.modelId,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
    thinking: { type: "adaptive" },
    ...outputConfig,
  }
}

type ApiStreamOutput =
  | LlmStreamEvent
  | { kind: "usage-snapshot"; usage: RawClaudeUsage }

function eventsFromApiStreamEvent(
  event: MessageStreamEvent,
  _spec: LlmModelSpec,
  start: number,
  usage: RawClaudeUsage,
): ApiStreamOutput[] {
  if (event.type === "message_start") {
    return [
      {
        kind: "usage-snapshot",
        usage: mergeUsageSnapshot(usage, event.message.usage),
      },
      { kind: "activity", label: "Claude started responding." },
    ]
  }
  if (event.type === "content_block_start") {
    if (event.content_block.type === "thinking") {
      return [{ kind: "activity", label: "Claude is reasoning." }]
    }
    if (event.content_block.type === "text") {
      return [{ kind: "activity", label: "Claude started writing." }]
    }
    return [{ kind: "activity", label: "Claude produced non-text output." }]
  }
  if (event.type === "content_block_delta") {
    if (event.delta.type === "text_delta") {
      return [{ kind: "text-delta", text: event.delta.text }]
    }
    if (event.delta.type === "thinking_delta") {
      return [{ kind: "activity", label: "Claude is reasoning." }]
    }
    return []
  }
  if (event.type === "message_delta") {
    return [
      { kind: "usage-snapshot", usage: mergeUsageSnapshot(usage, event.usage) },
      { kind: "activity", label: "Claude is finalizing." },
    ]
  }
  if (event.type === "message_stop") {
    return [
      {
        kind: "done",
        usage: usageFromSnapshot(usage, Date.now() - start, "api"),
      },
    ]
  }
  return []
}

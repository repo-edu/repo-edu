import {
  type Options as ClaudeAgentOptions,
  query as claudeAgentQuery,
} from "@anthropic-ai/claude-agent-sdk"
import {
  LlmError,
  type LlmModelSpec,
  type LlmProviderRuntimeConfig,
  type LlmResult,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { applyEnvOverrides, resolveClaudeAuth } from "./auth"
import { toClaudeLlmError } from "./errors"
import {
  type ClaudeTraceRecorder,
  createClaudeTraceRecorder,
  type TraceSink,
} from "./trace"
import { addUsage, createUsageAccumulator, finalizeUsage } from "./usage"

interface ResultMessage {
  type: "result"
  subtype: string
  result?: unknown
  usage?: Parameters<typeof addUsage>[1]
}

interface AssistantMessage {
  type: "assistant"
  message: {
    content: Array<{
      type: string
      text?: string
      id?: string
      name?: string
      input?: unknown
    }>
  }
}

interface UserMessage {
  type: "user"
  message: {
    content: Array<{ type: string; tool_use_id?: string; content?: unknown }>
  }
}

interface StreamEventMessage {
  type: "stream_event"
  event: {
    type: string
    delta?: {
      type?: string
      text?: string
    }
  }
}

type StreamMessage =
  | ResultMessage
  | AssistantMessage
  | UserMessage
  | StreamEventMessage
  | { type: string }

export type ClaudeRunOptions = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
  agentOptions: ClaudeAgentOptions
  trace?: TraceSink
}

export async function runClaudeQuery(
  options: ClaudeRunOptions,
  config: LlmProviderRuntimeConfig | undefined,
): Promise<LlmResult> {
  let reply = ""
  let usage: LlmResult["usage"] | null = null
  for await (const event of runClaudeStream(options, config)) {
    if (event.kind === "text-delta") {
      reply += event.text
    } else {
      usage = event.usage
    }
  }
  if (usage === null) {
    throw new LlmError(
      "other",
      "Claude stream ended without a terminal usage event.",
      { context: { provider: "claude" } },
    )
  }
  return { reply, usage }
}

export async function* runClaudeStream(
  options: ClaudeRunOptions,
  config: LlmProviderRuntimeConfig | undefined,
): AsyncIterable<LlmStreamEvent> {
  if (options.spec.provider !== "claude") {
    throw new Error(
      `Claude adapter received non-claude spec.provider="${options.spec.provider}"`,
    )
  }
  const resolved = resolveClaudeAuth(config)
  const start = Date.now()
  const usage = createUsageAccumulator()
  const recorder: ClaudeTraceRecorder = createClaudeTraceRecorder(options.trace)
  let emittedText = ""
  let resultSubtype: string | null = null
  const abortController = new AbortController()
  const abort = () => abortController.abort()
  if (options.signal?.aborted) {
    abortController.abort()
  } else {
    options.signal?.addEventListener("abort", abort, { once: true })
  }

  const envOverride = applyEnvOverrides(resolved)
  try {
    for await (const message of claudeAgentQuery({
      prompt: options.prompt,
      options: {
        ...options.agentOptions,
        abortController,
        includePartialMessages: true,
      },
    }) as AsyncIterable<StreamMessage>) {
      if (options.signal?.aborted) {
        throw new Error("Operation cancelled.")
      }
      if (message.type === "stream_event") {
        const text = textDeltaFromStreamEvent(message as StreamEventMessage)
        if (text !== null && text.length > 0) {
          emittedText += text
          yield { kind: "text-delta", text }
        }
        continue
      }
      if (message.type === "assistant") {
        const blocks = (message as AssistantMessage).message.content
        recorder.recordAssistantBlocks(blocks)
        continue
      }
      if (message.type === "user") {
        const blocks = (message as UserMessage).message.content
        recorder.recordUserBlocks(blocks)
        continue
      }
      if (message.type === "result") {
        const result = message as ResultMessage
        resultSubtype = result.subtype
        addUsage(usage, result.usage)
        if (resultSubtype === "success" && typeof result.result === "string") {
          const suffix = result.result.startsWith(emittedText)
            ? result.result.slice(emittedText.length)
            : emittedText.length === 0
              ? result.result
              : ""
          if (suffix.length > 0) {
            emittedText += suffix
            yield { kind: "text-delta", text: suffix }
          }
          yield {
            kind: "done",
            usage: finalizeUsage(usage, Date.now() - start, resolved.authMode),
          }
        }
      }
    }
  } catch (cause) {
    throw toClaudeLlmError(cause, resolved.authMode)
  } finally {
    options.signal?.removeEventListener("abort", abort)
    envOverride.restore()
  }

  if (resultSubtype !== null && resultSubtype !== "success") {
    throw new LlmError(
      "other",
      `Claude turn ended with subtype "${resultSubtype}"`,
      { context: { provider: "claude", authMode: resolved.authMode } },
    )
  }
}

function textDeltaFromStreamEvent(message: StreamEventMessage): string | null {
  const { event } = message
  if (event.type !== "content_block_delta") return null
  const { delta } = event
  if (delta?.type !== "text_delta") return null
  return typeof delta.text === "string" ? delta.text : null
}

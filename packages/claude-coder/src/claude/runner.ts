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
    content: AssistantContentBlock[]
  }
}

interface AssistantContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}

interface UserMessage {
  type: "user"
  message: {
    content: UserContentBlock[]
  }
}

interface UserContentBlock {
  type: string
  tool_use_id?: string
  content?: unknown
}

interface StreamEventMessage {
  type: "stream_event"
  event: {
    type: string
    content_block?: {
      type?: string
      name?: string
      input?: unknown
    }
    delta?: {
      type?: string
      text?: string
    }
  }
}

interface ToolProgressMessage {
  type: "tool_progress"
  tool_name: string
  elapsed_time_seconds: number
}

type StreamMessage =
  | ResultMessage
  | AssistantMessage
  | UserMessage
  | StreamEventMessage
  | ToolProgressMessage
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
    } else if (event.kind === "done") {
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
  const toolNamesById = new Map<string, string>()
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
    yield { kind: "activity", label: "Contacting Claude." }
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
        const streamEvent = message as StreamEventMessage
        const text = textDeltaFromStreamEvent(streamEvent)
        if (text !== null && text.length > 0) {
          emittedText += text
          yield { kind: "text-delta", text }
        } else {
          const label = claudeActivityLabel(streamEvent)
          if (label !== null) {
            yield { kind: "activity", label }
          }
        }
        continue
      }
      if (message.type === "tool_progress") {
        yield {
          kind: "activity",
          label: claudeToolProgressLabel(message as ToolProgressMessage),
        }
        continue
      }
      if (message.type === "assistant") {
        const blocks = (message as AssistantMessage).message.content
        for (const block of blocks) {
          if (block.type !== "tool_use" || !block.name) continue
          if (block.id) toolNamesById.set(block.id, block.name)
          yield {
            kind: "activity",
            label: claudeToolActivityLabel(block.name, block.input),
          }
        }
        recorder.recordAssistantBlocks(blocks)
        continue
      }
      if (message.type === "user") {
        const blocks = (message as UserMessage).message.content
        for (const block of blocks) {
          if (block.type !== "tool_result" || !block.tool_use_id) continue
          const toolName = toolNamesById.get(block.tool_use_id)
          yield {
            kind: "activity",
            label: toolName
              ? `Claude received ${toolName} output.`
              : "Claude received tool output.",
          }
        }
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

function claudeActivityLabel(message: StreamEventMessage): string | null {
  const { event } = message
  if (event.type === "message_start") return "Claude started responding."
  if (event.type === "content_block_start") {
    if (event.content_block?.type === "tool_use") {
      return claudeToolActivityLabel(event.content_block.name, null)
    }
    return "Claude started writing."
  }
  if (event.type === "content_block_delta") {
    if (event.delta?.type === "thinking_delta") return "Claude is reasoning."
    if (event.delta?.type === "input_json_delta") {
      return "Claude is preparing tool input."
    }
  }
  if (event.type === "message_delta") return "Claude is finalizing."
  return null
}

function claudeToolProgressLabel(message: ToolProgressMessage): string {
  const elapsed =
    message.elapsed_time_seconds > 0
      ? ` (${Math.floor(message.elapsed_time_seconds)}s)`
      : ""
  return `Claude is using ${message.tool_name}${elapsed}.`
}

function claudeToolActivityLabel(
  toolName: string | undefined,
  input: unknown,
): string {
  const obj = (input ?? {}) as Record<string, unknown>
  if (toolName === "Read") {
    const path = shortActivityText(String(obj.file_path ?? "a file"))
    return `Claude is reading ${path}.`
  }
  if (toolName === "Grep") {
    const pattern = obj.pattern
    return typeof pattern === "string" && pattern.trim()
      ? `Claude is searching files: ${shortActivityText(pattern)}`
      : "Claude is searching files."
  }
  if (toolName === "Glob" || toolName === "LS") {
    return "Claude is listing files."
  }
  if (toolName === "Bash") {
    const command = obj.command
    return typeof command === "string" && command.trim()
      ? `Claude is running: ${shortActivityText(command)}`
      : "Claude is running a command."
  }
  if (toolName === "Edit" || toolName === "MultiEdit" || toolName === "Write") {
    const path = obj.file_path
    return typeof path === "string" && path.trim()
      ? `Claude is editing ${shortActivityText(path)}.`
      : "Claude is editing files."
  }
  return toolName ? `Claude is using ${toolName}.` : "Claude is using a tool."
}

function shortActivityText(text: string): string {
  const singleLine = text.replaceAll(/\s+/g, " ").trim()
  if (singleLine.length <= 96) return singleLine
  return `${singleLine.slice(0, 93)}...`
}

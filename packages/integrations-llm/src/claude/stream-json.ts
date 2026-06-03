import type {
  LlmAuthMode,
  LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import {
  type ClaudeTraceRecorder,
  createClaudeTraceRecorder,
  type TraceSink,
} from "./trace"
import {
  addUsage,
  createUsageAccumulator,
  finalizeUsage,
  type RawClaudeUsage,
} from "./usage"

export interface ResultMessage {
  type: "result"
  subtype: string
  result?: unknown
  usage?: RawClaudeUsage
}

export interface AssistantMessage {
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

export interface UserMessage {
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

export interface StreamEventMessage {
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

export interface ToolProgressMessage {
  type: "tool_progress"
  tool_name: string
  elapsed_time_seconds: number
}

export type StreamMessage =
  | ResultMessage
  | AssistantMessage
  | UserMessage
  | StreamEventMessage
  | ToolProgressMessage
  | { type: string }

export type ClaudeStreamJsonState = {
  emittedText: string
  resultSubtype: string | null
  done: boolean
  terminalUsage: (LlmStreamEvent & { kind: "done" }) | null
  startMs: number
  authMode: LlmAuthMode
  usage: ReturnType<typeof createUsageAccumulator>
  recorder: ClaudeTraceRecorder
}

export function createClaudeStreamJsonState(options: {
  authMode: LlmAuthMode
  trace?: TraceSink
  startMs?: number
}): ClaudeStreamJsonState {
  return {
    emittedText: "",
    resultSubtype: null,
    done: false,
    terminalUsage: null,
    startMs: options.startMs ?? Date.now(),
    authMode: options.authMode,
    usage: createUsageAccumulator(),
    recorder: createClaudeTraceRecorder(options.trace),
  }
}

export function parseClaudeStreamJsonLine(line: string): StreamMessage | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null
  return JSON.parse(trimmed) as StreamMessage
}

export function eventsFromClaudeStreamMessage(
  message: StreamMessage,
  state: ClaudeStreamJsonState,
): LlmStreamEvent[] {
  if (message.type === "stream_event") {
    const streamEvent = message as StreamEventMessage
    assertNoToolStreamEvent(streamEvent, state)
    const text = textDeltaFromStreamEvent(streamEvent)
    if (text !== null && text.length > 0) {
      state.emittedText += text
      return [{ kind: "text-delta", text }]
    }
    const label = claudeActivityLabel(streamEvent)
    return label === null ? [] : [{ kind: "activity", label }]
  }

  if (message.type === "tool_progress") {
    throw toolGuardrailError(state)
  }

  if (message.type === "assistant") {
    const blocks = (message as AssistantMessage).message.content
    for (const block of blocks) {
      if (block.type !== "tool_use") continue
      throw toolGuardrailError(state)
    }
    state.recorder.recordAssistantBlocks(blocks)
    return []
  }

  if (message.type === "user") {
    const blocks = (message as UserMessage).message.content
    for (const block of blocks) {
      if (block.type !== "tool_result") continue
      throw toolGuardrailError(state)
    }
    state.recorder.recordUserBlocks(blocks)
    return []
  }

  if (message.type === "result") {
    const result = message as ResultMessage
    state.resultSubtype = result.subtype
    addUsage(state.usage, result.usage)
    if (
      state.resultSubtype !== "success" ||
      typeof result.result !== "string"
    ) {
      return []
    }
    const events: LlmStreamEvent[] = []
    const suffix = result.result.startsWith(state.emittedText)
      ? result.result.slice(state.emittedText.length)
      : state.emittedText.length === 0
        ? result.result
        : ""
    if (suffix.length > 0) {
      state.emittedText += suffix
      events.push({ kind: "text-delta", text: suffix })
    }
    state.done = true
    return events
  }

  return []
}

export function finalizeClaudeStreamJsonState(
  state: ClaudeStreamJsonState,
): LlmStreamEvent & { kind: "done" } {
  const done: LlmStreamEvent & { kind: "done" } = {
    kind: "done",
    usage: finalizeUsage(
      state.usage,
      Date.now() - state.startMs,
      state.authMode,
    ),
  }
  state.terminalUsage = done
  return done
}

function assertNoToolStreamEvent(
  message: StreamEventMessage,
  state: ClaudeStreamJsonState,
): void {
  const { event } = message
  if (
    event.type === "content_block_start" &&
    event.content_block?.type === "tool_use"
  ) {
    throw toolGuardrailError(state)
  }
  if (
    event.type === "content_block_delta" &&
    event.delta?.type === "input_json_delta"
  ) {
    throw toolGuardrailError(state)
  }
}

function toolGuardrailError(state: ClaudeStreamJsonState): LlmError {
  return new LlmError(
    "guardrail",
    "Claude subscription prompt/reply mode received a tool event despite tools being disabled.",
    { context: { provider: "claude", authMode: state.authMode } },
  )
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
  if (event.type === "content_block_start") return "Claude started writing."
  if (event.type === "content_block_delta") {
    if (event.delta?.type === "thinking_delta") return "Claude is reasoning."
  }
  if (event.type === "message_delta") return "Claude is finalizing."
  return null
}

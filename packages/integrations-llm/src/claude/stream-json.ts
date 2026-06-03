import type {
  LlmAuthMode,
  LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
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
  toolNamesById: Map<string, string>
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
    toolNamesById: new Map<string, string>(),
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
    const text = textDeltaFromStreamEvent(streamEvent)
    if (text !== null && text.length > 0) {
      state.emittedText += text
      return [{ kind: "text-delta", text }]
    }
    const label = claudeActivityLabel(streamEvent)
    return label === null ? [] : [{ kind: "activity", label }]
  }

  if (message.type === "tool_progress") {
    return [
      {
        kind: "activity",
        label: claudeToolProgressLabel(message as ToolProgressMessage),
      },
    ]
  }

  if (message.type === "assistant") {
    const blocks = (message as AssistantMessage).message.content
    const events: LlmStreamEvent[] = []
    for (const block of blocks) {
      if (block.type !== "tool_use" || !block.name) continue
      if (block.id) state.toolNamesById.set(block.id, block.name)
      events.push({
        kind: "activity",
        label: claudeToolActivityLabel(block.name, block.input),
      })
    }
    state.recorder.recordAssistantBlocks(blocks)
    return events
  }

  if (message.type === "user") {
    const blocks = (message as UserMessage).message.content
    const events: LlmStreamEvent[] = []
    for (const block of blocks) {
      if (block.type !== "tool_result" || !block.tool_use_id) continue
      const toolName = state.toolNamesById.get(block.tool_use_id)
      events.push({
        kind: "activity",
        label: toolName
          ? `Claude received ${toolName} output.`
          : "Claude received tool output.",
      })
    }
    state.recorder.recordUserBlocks(blocks)
    return events
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
    const done: LlmStreamEvent = {
      kind: "done",
      usage: finalizeUsage(
        state.usage,
        Date.now() - state.startMs,
        state.authMode,
      ),
    }
    state.done = true
    state.terminalUsage = done
    events.push(done)
    return events
  }

  return []
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

import { isAbsolute } from "node:path"
import {
  Codex,
  type CodexOptions,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
  type TurnOptions,
} from "@openai/codex-sdk"
import { buildCodingPrompt } from "./coding-prompt.js"
import { codingResultJsonSchema, parseCodingOutput } from "./coding-result.js"
import type { CodingEvent, CodingRequest, CodingResult } from "./contracts.js"

type CodingSdkThread = {
  runStreamed(
    input: string,
    options: TurnOptions,
  ): Promise<{ readonly events: AsyncIterable<ThreadEvent> }>
}

type CodingSdkClient = {
  startThread(options: ThreadOptions): CodingSdkThread
}

export type CodingSdkFactory = (options: CodexOptions) => CodingSdkClient

export type CodingSdkRunOptions = {
  readonly signal: AbortSignal
  readonly emit: (event: CodingEvent) => void | Promise<void>
  readonly factory?: CodingSdkFactory
}

export function buildCodingThreadOptions(repoEduRoot: string): ThreadOptions {
  if (!isAbsolute(repoEduRoot)) {
    throw new Error("The Repo Edu checkout path must be absolute.")
  }
  return {
    workingDirectory: repoEduRoot,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: true,
    webSearchMode: "disabled",
  }
}

function abortedError(): DOMException {
  return new DOMException("The Codex coding turn was aborted.", "AbortError")
}

const FAILED_COMMAND_OUTPUT_LIMIT = 2_000

function failedCommandOutput(value: string): string {
  const trimmed = value.trimEnd()
  return trimmed.length <= FAILED_COMMAND_OUTPUT_LIMIT
    ? trimmed
    : trimmed.slice(-FAILED_COMMAND_OUTPUT_LIMIT)
}

type ItemEventState = {
  readonly emittedIds: Set<string>
  readonly settledIds: Set<string>
  lastTodo: string | null
}

function createItemEventState(): ItemEventState {
  return { emittedIds: new Set(), settledIds: new Set(), lastTodo: null }
}

function commandFailed(
  item: ThreadItem & { readonly type: "command_execution" },
): boolean {
  return (
    item.status === "failed" ||
    (item.exit_code !== undefined && item.exit_code !== 0)
  )
}

function itemEvents(
  completed: boolean,
  item: ThreadItem,
  state: ItemEventState,
): CodingEvent[] {
  switch (item.type) {
    case "reasoning": {
      const text = item.text.trim()
      if (!completed || text === "" || state.emittedIds.has(item.id)) return []
      state.emittedIds.add(item.id)
      return [{ kind: "narrative", text }]
    }
    case "agent_message":
      return []
    case "command_execution": {
      const events: CodingEvent[] = []
      if (!state.emittedIds.has(item.id)) {
        state.emittedIds.add(item.id)
        events.push({
          kind: "command",
          command: item.command,
          status: "started",
          exitCode: null,
          output: "",
        })
      }
      if (completed && !state.settledIds.has(item.id)) {
        state.settledIds.add(item.id)
        const failed = commandFailed(item)
        events.push({
          kind: "command",
          command: item.command,
          status: failed ? "failed" : "succeeded",
          exitCode: item.exit_code ?? null,
          output: failed ? failedCommandOutput(item.aggregated_output) : "",
        })
      }
      return events
    }
    case "file_change": {
      if (!completed || state.settledIds.has(item.id)) return []
      state.settledIds.add(item.id)
      return [
        {
          kind: "file-change",
          status: item.status,
          changes: item.changes.map((change) => ({
            path: change.path,
            kind: change.kind,
          })),
        },
      ]
    }
    case "mcp_tool_call": {
      const events: CodingEvent[] = []
      if (!state.emittedIds.has(item.id)) {
        state.emittedIds.add(item.id)
        events.push({
          kind: "tool-call",
          server: item.server,
          tool: item.tool,
          status: "started",
        })
      }
      if (completed && !state.settledIds.has(item.id)) {
        state.settledIds.add(item.id)
        events.push({
          kind: "tool-call",
          server: item.server,
          tool: item.tool,
          status: item.status === "failed" ? "failed" : "succeeded",
        })
      }
      return events
    }
    case "web_search": {
      if (state.emittedIds.has(item.id)) return []
      state.emittedIds.add(item.id)
      return [{ kind: "web-search", query: item.query }]
    }
    case "todo_list": {
      const current = item.items.find((todo) => !todo.completed)
      if (current === undefined || current.text === state.lastTodo) return []
      state.lastTodo = current.text
      return [{ kind: "todo", text: current.text }]
    }
    case "error": {
      if (state.emittedIds.has(item.id)) return []
      state.emittedIds.add(item.id)
      return [{ kind: "error", message: item.message, willRetry: false }]
    }
  }
}

async function emitItemEvents(
  completed: boolean,
  item: ThreadItem,
  state: ItemEventState,
  emit: CodingSdkRunOptions["emit"],
): Promise<void> {
  for (const event of itemEvents(completed, item, state)) {
    await emit(event)
  }
}

function defaultCodingSdkFactory(options: CodexOptions): CodingSdkClient {
  return new Codex(options)
}

export async function runCodexCodingStep(
  request: CodingRequest,
  options: CodingSdkRunOptions,
): Promise<CodingResult> {
  if (options.signal.aborted) {
    throw abortedError()
  }

  const codex = (options.factory ?? defaultCodingSdkFactory)({})
  const thread = codex.startThread(
    buildCodingThreadOptions(request.repoEduRoot),
  )
  const streamed = await thread.runStreamed(buildCodingPrompt(request), {
    outputSchema: codingResultJsonSchema,
    signal: options.signal,
  })

  let finalResponse: string | null = null
  let terminal: "completed" | "failed" | null = null
  let failureMessage = ""
  const itemState = createItemEventState()

  for await (const event of streamed.events) {
    if (options.signal.aborted) {
      throw abortedError()
    }
    switch (event.type) {
      case "thread.started":
        await options.emit({
          kind: "thread-started",
          threadId: event.thread_id,
        })
        break
      case "turn.started":
        break
      case "item.started":
      case "item.updated":
      case "item.completed":
        await emitItemEvents(
          event.type === "item.completed",
          event.item,
          itemState,
          options.emit,
        )
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text
        }
        break
      case "turn.completed": {
        const tokens = {
          inputTokens: event.usage.input_tokens,
          cachedInputTokens: event.usage.cached_input_tokens,
          cacheWriteInputTokens: event.usage.cache_write_input_tokens,
          outputTokens: event.usage.output_tokens,
          reasoningOutputTokens: event.usage.reasoning_output_tokens,
          totalTokens: event.usage.input_tokens + event.usage.output_tokens,
        }
        await options.emit({
          kind: "usage",
          usage: {
            cumulative: tokens,
            lastContext: tokens,
            modelContextWindowTokens: null,
          },
        })
        terminal = "completed"
        break
      }
      case "turn.failed":
        terminal = "failed"
        failureMessage = event.error.message
        break
      case "error":
        terminal = "failed"
        failureMessage = event.message
        break
    }
  }

  if (options.signal.aborted) {
    throw abortedError()
  }
  if (terminal === "failed") {
    throw new Error(`The Codex coding turn failed: ${failureMessage}`)
  }
  if (terminal !== "completed") {
    throw new Error("The Codex coding stream ended without a terminal event.")
  }
  if (finalResponse === null) {
    throw new Error("The Codex coding turn returned no structured result.")
  }
  return parseCodingOutput(finalResponse)
}

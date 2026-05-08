import type {
  AgentMessageItem,
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
  ReasoningItem,
  ThreadItem,
} from "@openai/codex-sdk"

// Trace recorder for Codex turns. Prompt/reply calls are read-only, while
// fixture-repo calls can emit command and file-change events. The shape mirrors
// the Claude trace recorder so consumers can use one TraceSink for both.

export type TraceSink = (text: string) => void

export type CodexTraceRecorder = {
  recordAgentMessage(item: AgentMessageItem): void
  recordReasoning(item: ReasoningItem): void
  recordError(message: string): void
  recordItemStarted(item: ThreadItem): void
  recordItemUpdated(item: ThreadItem): void
  recordItemCompleted(item: ThreadItem): void
  recordUsage(
    usage: {
      input_tokens?: number
      cached_input_tokens?: number
      output_tokens?: number
      reasoning_output_tokens?: number
    } | null,
  ): void
}

const MAX_TRACE_TEXT = 2_000

function elide(text: string): string {
  if (text.length <= MAX_TRACE_TEXT) return text
  return `${text.slice(0, MAX_TRACE_TEXT)}\n\n[elided ${text.length - MAX_TRACE_TEXT} chars]`
}

function formatCommand(item: CommandExecutionItem): string {
  const parts = [
    `command: ${item.command}`,
    `status: ${item.status}`,
    item.exit_code === undefined ? null : `exit: ${item.exit_code}`,
  ].filter((line): line is string => line !== null)
  const output = item.aggregated_output.trim()
  return output
    ? `${parts.join("\n")}\n\n\`\`\`text\n${elide(output)}\n\`\`\``
    : parts.join("\n")
}

function formatFileChange(item: FileChangeItem): string {
  const changes = item.changes
    .map((change) => `- ${change.kind}: ${change.path}`)
    .join("\n")
  return `status: ${item.status}\n${changes}`
}

function formatMcpToolCall(item: McpToolCallItem): string {
  return [
    `server: ${item.server}`,
    `tool: ${item.tool}`,
    `status: ${item.status}`,
    item.error ? `error: ${item.error.message}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
}

function recordGenericItem(
  sink: TraceSink,
  phase: "Started" | "Updated" | "Completed",
  item: ThreadItem,
): void {
  if (item.type === "command_execution") {
    sink(`\n#### Command ${phase}\n\n${formatCommand(item)}`)
    return
  }
  if (item.type === "file_change") {
    sink(`\n#### File Change ${phase}\n\n${formatFileChange(item)}`)
    return
  }
  if (item.type === "mcp_tool_call") {
    sink(`\n#### Tool ${phase}\n\n${formatMcpToolCall(item)}`)
    return
  }
  if (item.type === "web_search") {
    sink(`\n#### Web Search ${phase}\n\nquery: ${item.query}`)
    return
  }
  if (item.type === "todo_list") {
    const todos = item.items
      .map((todo) => `- ${todo.completed ? "[x]" : "[ ]"} ${todo.text}`)
      .join("\n")
    sink(`\n#### Todo List ${phase}\n\n${todos}`)
  }
}

export function createCodexTraceRecorder(
  sink: TraceSink | undefined,
): CodexTraceRecorder {
  if (!sink) {
    return {
      recordAgentMessage: () => {},
      recordReasoning: () => {},
      recordError: () => {},
      recordItemStarted: () => {},
      recordItemUpdated: () => {},
      recordItemCompleted: () => {},
      recordUsage: () => {},
    }
  }
  return {
    recordAgentMessage(item) {
      if (item.text) sink(`\n#### Assistant\n\n${item.text}`)
    },
    recordReasoning(item) {
      if (item.text) sink(`\n#### Reasoning\n\n${item.text}`)
    },
    recordError(message) {
      sink(`\n#### Error\n\n${message}`)
    },
    recordItemStarted(item) {
      recordGenericItem(sink, "Started", item)
    },
    recordItemUpdated(item) {
      recordGenericItem(sink, "Updated", item)
    },
    recordItemCompleted(item) {
      recordGenericItem(sink, "Completed", item)
    },
    recordUsage(usage) {
      if (!usage) return
      sink(
        `\n#### Usage\n\n- inputTokens: ${usage.input_tokens}\n- cachedInputTokens: ${usage.cached_input_tokens}\n- outputTokens: ${usage.output_tokens}\n- reasoningOutputTokens: ${usage.reasoning_output_tokens}`,
      )
    },
  }
}

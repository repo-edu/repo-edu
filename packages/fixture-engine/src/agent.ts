import { type EffortLevel, query } from "@anthropic-ai/claude-agent-sdk"
import { emit, fail } from "./log"

export interface Usage {
  input_tokens: number
  output_tokens: number
  wall_ms: number
}

export type QueryOptions = Parameters<typeof query>[0]["options"]

export function effortOption(effort: string): { effort?: EffortLevel } {
  return effort === "none" ? {} : { effort: effort as EffortLevel }
}

const MAX_RESULT_CHARS = 4000

function countLines(s: string): number {
  if (!s) return 0
  return s.split("\n").length
}

function formatToolUse(name: string, input: unknown): string {
  const obj = (input ?? {}) as Record<string, unknown>
  switch (name) {
    case "Read": {
      const path = String(obj.file_path ?? "?")
      const offset = obj.offset !== undefined ? `, offset=${obj.offset}` : ""
      const limit = obj.limit !== undefined ? `, limit=${obj.limit}` : ""
      return `path: ${path}${offset}${limit}`
    }
    case "Write": {
      const path = String(obj.file_path ?? "?")
      const content = String(obj.content ?? "")
      return `path: ${path}\n[content elided: ${countLines(content)} lines, ${content.length} chars]`
    }
    case "Edit": {
      const path = String(obj.file_path ?? "?")
      const oldStr = String(obj.old_string ?? "")
      const newStr = String(obj.new_string ?? "")
      const flag = obj.replace_all === true ? " (replace_all)" : ""
      return `path: ${path}${flag}\n[old_string elided: ${countLines(oldStr)} lines, ${oldStr.length} chars]\n[new_string elided: ${countLines(newStr)} lines, ${newStr.length} chars]`
    }
    case "Bash": {
      const cmd = String(obj.command ?? "")
      const desc =
        obj.description !== undefined ? `\ndescription: ${obj.description}` : ""
      return `\`\`\`bash\n${cmd}\n\`\`\`${desc}`
    }
    case "Grep":
    case "Glob":
      return `\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\``
    default:
      return `\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\``
  }
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        typeof b === "string"
          ? b
          : (b as { text?: string }).text !== undefined
            ? String((b as { text: string }).text)
            : JSON.stringify(b),
      )
      .join("\n")
  }
  return String(content ?? "")
}

function formatToolResult(name: string, content: unknown): string {
  const text = flattenContent(content)
  if (name === "Read") {
    return `[file content elided: ${countLines(text)} lines, ${text.length} chars]`
  }
  if (text.length <= MAX_RESULT_CHARS) return text
  if (name === "Bash") {
    const dropped = text.length - MAX_RESULT_CHARS
    return `[truncated head: ${dropped} chars]…\n${text.slice(-MAX_RESULT_CHARS)}`
  }
  return `${text.slice(0, MAX_RESULT_CHARS)}\n…[truncated tail: ${text.length - MAX_RESULT_CHARS} chars]`
}

interface AssistantContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}

interface UserContentBlock {
  type: string
  tool_use_id?: string
  content?: unknown
}

export async function runAgent(
  prompt: string,
  options: QueryOptions,
): Promise<{ reply: string; usage: Usage }> {
  const start = Date.now()
  const toolNames = new Map<string, string>()
  let reply = ""
  let inputTokens = 0
  let outputTokens = 0

  for await (const message of query({ prompt, options })) {
    if (message.type === "assistant") {
      const blocks = (
        message as { message: { content: AssistantContentBlock[] } }
      ).message.content
      for (const block of blocks) {
        if (block.type === "text" && block.text) {
          emit(3, `\n#### Assistant\n\n${block.text}`)
        } else if (block.type === "tool_use" && block.name) {
          if (block.id) toolNames.set(block.id, block.name)
          emit(
            3,
            `\n#### Tool use: ${block.name}\n\n${formatToolUse(block.name, block.input)}`,
          )
        }
      }
      continue
    }
    if (message.type === "user") {
      const blocks = (message as { message: { content: UserContentBlock[] } })
        .message.content
      for (const block of blocks) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const name = toolNames.get(block.tool_use_id) ?? "?"
          emit(
            3,
            `\n#### Tool result: ${name}\n\n${formatToolResult(name, block.content)}`,
          )
        }
      }
      continue
    }
    if (message.type === "result") {
      if (message.subtype !== "success") {
        const detail =
          "result" in message && typeof message.result === "string"
            ? `: ${message.result}`
            : ""
        fail(`agent turn ended with subtype "${message.subtype}"${detail}`)
      }
      inputTokens = message.usage?.input_tokens ?? 0
      outputTokens = message.usage?.output_tokens ?? 0
      if ("result" in message && typeof message.result === "string") {
        reply = message.result
      }
    }
  }

  return {
    reply,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      wall_ms: Date.now() - start,
    },
  }
}

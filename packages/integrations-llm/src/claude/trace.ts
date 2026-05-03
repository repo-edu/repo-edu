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

export type TraceSink = (text: string) => void

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

export type ClaudeTraceRecorder = {
  recordAssistantBlocks(blocks: AssistantContentBlock[]): void
  recordUserBlocks(blocks: UserContentBlock[]): void
}

export function createClaudeTraceRecorder(
  sink: TraceSink | undefined,
): ClaudeTraceRecorder {
  if (!sink) {
    return {
      recordAssistantBlocks: () => {},
      recordUserBlocks: () => {},
    }
  }
  const toolNames = new Map<string, string>()
  return {
    recordAssistantBlocks(blocks) {
      for (const block of blocks) {
        if (block.type === "text" && block.text) {
          sink(`\n#### Assistant\n\n${block.text}`)
          continue
        }
        if (block.type === "tool_use" && block.name) {
          if (block.id) toolNames.set(block.id, block.name)
          sink(
            `\n#### Tool use: ${block.name}\n\n${formatToolUse(block.name, block.input)}`,
          )
        }
      }
    },
    recordUserBlocks(blocks) {
      for (const block of blocks) {
        if (block.type !== "tool_result" || !block.tool_use_id) continue
        const name = toolNames.get(block.tool_use_id) ?? "?"
        sink(
          `\n#### Tool result: ${name}\n\n${formatToolResult(name, block.content)}`,
        )
      }
    },
  }
}

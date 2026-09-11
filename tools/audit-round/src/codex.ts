import { z } from "zod"
import { type AssistantEvent, eventSchema } from "./feedback.js"
import { commandText } from "./output-format.js"

export function decodeCodex(record: unknown): AssistantEvent[] {
  const event = eventSchema.parse(record)
  switch (event.type) {
    case "thread.started":
      return [
        {
          type: "session",
          sessionId: z.object({ thread_id: z.string().min(1) }).parse(event)
            .thread_id,
        },
      ]
    case "turn.completed":
      return [{ type: "complete" }]
    case "turn.failed":
      throw new Error(
        z
          .object({ error: z.object({ message: z.string().min(1) }) })
          .parse(event).error.message,
      )
    case "error":
      throw new Error(
        z.object({ message: z.string().min(1) }).parse(event).message,
      )
    case "item.started":
    case "item.updated":
    case "item.completed":
      return decodeItem(event.type, event.item)
    default:
      return []
  }
}

function decodeItem(eventType: string, value: unknown): AssistantEvent[] {
  const item = eventSchema.parse(value)
  const stage = eventType === "item.completed" ? "completed" : "started"
  // Updated items can repeat growing output; completion supplies its full record.
  if (eventType === "item.updated") return []
  switch (item.type) {
    case "agent_message": {
      if (stage !== "completed") return []
      const { text } = z.object({ text: z.string() }).parse(item)
      return [
        { type: "text", text },
        { type: "final", text },
      ]
    }
    case "command_execution": {
      const command = z
        .object({
          command: z.string(),
          aggregated_output: z.string(),
          exit_code: z.number().int().nullable(),
          status: z.string(),
        })
        .parse(item)
      return [
        {
          type: "tool",
          invocation: stage === "started" ? commandText(command.command) : null,
          detail: command,
          stage,
        },
      ]
    }
    case "mcp_tool_call": {
      const tool = z
        .object({
          server: z.string(),
          tool: z.string(),
          arguments: z.unknown(),
        })
        .parse(item)
      if (!("arguments" in item))
        throw new Error("Codex tool call has no arguments")
      return [
        {
          type: "tool",
          invocation:
            stage === "started"
              ? `${tool.server}.${tool.tool} ${JSON.stringify(tool.arguments)}`
              : null,
          detail: item,
          stage,
        },
      ]
    }
    case "web_search": {
      const search = z
        .object({
          query: z.string().optional(),
          action: z.unknown().optional(),
        })
        .parse(item)
      if (search.query === undefined && search.action === undefined)
        throw new Error("Codex search has no query or action")
      return [
        {
          type: "tool",
          invocation:
            stage === "started"
              ? `web ${search.query ?? JSON.stringify(search.action)}`
              : null,
          detail: item,
          stage,
        },
      ]
    }
    case "file_change": {
      if (stage !== "completed") return []
      const { changes } = z
        .object({
          changes: z.array(z.object({ kind: z.string(), path: z.string() })),
        })
        .parse(item)
      return [
        {
          type: "tool",
          invocation: `files ${changes.map(({ kind, path }) => `${kind} ${path}`).join(", ")}`,
          detail: item,
          stage,
        },
      ]
    }
    default:
      return []
  }
}

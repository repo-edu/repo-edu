import { join as shellJoin } from "shellwords"
import { z } from "zod"
import { decodeCodexUsage } from "./codex-session.js"
import { eventSchema, type Feedback } from "./feedback.js"
import { commandText } from "./output-format.js"

/**
 * Interactive Codex persists the same conversation twice: response items and
 * display events. Display events own messages; response items own tool calls.
 * Results and private reasoning never enter the round's files.
 */
export function decodeCodexSessionFeedback(record: unknown): Feedback[] {
  const event = eventSchema.parse(record)
  if (event.type === "response_item") {
    const item = eventSchema.parse(event.payload)
    if (item.type === "function_call") {
      const call = z
        .object({
          name: z.string(),
          namespace: z.string().nullish(),
          arguments: z.string(),
        })
        .parse(item)
      const arguments_: unknown = JSON.parse(call.arguments)
      const invocation =
        call.name.split(".").at(-1) === "exec_command"
          ? commandText(z.object({ cmd: z.string() }).parse(arguments_).cmd)
          : `${[call.namespace, call.name].filter(Boolean).join(".")} ${JSON.stringify(arguments_)}`
      return tool(invocation)
    }
    if (item.type === "custom_tool_call") {
      const call = z.object({ name: z.string(), input: z.string() }).parse(item)
      return tool(`${call.name} ${call.input}`)
    }
    if (item.type === "local_shell_call") {
      const { action } = z
        .object({ action: z.object({ command: z.array(z.string()) }) })
        .parse(item)
      return tool(commandText(shellJoin(action.command)))
    }
    if (item.type === "web_search_call") {
      const { action } = z.object({ action: eventSchema.nullish() }).parse(item)
      return tool(action == null ? "web" : `web ${JSON.stringify(action)}`)
    }
    if (item.type === "tool_search_call") {
      const { arguments: arguments_ } = z
        .object({ arguments: z.json() })
        .parse(item)
      return tool(`tool search ${JSON.stringify(arguments_)}`)
    }
    if (item.type === "image_generation_call") {
      const { revised_prompt } = z
        .object({ revised_prompt: z.string().nullish() })
        .parse(item)
      return tool(
        revised_prompt == null
          ? "image generation"
          : `image generation ${revised_prompt}`,
      )
    }
    return []
  }
  if (event.type === "event_msg") {
    const payload = eventSchema.parse(event.payload)
    if (payload.type === "item_completed") {
      const item = eventSchema.parse(payload.item)
      if (item.type !== "AgentMessage" && item.type !== "UserMessage") return []
      const { content } = z
        .object({ content: z.array(eventSchema) })
        .parse(item)
      const text = content
        .flatMap((part) => {
          if (part.type !== (item.type === "AgentMessage" ? "Text" : "text"))
            return []
          return [z.object({ text: z.string() }).parse(part).text]
        })
        .join("\n")
      return [
        { type: item.type === "UserMessage" ? "user-text" : "text", text },
      ]
    }
  }
  return decodeCodexUsage(record)
}

function tool(invocation: string): Feedback[] {
  return [{ type: "tool", invocation, detail: null, stage: "started" }]
}

import { z } from "zod"
import { type CliRuntime, readCliLines, withCliProcess } from "./cli-process.js"
import {
  type AssistantEvent,
  eventSchema,
  type ModelSelection,
  selectionSchema,
  tokenSchema,
} from "./feedback.js"
import { toolInputText } from "./output-format.js"
import { claudeArguments, claudeSettingsRequest } from "./requests.js"

const settingsResponse = z.object({
  response: z.object({
    subtype: z.literal("success"),
    request_id: z.literal(claudeSettingsRequest.request_id),
    response: z.object({ applied: selectionSchema }),
  }),
})
const contentSchema = z.array(eventSchema)
const assistantMessage = z.object({
  message: z.object({
    content: contentSchema,
    usage: z.object({
      input_tokens: tokenSchema,
      cache_read_input_tokens: tokenSchema,
      cache_creation_input_tokens: tokenSchema,
    }),
  }),
})

export function decodeClaude(record: unknown): AssistantEvent[] {
  const event = eventSchema.parse(record)
  // Subagent messages cannot supply the parent turn's completion or measurements.
  if (event.parent_tool_use_id != null) return []
  switch (event.type) {
    case "control_response": {
      const response = z
        .looseObject({ request_id: z.string() })
        .parse(event.response)
      if (
        response.request_id !== claudeSettingsRequest.request_id ||
        response.subtype !== "success"
      )
        return []
      return [
        {
          type: "model",
          selection: settingsResponse.parse(event).response.response.applied,
        },
      ]
    }
    case "system": {
      const { subtype } = z.object({ subtype: z.string() }).parse(event)
      if (subtype !== "init") return []
      const { session_id } = z
        .object({ session_id: z.string().min(1) })
        .parse(event)
      return [{ type: "session", sessionId: session_id }]
    }
    case "assistant": {
      const { content, usage } = assistantMessage.parse(event).message
      const feedback: AssistantEvent[] = [
        {
          type: "context",
          tokens:
            usage.input_tokens +
            usage.cache_read_input_tokens +
            usage.cache_creation_input_tokens,
          window: null,
        },
      ]
      for (const block of content) {
        if (block.type === "text") {
          feedback.push({
            type: "text",
            text: z.object({ text: z.string() }).parse(block).text,
          })
        } else if (block.type === "tool_use") {
          const tool = z
            .object({
              name: z.string().min(1),
              input: z.record(z.string(), z.unknown()),
            })
            .parse(block)
          if (tool.name === "Bash")
            z.object({ command: z.string() }).parse(tool.input)
          feedback.push({
            type: "tool",
            invocation: `${tool.name} ${toolInputText(tool.input)}`,
            detail: tool.input,
            stage: "started",
          })
        }
      }
      return feedback
    }
    case "user": {
      const { message } = z
        .object({
          message: z.object({ content: z.union([z.string(), contentSchema]) }),
        })
        .parse(event)
      if (typeof message.content === "string") return []
      return message.content
        .filter((block) => block.type === "tool_result")
        .map((block) => {
          const result = z
            .object({
              tool_use_id: z.string().min(1),
              content: z.union([z.string(), z.array(z.unknown())]),
              is_error: z.boolean().optional(),
            })
            .parse(block)
          return {
            type: "tool",
            invocation: null,
            detail: result,
            stage: "completed",
          }
        })
    }
    case "result": {
      const result = z
        .object({
          is_error: z.boolean(),
          result: z.string().optional(),
          errors: z.array(z.string()).optional(),
          subtype: z.string(),
        })
        .parse(event)
      if (result.is_error)
        throw new Error(
          result.result || result.errors?.join("; ") || result.subtype,
        )
      if (result.result === undefined)
        throw new Error("Claude completed without final text")
      return [{ type: "final", text: result.result }, { type: "complete" }]
    }
    default:
      return []
  }
}

export async function readClaudeSettings(
  runtime: CliRuntime,
  diagnostic: (text: string) => Promise<void>,
): Promise<ModelSelection> {
  return withCliProcess(
    runtime,
    "claude",
    [...claudeArguments(runtime.cwd, null), "--no-session-persistence"],
    `${JSON.stringify(claudeSettingsRequest)}\n`,
    async (child) => {
      let selection: ModelSelection | undefined
      await readCliLines(child, "stdout", async (line) => {
        for (const event of decodeClaude(JSON.parse(line))) {
          if (event.type === "model") selection = event.selection
        }
      })
      if (selection === undefined)
        throw new Error("Claude ended without reporting settings")
      return selection
    },
    diagnostic,
  )
}

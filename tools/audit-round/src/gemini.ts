import { z } from "zod"
import { type AssistantEvent, tokenSchema } from "./feedback.js"
import { toolInputText } from "./output-format.js"

const envelope = z.looseObject({ event: z.string().min(1) })
const stepUpdate = z.looseObject({ step_type: z.string().min(1) })
const inputUsage = z.object({
  input_tokens: tokenSchema,
  cache_read_tokens: tokenSchema,
})
const fields = z.record(z.string(), z.unknown())

export function decodeGemini(record: unknown): AssistantEvent[] {
  const event = envelope.parse(record)
  switch (event.event) {
    case "init": {
      const { conversation_id, init } = z
        .object({
          conversation_id: z.string().min(1),
          init: z.object({ model: z.string().min(1) }),
        })
        .parse(event)
      const pinned = /^(.+)-(low|medium|high|xhigh|max)$/.exec(init.model)
      return [
        { type: "session", sessionId: conversation_id },
        {
          type: "model",
          selection: {
            model: pinned?.[1] ?? init.model,
            effort: pinned?.[2] ?? null,
          },
        },
      ]
    }
    case "step_update": {
      const step = stepUpdate.parse(event.step_update)
      switch (step.step_type) {
        case "agent_response":
          return decodeResponse(step)
        case "tool":
          return decodeTool(step)
        default:
          return []
      }
    }
    case "result":
      return decodeResult(event.result)
    default:
      return []
  }
}

// Each schema attempt arrives as a whole JSON object, even when finish rejects it.
function isSchemaAttempt(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{")) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

function decodeResponse(step: unknown): AssistantEvent[] {
  const { text_delta, usage } = z
    .object({
      text_delta: z.string().optional(),
      usage: inputUsage.optional(),
    })
    .parse(step)
  const events: AssistantEvent[] = []
  if (usage !== undefined)
    events.push({
      type: "context",
      tokens: usage.input_tokens + usage.cache_read_tokens,
      window: null,
    })
  if (text_delta && !isSchemaAttempt(text_delta))
    events.push({ type: "text", text: text_delta })
  return events
}

function decodeTool(step: unknown): AssistantEvent[] {
  const { state } = z.object({ state: z.string() }).parse(step)
  switch (state) {
    case "ACTIVE": {
      const { tool_name, tool_info } = z
        .object({
          tool_name: z.string().min(1),
          tool_info: z.object({ parameters: fields }),
        })
        .parse(step)
      return [
        {
          type: "tool",
          stage: "started",
          invocation: `${tool_name} ${toolInputText(tool_info.parameters)}`,
          detail: tool_info.parameters,
        },
      ]
    }
    case "DONE":
    case "ERROR":
      return [
        {
          type: "tool",
          stage: "completed",
          invocation: null,
          detail: z.object({ tool_info: fields }).parse(step).tool_info,
        },
      ]
    default:
      return []
  }
}

function decodeResult(result: unknown): AssistantEvent[] {
  const { status, error } = z
    .object({
      status: z.string().min(1),
      error: z.string().optional(),
    })
    .parse(result)
  if (status !== "SUCCESS") throw new Error(error || status)
  const { usage, response, structured_output } = z
    .object({
      usage: inputUsage.extend({ output_tokens: tokenSchema }),
      response: z.string().optional(),
      structured_output: z.unknown().optional(),
    })
    .parse(result)
  if (response === undefined && structured_output === undefined)
    throw new Error("Gemini finished a turn without a response")
  return [
    {
      type: "tokens",
      update: {
        kind: "selected-model",
        tokens: {
          input: usage.input_tokens + usage.cache_read_tokens,
          cached: usage.cache_read_tokens,
          output: usage.output_tokens,
        },
      },
    },
    { type: "final", text: response, structuredOutput: structured_output },
    { type: "complete" },
  ]
}

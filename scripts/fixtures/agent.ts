import { type EffortLevel, query } from "@anthropic-ai/claude-agent-sdk"
import { fail } from "./log"

export interface Usage {
  input_tokens: number
  output_tokens: number
  wall_ms: number
}

export type QueryOptions = Parameters<typeof query>[0]["options"]

export function effortOption(effort: string): { effort?: EffortLevel } {
  return effort === "none" ? {} : { effort: effort as EffortLevel }
}

export async function runAgent(
  prompt: string,
  options: QueryOptions,
): Promise<{ reply: string; usage: Usage }> {
  const start = Date.now()
  let reply = ""
  let inputTokens = 0
  let outputTokens = 0

  for await (const message of query({ prompt, options })) {
    if (message.type !== "result") continue
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

  return {
    reply,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      wall_ms: Date.now() - start,
    },
  }
}

import {
  type ClaudeCoderRequest,
  createClaudeLlmTextClient,
  runClaudeCoder,
} from "@repo-edu/integrations-llm"
import type {
  LlmModelSpec,
  LlmTextClient,
  LlmUsage,
} from "@repo-edu/integrations-llm-contract"
import { emit } from "./log"

export interface Usage {
  input_tokens: number
  output_tokens: number
  wall_ms: number
}

export function toLegacyUsage(usage: LlmUsage): Usage {
  return {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    wall_ms: usage.wallMs,
  }
}

const xtraceSink = (text: string): void => {
  emit(3, text)
}

let cachedClient: LlmTextClient | null = null

function getClient(): LlmTextClient {
  if (!cachedClient) {
    cachedClient = createClaudeLlmTextClient(undefined, { trace: xtraceSink })
  }
  return cachedClient
}

export async function generateText(
  spec: LlmModelSpec,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ reply: string; usage: Usage }> {
  const result = await getClient().generateText({ spec, prompt, signal })
  return { reply: result.reply, usage: toLegacyUsage(result.usage) }
}

export async function runCoder(
  request: Omit<ClaudeCoderRequest, "trace">,
): Promise<{ reply: string; usage: Usage }> {
  const result = await runClaudeCoder({ ...request, trace: xtraceSink })
  return { reply: result.reply, usage: toLegacyUsage(result.usage) }
}

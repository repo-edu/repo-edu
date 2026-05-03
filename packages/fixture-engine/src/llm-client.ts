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
): Promise<{ reply: string; usage: LlmUsage }> {
  return getClient().generateText({ spec, prompt, signal })
}

export async function runCoder(
  request: Omit<ClaudeCoderRequest, "trace">,
): Promise<{ reply: string; usage: LlmUsage }> {
  return runClaudeCoder({ ...request, trace: xtraceSink })
}

export function emptyUsage(authMode: LlmUsage["authMode"] = "api"): LlmUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    wallMs: 0,
    authMode,
  }
}

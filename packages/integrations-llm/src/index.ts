import type {
  GenerateTextRequest,
  LlmProvider,
  LlmResult,
  LlmRuntimeConfig,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import { createClaudeLlmTextClient } from "./claude"
import { createCodexLlmTextClient } from "./codex"

export const packageId = "@repo-edu/integrations-llm"

export type { ClaudeCoderRequest } from "./claude"
export { createClaudeLlmTextClient, runClaudeCoder } from "./claude"
export type { CodexClientFactory } from "./codex"
export { buildCodexThreadOptions, createCodexLlmTextClient } from "./codex"

export function createLlmTextClient(
  config: LlmRuntimeConfig = {},
): LlmTextClient {
  const claude = createClaudeLlmTextClient(config.claude)
  const codex = createCodexLlmTextClient(config.codex)
  const route = (provider: LlmProvider): LlmTextClient => {
    if (provider === "claude") return claude
    if (provider === "codex") return codex
    throw new Error(`unknown provider: ${provider}`)
  }
  return {
    generateText(request: GenerateTextRequest): Promise<LlmResult> {
      return route(request.spec.provider).generateText(request)
    },
  }
}

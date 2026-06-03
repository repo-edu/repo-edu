import type {
  GenerateTextRequest,
  LlmProvider,
  LlmResult,
  LlmRuntimeConfig,
  LlmStreamEvent,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import { createClaudeLlmTextClient } from "./claude"
import { createCodexLlmTextClient, type TraceSink } from "./codex"

export const packageId = "@repo-edu/integrations-llm"

export { createClaudeLlmTextClient } from "./claude"
export type { CodexClientFactory } from "./codex"
export {
  buildCodexFixtureCoderThreadOptions,
  buildCodexThreadOptions,
  createCodexLlmTextClient,
  runCodexFixtureCoder,
} from "./codex"

export type CreateLlmTextClientOptions = {
  trace?: TraceSink
}

export function createLlmTextClient(
  config: LlmRuntimeConfig = {},
  options?: CreateLlmTextClientOptions,
): LlmTextClient {
  const claude = createClaudeLlmTextClient(config.claude, {
    trace: options?.trace,
  })
  const codex = createCodexLlmTextClient(config.codex, {
    trace: options?.trace,
  })
  const route = (provider: LlmProvider): LlmTextClient => {
    if (provider === "claude") return claude
    if (provider === "codex") return codex
    throw new Error(`unknown provider: ${provider}`)
  }
  return {
    generateText(request: GenerateTextRequest): Promise<LlmResult> {
      return route(request.spec.provider).generateText(request)
    },
    streamText(request: GenerateTextRequest): AsyncIterable<LlmStreamEvent> {
      return route(request.spec.provider).streamText(request)
    },
  }
}

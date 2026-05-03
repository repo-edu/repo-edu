import type {
  GenerateTextRequest,
  LlmProviderRuntimeConfig,
  LlmResult,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import { type CodexClientFactory, runCodexQuery } from "./runner"
import type { TraceSink } from "./trace"

export type { CodexClientFactory } from "./runner"
export { buildCodexThreadOptions, runCodexQuery } from "./runner"
export type { TraceSink } from "./trace"

export type CreateCodexLlmTextClientOptions = {
  trace?: TraceSink
  factory?: CodexClientFactory
}

export function createCodexLlmTextClient(
  config?: LlmProviderRuntimeConfig,
  options?: CreateCodexLlmTextClientOptions,
): LlmTextClient {
  return {
    async generateText(request: GenerateTextRequest): Promise<LlmResult> {
      return runCodexQuery(
        {
          spec: request.spec,
          prompt: request.prompt,
          signal: request.signal,
          trace: options?.trace,
          factory: options?.factory,
        },
        config,
      )
    },
  }
}

import {
  type GenerateTextRequest,
  LlmError,
  type LlmProviderRuntimeConfig,
  type LlmResult,
  type LlmTextClient,
} from "@repo-edu/integrations-llm-contract"

export function createCodexLlmTextClient(
  _config?: LlmProviderRuntimeConfig,
): LlmTextClient {
  return {
    async generateText(_request: GenerateTextRequest): Promise<LlmResult> {
      throw new LlmError("other", "codex provider not yet available", {
        context: { provider: "codex" },
      })
    },
  }
}

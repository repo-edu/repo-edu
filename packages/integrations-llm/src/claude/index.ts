import type {
  ClaudeLlmProviderRuntimeConfig,
  GenerateTextRequest,
  LlmResult,
  LlmStreamEvent,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import type { ClaudeRunOptions } from "./runner"
import { runClaudeQuery, runClaudeStream } from "./runner"

export type { ClaudeRunOptions } from "./runner"
export { runClaudeQuery, runClaudeStream } from "./runner"
export type { TraceSink } from "./trace"

export type CreateClaudeLlmTextClientOptions = {
  trace?: import("./trace").TraceSink
}

export function createClaudeLlmTextClient(
  config?: ClaudeLlmProviderRuntimeConfig,
  options?: CreateClaudeLlmTextClientOptions,
): LlmTextClient {
  return {
    async generateText(request: GenerateTextRequest): Promise<LlmResult> {
      return runClaudeQuery(
        buildClaudeRunOptions(request, options?.trace),
        config,
      )
    },
    streamText(request: GenerateTextRequest): AsyncIterable<LlmStreamEvent> {
      return runClaudeStream(
        buildClaudeRunOptions(request, options?.trace),
        config,
      )
    },
  }
}

function buildClaudeRunOptions(
  request: GenerateTextRequest,
  trace: import("./trace").TraceSink | undefined,
): ClaudeRunOptions {
  return {
    spec: request.spec,
    prompt: request.prompt,
    signal: request.signal,
    trace,
  }
}

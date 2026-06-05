import type {
  CodexLlmProviderRuntimeConfig,
  GenerateTextRequest,
  LlmResult,
  LlmStreamEvent,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import {
  type CodexClientFactory,
  runCodexQuery,
  runCodexQueryStream,
} from "./runner"
import type { TraceSink } from "./trace"

export type { CodexClientFactory, CodexFixtureCoderRequest } from "./runner"
export {
  buildCodexFixtureCoderThreadOptions,
  buildCodexThreadOptions,
  runCodexFixtureCoder,
  runCodexQuery,
  runCodexQueryStream,
} from "./runner"
export type { TraceSink } from "./trace"

export type CreateCodexLlmTextClientOptions = {
  trace?: TraceSink
  factory?: CodexClientFactory
}

export function createCodexLlmTextClient(
  config?: CodexLlmProviderRuntimeConfig,
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
    streamText(request: GenerateTextRequest): AsyncIterable<LlmStreamEvent> {
      return runCodexQueryStream(
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

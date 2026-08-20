import type {
  ClaudeLlmProviderRuntimeConfig,
  GenerateTextRequest,
  LlmResult,
  LlmStreamEvent,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import type { ClaudeRunOptions } from "./runner"
import { runClaudeGenerate, runClaudeStream } from "./runner"

export type {
  ClaudeCliFailure,
  ClaudeCliLaunch,
  ClaudeCliLaunchRequest,
  ClaudeCliProcess,
} from "./cli-process"
export type { ClaudeRunOptions } from "./runner"
export { runClaudeGenerate, runClaudeStream } from "./runner"
export type { TraceSink } from "./trace"

export type CreateClaudeLlmTextClientOptions = {
  cli?: {
    readonly launch: import("./cli-process").ClaudeCliLaunch
    readonly executable?: string
  }
  trace?: import("./trace").TraceSink
}

export function createClaudeLlmTextClient(
  config?: ClaudeLlmProviderRuntimeConfig,
  options?: CreateClaudeLlmTextClientOptions,
): LlmTextClient {
  return {
    async generateText(request: GenerateTextRequest): Promise<LlmResult> {
      return runClaudeGenerate(buildClaudeRunOptions(request, options), config)
    },
    streamText(request: GenerateTextRequest): AsyncIterable<LlmStreamEvent> {
      return runClaudeStream(buildClaudeRunOptions(request, options), config)
    },
  }
}

function buildClaudeRunOptions(
  request: GenerateTextRequest,
  options: CreateClaudeLlmTextClientOptions | undefined,
): ClaudeRunOptions {
  return {
    spec: request.spec,
    prompt: request.prompt,
    signal: request.signal,
    cliExecutable: options?.cli?.executable,
    cliLaunch: options?.cli?.launch,
    trace: options?.trace,
  }
}

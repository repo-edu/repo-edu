import type {
  EffortLevel as ClaudeAgentEffortLevel,
  Options as ClaudeAgentOptions,
} from "@anthropic-ai/claude-agent-sdk"
import type {
  GenerateTextRequest,
  LlmEffort,
  LlmProviderRuntimeConfig,
  LlmResult,
  LlmStreamEvent,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import type { ClaudeRunOptions } from "./runner"
import { runClaudeQuery, runClaudeStream } from "./runner"

export type { ClaudeCoderRequest } from "./coder"
export { CLAUDE_CODER_DEFAULT_MAX_TURNS, runClaudeCoder } from "./coder"
export type { ClaudeRunOptions } from "./runner"
export { runClaudeQuery, runClaudeStream } from "./runner"
export type { TraceSink } from "./trace"

function effortOption(effort: LlmEffort): { effort?: ClaudeAgentEffortLevel } {
  if (effort === "none") return {}
  return { effort: effort as ClaudeAgentEffortLevel }
}

export type CreateClaudeLlmTextClientOptions = {
  trace?: import("./trace").TraceSink
}

export function createClaudeLlmTextClient(
  config?: LlmProviderRuntimeConfig,
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
  const agentOptions: ClaudeAgentOptions = {
    model: request.spec.modelId,
    ...effortOption(request.spec.effort),
    maxTurns: 1,
    allowedTools: [],
    permissionMode: "default",
  }
  return {
    spec: request.spec,
    prompt: request.prompt,
    signal: request.signal,
    agentOptions,
    trace,
  }
}

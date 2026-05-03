import type {
  EffortLevel as ClaudeAgentEffortLevel,
  Options as ClaudeAgentOptions,
} from "@anthropic-ai/claude-agent-sdk"
import type {
  GenerateTextRequest,
  LlmEffort,
  LlmProviderRuntimeConfig,
  LlmResult,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import { runClaudeQuery } from "./runner"

export type { ClaudeCoderRequest } from "./coder"
export { CLAUDE_CODER_DEFAULT_MAX_TURNS, runClaudeCoder } from "./coder"
export type { ClaudeRunOptions } from "./runner"
export { runClaudeQuery } from "./runner"
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
      const agentOptions: ClaudeAgentOptions = {
        model: request.spec.modelId,
        ...effortOption(request.spec.effort),
        maxTurns: 1,
        allowedTools: [],
        permissionMode: "default",
      }
      return runClaudeQuery(
        {
          spec: request.spec,
          prompt: request.prompt,
          signal: request.signal,
          agentOptions,
          trace: options?.trace,
        },
        config,
      )
    },
  }
}

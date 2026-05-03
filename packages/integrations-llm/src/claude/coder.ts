import type { Options as ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk"
import type {
  LlmModelSpec,
  LlmProviderRuntimeConfig,
  LlmResult,
} from "@repo-edu/integrations-llm-contract"
import { runClaudeQuery } from "./runner"
import type { TraceSink } from "./trace"

export const CLAUDE_CODER_DEFAULT_MAX_TURNS = 50

const CODER_TOOL_LIST = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]

export type ClaudeCoderRequest = {
  spec: LlmModelSpec
  prompt: string
  cwd: string
  appendInstructions?: string
  maxTurns?: number
  signal?: AbortSignal
  trace?: TraceSink
}

export async function runClaudeCoder(
  request: ClaudeCoderRequest,
  config?: LlmProviderRuntimeConfig,
): Promise<LlmResult> {
  if (request.spec.provider !== "claude") {
    throw new Error(
      `runClaudeCoder received non-claude spec.provider="${request.spec.provider}"`,
    )
  }
  const agentOptions: ClaudeAgentOptions = {
    model: request.spec.modelId,
    ...(request.spec.effort === "none"
      ? {}
      : { effort: request.spec.effort as ClaudeAgentOptions["effort"] }),
    maxTurns: request.maxTurns ?? CLAUDE_CODER_DEFAULT_MAX_TURNS,
    allowedTools: [...CODER_TOOL_LIST],
    permissionMode: "bypassPermissions",
    cwd: request.cwd,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      ...(request.appendInstructions !== undefined
        ? { append: request.appendInstructions }
        : {}),
    },
  }
  return runClaudeQuery(
    {
      spec: request.spec,
      prompt: request.prompt,
      signal: request.signal,
      agentOptions,
      trace: request.trace,
    },
    config,
  )
}

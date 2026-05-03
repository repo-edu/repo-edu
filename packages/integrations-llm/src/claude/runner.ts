import {
  type Options as ClaudeAgentOptions,
  query as claudeAgentQuery,
} from "@anthropic-ai/claude-agent-sdk"
import {
  LlmError,
  type LlmModelSpec,
  type LlmProviderRuntimeConfig,
  type LlmResult,
} from "@repo-edu/integrations-llm-contract"
import { applyEnvOverrides, resolveClaudeAuth } from "./auth"
import { toClaudeLlmError } from "./errors"
import {
  type ClaudeTraceRecorder,
  createClaudeTraceRecorder,
  type TraceSink,
} from "./trace"
import { addUsage, createUsageAccumulator, finalizeUsage } from "./usage"

interface ResultMessage {
  type: "result"
  subtype: string
  result?: unknown
  usage?: Parameters<typeof addUsage>[1]
}

interface AssistantMessage {
  type: "assistant"
  message: {
    content: Array<{
      type: string
      text?: string
      id?: string
      name?: string
      input?: unknown
    }>
  }
}

interface UserMessage {
  type: "user"
  message: {
    content: Array<{ type: string; tool_use_id?: string; content?: unknown }>
  }
}

type StreamMessage =
  | ResultMessage
  | AssistantMessage
  | UserMessage
  | { type: string }

export type ClaudeRunOptions = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
  agentOptions: ClaudeAgentOptions
  trace?: TraceSink
}

export async function runClaudeQuery(
  options: ClaudeRunOptions,
  config: LlmProviderRuntimeConfig | undefined,
): Promise<LlmResult> {
  if (options.spec.provider !== "claude") {
    throw new Error(
      `Claude adapter received non-claude spec.provider="${options.spec.provider}"`,
    )
  }
  const resolved = resolveClaudeAuth(config)
  const start = Date.now()
  const usage = createUsageAccumulator()
  const recorder: ClaudeTraceRecorder = createClaudeTraceRecorder(options.trace)
  let reply = ""
  let resultSubtype: string | null = null

  const envOverride = applyEnvOverrides(resolved)
  try {
    for await (const message of claudeAgentQuery({
      prompt: options.prompt,
      options: options.agentOptions,
    }) as AsyncIterable<StreamMessage>) {
      if (options.signal?.aborted) {
        throw new Error("Operation cancelled.")
      }
      if (message.type === "assistant") {
        const blocks = (message as AssistantMessage).message.content
        recorder.recordAssistantBlocks(blocks)
        continue
      }
      if (message.type === "user") {
        const blocks = (message as UserMessage).message.content
        recorder.recordUserBlocks(blocks)
        continue
      }
      if (message.type === "result") {
        const result = message as ResultMessage
        resultSubtype = result.subtype
        addUsage(usage, result.usage)
        if (typeof result.result === "string") {
          reply = result.result
        }
      }
    }
  } catch (cause) {
    throw toClaudeLlmError(cause, resolved.authMode)
  } finally {
    envOverride.restore()
  }

  if (resultSubtype !== null && resultSubtype !== "success") {
    throw new LlmError(
      "other",
      `Claude turn ended with subtype "${resultSubtype}"`,
      { context: { provider: "claude", authMode: resolved.authMode } },
    )
  }

  return {
    reply,
    usage: finalizeUsage(usage, Date.now() - start, resolved.authMode),
  }
}

import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  Codex,
  type CodexOptions,
  type ThreadEvent,
  type ThreadOptions,
} from "@openai/codex-sdk"
import {
  type LlmEffort,
  LlmError,
  type LlmModelSpec,
  type LlmProviderRuntimeConfig,
  type LlmResult,
} from "@repo-edu/integrations-llm-contract"
import { applyEnvOverrides, resolveCodexAuth } from "./auth"
import { toCodexLlmError } from "./errors"
import {
  type CodexTraceRecorder,
  createCodexTraceRecorder,
  type TraceSink,
} from "./trace"
import { mapCodexUsage } from "./usage"

const PROMPT_REPLY_PREAMBLE = [
  "You are operating in strict prompt/reply mode. Do not inspect files,",
  "run commands, or perform web searches. Answer using only the information",
  "in the prompt below.",
  "",
  "---",
  "",
].join("\n")

export type CodexClientFactory = (options: CodexOptions) => Codex

export type CodexRunOptions = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
  trace?: TraceSink
  factory?: CodexClientFactory
}

export type CodexThreadOptionsSnapshot = ThreadOptions & {
  workingDirectoryEphemeral: true
}

const SUPPORTED_EFFORTS: ReadonlySet<LlmEffort> = new Set([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
])

function effortOption(effort: LlmEffort): {
  modelReasoningEffort?: ThreadOptions["modelReasoningEffort"]
} {
  if (effort === "none") return {}
  if (!SUPPORTED_EFFORTS.has(effort)) return {}
  return {
    modelReasoningEffort: effort as ThreadOptions["modelReasoningEffort"],
  }
}

export function buildCodexThreadOptions(
  spec: LlmModelSpec,
  workingDirectory: string,
): ThreadOptions {
  return {
    model: spec.modelId,
    ...effortOption(spec.effort),
    workingDirectory,
    sandboxMode: "read-only",
    approvalPolicy: "never",
    skipGitRepoCheck: true,
    webSearchMode: "disabled",
  }
}

export async function runCodexQuery(
  options: CodexRunOptions,
  config: LlmProviderRuntimeConfig | undefined,
): Promise<LlmResult> {
  if (options.spec.provider !== "codex") {
    throw new Error(
      `Codex adapter received non-codex spec.provider="${options.spec.provider}"`,
    )
  }
  if (options.spec.effort === "max") {
    throw new LlmError("other", "effort 'max' is not supported on Codex", {
      context: { provider: "codex" },
    })
  }

  const resolved = resolveCodexAuth(config)
  const start = Date.now()
  const recorder: CodexTraceRecorder = createCodexTraceRecorder(options.trace)

  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-prompt-reply-"),
  )
  const envOverride = applyEnvOverrides(resolved)
  try {
    const codex = (options.factory ?? defaultCodexFactory)({
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
    })
    const threadOptions = buildCodexThreadOptions(options.spec, tempDir)
    const thread = codex.startThread(threadOptions)
    const wrappedPrompt = `${PROMPT_REPLY_PREAMBLE}${options.prompt}`
    const streamed = await thread.runStreamed(wrappedPrompt, {
      signal: options.signal,
    })

    let finalResponse = ""
    let usage: Parameters<typeof mapCodexUsage>[0] = null
    let turnFailure: string | null = null
    let streamError: string | null = null
    for await (const event of streamed.events as AsyncIterable<ThreadEvent>) {
      if (options.signal?.aborted) {
        throw new Error("Operation cancelled.")
      }
      if (event.type === "item.completed") {
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text
          recorder.recordAgentMessage(event.item)
        } else if (event.item.type === "reasoning") {
          recorder.recordReasoning(event.item)
        } else if (event.item.type === "error") {
          recorder.recordError(event.item.message)
        }
        continue
      }
      if (event.type === "turn.completed") {
        usage = event.usage
        continue
      }
      if (event.type === "turn.failed") {
        turnFailure = event.error.message
        recorder.recordError(turnFailure)
        break
      }
      if (event.type === "error") {
        streamError = event.message
        recorder.recordError(streamError)
        break
      }
    }
    if (turnFailure) {
      throw new Error(turnFailure)
    }
    if (streamError) {
      throw new Error(streamError)
    }
    return {
      reply: finalResponse,
      usage: mapCodexUsage(usage, Date.now() - start, resolved.authMode),
    }
  } catch (cause) {
    throw toCodexLlmError(cause, resolved.authMode)
  } finally {
    envOverride.restore()
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

function defaultCodexFactory(options: CodexOptions): Codex {
  return new Codex(options)
}

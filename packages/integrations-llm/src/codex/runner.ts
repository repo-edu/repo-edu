import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  Codex,
  type CodexOptions,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
} from "@openai/codex-sdk"
import {
  type CodexLlmProviderRuntimeConfig,
  type LlmEffort,
  LlmError,
  type LlmModelSpec,
  type LlmResult,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { resolveCodexAuth } from "./auth"
import { toCodexError } from "./errors"
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
    networkAccessEnabled: false,
    webSearchMode: "disabled",
  }
}

export async function runCodexQuery(
  options: CodexRunOptions,
  config: CodexLlmProviderRuntimeConfig | undefined,
): Promise<LlmResult> {
  return collectCodexStream(runCodexQueryStream(options, config))
}

export async function* runCodexQueryStream(
  options: CodexRunOptions,
  config: CodexLlmProviderRuntimeConfig | undefined,
): AsyncIterable<LlmStreamEvent> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-prompt-reply-"),
  )
  try {
    const threadOptions = buildCodexThreadOptions(options.spec, tempDir)
    const wrappedPrompt = `${PROMPT_REPLY_PREAMBLE}${options.prompt}`
    yield* runCodexTurnStream(options, config, threadOptions, wrappedPrompt)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function collectCodexStream(
  stream: AsyncIterable<LlmStreamEvent>,
): Promise<LlmResult> {
  let reply = ""
  let usage: LlmResult["usage"] | null = null
  for await (const event of stream) {
    if (event.kind === "text-delta") {
      reply += event.text
    } else if (event.kind === "done") {
      usage = event.usage
    }
  }
  if (usage === null) {
    throw new LlmError(
      "other",
      "Codex stream ended without a terminal usage event.",
      { context: { provider: "codex" } },
    )
  }
  return { reply, usage }
}

async function* runCodexTurnStream(
  options: CodexRunOptions,
  config: CodexLlmProviderRuntimeConfig | undefined,
  threadOptions: ThreadOptions,
  prompt: string,
): AsyncIterable<LlmStreamEvent> {
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

  try {
    yield { kind: "activity", label: "Contacting Codex." }
    if (options.signal?.aborted) {
      throw new Error("Operation cancelled.")
    }
    const codex = (options.factory ?? defaultCodexFactory)(
      resolved.clientOptions,
    )
    const thread = codex.startThread(threadOptions)
    const streamed = await thread.runStreamed(prompt, {
      signal: options.signal,
    })

    const emittedTextLengthsByItemId = new Map<string, number>()
    let turnFailure: string | null = null
    let streamError: string | null = null
    for await (const event of streamed.events as AsyncIterable<ThreadEvent>) {
      if (options.signal?.aborted) {
        throw new Error("Operation cancelled.")
      }
      if (event.type === "item.started") {
        const label = codexActivityLabel(event.item, "started")
        if (label !== null) {
          yield { kind: "activity", label }
        }
        recorder.recordItemStarted(event.item)
        continue
      }
      if (event.type === "item.updated") {
        if (event.item.type === "agent_message") {
          const suffix = agentMessageTextSuffix(
            event.item,
            emittedTextLengthsByItemId,
          )
          if (suffix.length > 0) {
            yield { kind: "text-delta", text: suffix }
          }
        } else {
          const label = codexActivityLabel(event.item, "updated")
          if (label !== null) {
            yield { kind: "activity", label }
          }
        }
        recorder.recordItemUpdated(event.item)
        continue
      }
      if (event.type === "item.completed") {
        if (event.item.type === "agent_message") {
          const suffix = agentMessageTextSuffix(
            event.item,
            emittedTextLengthsByItemId,
          )
          if (suffix.length > 0) {
            yield { kind: "text-delta", text: suffix }
          }
          recorder.recordAgentMessage(event.item)
        } else {
          const label = codexActivityLabel(event.item, "completed")
          if (label !== null) {
            yield { kind: "activity", label }
          }
          if (event.item.type === "reasoning") {
            recorder.recordReasoning(event.item)
          } else if (event.item.type === "error") {
            recorder.recordError(event.item.message)
          } else {
            recorder.recordItemCompleted(event.item)
          }
        }
        continue
      }
      if (event.type === "turn.started") {
        yield { kind: "activity", label: "Codex started working." }
        continue
      }
      if (event.type === "turn.completed") {
        recorder.recordUsage(event.usage)
        yield {
          kind: "done",
          usage: mapCodexUsage(
            event.usage,
            Date.now() - start,
            resolved.authMode,
          ),
        }
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
    if (options.signal?.aborted) {
      throw new Error("Operation cancelled.")
    }
    if (turnFailure) {
      throw new Error(turnFailure)
    }
    if (streamError) {
      throw new Error(streamError)
    }
  } catch (cause) {
    throw toCodexError(cause, resolved.authMode, options.signal)
  }
}

function agentMessageTextSuffix(
  item: Extract<ThreadItem, { type: "agent_message" }>,
  emittedTextLengthsByItemId: Map<string, number>,
): string {
  const previousLength = emittedTextLengthsByItemId.get(item.id) ?? 0
  const nextLength = item.text.length
  emittedTextLengthsByItemId.set(item.id, Math.max(previousLength, nextLength))
  if (nextLength <= previousLength) return ""
  return item.text.slice(previousLength)
}

function codexActivityLabel(
  item: ThreadItem,
  phase: "started" | "updated" | "completed",
): string | null {
  switch (item.type) {
    case "reasoning":
      return phase === "completed"
        ? "Codex finished reasoning."
        : "Codex is reasoning."
    case "agent_message":
      return "Codex is writing a response."
    case "command_execution":
      return codexCommandActivityLabel(item.command, item.status)
    case "mcp_tool_call":
      return codexToolActivityLabel(item.server, item.tool, item.status)
    case "web_search":
      return phase === "completed"
        ? `Codex finished web search: ${shortActivityText(item.query)}`
        : `Codex is searching the web: ${shortActivityText(item.query)}`
    case "file_change":
      return item.status === "completed"
        ? "Codex applied file changes."
        : "Codex file changes failed."
    case "todo_list": {
      const activeTodo = item.items.find((todo) => !todo.completed)
      return activeTodo
        ? `Codex is planning: ${shortActivityText(activeTodo.text)}`
        : "Codex updated its task list."
    }
    case "error":
      return "Codex reported an error."
  }
}

function codexCommandActivityLabel(
  command: string,
  status: "in_progress" | "completed" | "failed",
): string {
  const formatted = shortActivityText(unwrapShellCommand(command).trim())
  if (status === "completed") return `Codex finished: ${formatted}`
  if (status === "failed") return `Codex command failed: ${formatted}`
  return `Codex is inspecting files: ${formatted}`
}

function codexToolActivityLabel(
  server: string,
  tool: string,
  status: "in_progress" | "completed" | "failed",
): string {
  const name = `${server}.${tool}`
  if (status === "completed") return `Codex finished tool: ${name}`
  if (status === "failed") return `Codex tool failed: ${name}`
  return `Codex is using tool: ${name}`
}

function shortActivityText(text: string): string {
  const singleLine = text.replaceAll(/\s+/g, " ").trim()
  if (singleLine.length <= 96) return singleLine
  return `${singleLine.slice(0, 93)}...`
}

function defaultCodexFactory(options: CodexOptions): Codex {
  return new Codex(options)
}

function unwrapShellCommand(command: string): string {
  const match = command.match(/^\/bin\/(?:zsh|bash|sh)\s+-lc\s+(.+)$/)
  if (!match) return command
  return stripOuterQuotes(match[1])
}

function stripOuterQuotes(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
    return value.slice(1, -1).replaceAll(`\\${first}`, first)
  }
  return value
}

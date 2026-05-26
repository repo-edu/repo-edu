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
  type LlmEffort,
  LlmError,
  type LlmModelSpec,
  type LlmProviderRuntimeConfig,
  type LlmResult,
  type LlmStreamEvent,
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

const FIXTURE_CODER_PREAMBLE = [
  "You are operating as the Codex backend for a fixture repository coding",
  "round. Work only in the repository working directory provided for this",
  "thread. Do not use the network, do not ask for approval, and do not",
  "attempt package downloads or external service calls.",
  "",
  "Run as a one-shot Codex patch engine: do not call MCP discovery, do not",
  "perform web search, do not run tests, and do not use git. Prefer one",
  "file-change batch. The coordinator prompt includes a current project",
  "file list and, for build rounds, the target file content. Use those to",
  "edit directly when possible. If shell inspection is unavoidable in later",
  "rounds, use only read-only commands such as rg, sed -n, ls, find, cat,",
  "pwd, nl -ba, or wc -l.",
  "",
  "Each shell call must be a single command with no shell operators: no",
  "pipes (|), no redirects (>, <), no command chaining (&&, ||, ;), no",
  "command substitution ($(...) or backticks), and no backgrounding (&).",
  "If you need to combine outputs, run separate commands in successive",
  "calls.",
  "",
  "The fixture coordinator owns git staging and commits. Make file edits for",
  "the requested round, then end your final assistant message with the",
  "required DELETE:/COMMIT: trailer protocol exactly as instructed below.",
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

export type CodexFixtureCoderRequest = CodexRunOptions & {
  cwd: string
  appendInstructions?: string
  limits?: Partial<CodexFixtureCoderLimits>
}

export type CodexThreadOptionsSnapshot = ThreadOptions & {
  workingDirectoryEphemeral: true
}

export type CodexFixtureCoderLimits = {
  maxElapsedMs: number
  maxReasoningItems: number
  maxFileChangeBatches: number
  maxReadOnlyCommands: number
  maxMcpToolCalls: number
  maxWebSearches: number
}

export const DEFAULT_CODEX_FIXTURE_CODER_LIMITS: CodexFixtureCoderLimits = {
  maxElapsedMs: 180_000,
  maxReasoningItems: 6,
  maxFileChangeBatches: 4,
  maxReadOnlyCommands: 12,
  maxMcpToolCalls: 0,
  maxWebSearches: 0,
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

export function buildCodexFixtureCoderThreadOptions(
  spec: LlmModelSpec,
  workingDirectory: string,
): ThreadOptions {
  return {
    model: spec.modelId,
    ...effortOption(spec.effort),
    workingDirectory,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    webSearchMode: "disabled",
  }
}

export async function runCodexQuery(
  options: CodexRunOptions,
  config: LlmProviderRuntimeConfig | undefined,
): Promise<LlmResult> {
  return collectCodexStream(runCodexQueryStream(options, config))
}

export async function* runCodexQueryStream(
  options: CodexRunOptions,
  config: LlmProviderRuntimeConfig | undefined,
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

export async function runCodexFixtureCoder(
  options: CodexFixtureCoderRequest,
  config: LlmProviderRuntimeConfig | undefined,
): Promise<LlmResult> {
  const threadOptions = buildCodexFixtureCoderThreadOptions(
    options.spec,
    options.cwd,
  )
  const append =
    options.appendInstructions === undefined
      ? ""
      : `${options.appendInstructions}\n\n---\n\n`
  const wrappedPrompt = `${FIXTURE_CODER_PREAMBLE}${append}${options.prompt}`
  return runCodexTurn(options, config, threadOptions, wrappedPrompt, {
    kind: "fixture-coder",
    limits: {
      ...DEFAULT_CODEX_FIXTURE_CODER_LIMITS,
      ...options.limits,
    },
  })
}

type CodexTurnGuard =
  | { kind: "none" }
  | {
      kind: "fixture-coder"
      limits: CodexFixtureCoderLimits
    }

async function runCodexTurn(
  options: CodexRunOptions,
  config: LlmProviderRuntimeConfig | undefined,
  threadOptions: ThreadOptions,
  prompt: string,
  guard: CodexTurnGuard = { kind: "none" },
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
  const eventGuard =
    guard.kind === "fixture-coder"
      ? createCodexFixtureCoderEventGuard(guard.limits, start)
      : null

  const envOverride = applyEnvOverrides(resolved)
  const turnSignal = createTurnSignal(
    options.signal,
    guard.kind === "fixture-coder" ? guard.limits.maxElapsedMs : undefined,
  )
  try {
    const codex = (options.factory ?? defaultCodexFactory)({
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
    })
    const thread = codex.startThread(threadOptions)
    const streamed = await thread.runStreamed(prompt, {
      signal: turnSignal.signal,
    })

    let finalResponse = ""
    let usage: Parameters<typeof mapCodexUsage>[0] = null
    let turnFailure: string | null = null
    let streamError: string | null = null
    for await (const event of streamed.events as AsyncIterable<ThreadEvent>) {
      if (turnSignal.signal?.aborted) {
        throw new Error("Operation cancelled.")
      }
      eventGuard?.record(event)
      if (event.type === "item.started") {
        recorder.recordItemStarted(event.item)
        continue
      }
      if (event.type === "item.updated") {
        recorder.recordItemUpdated(event.item)
        continue
      }
      if (event.type === "item.completed") {
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text
          recorder.recordAgentMessage(event.item)
        } else if (event.item.type === "reasoning") {
          recorder.recordReasoning(event.item)
        } else if (event.item.type === "error") {
          recorder.recordError(event.item.message)
        } else {
          recorder.recordItemCompleted(event.item)
        }
        continue
      }
      if (event.type === "turn.completed") {
        usage = event.usage
        recorder.recordUsage(usage)
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
    if (turnSignal.timedOut()) {
      throw toCodexLlmError(
        new LlmError(
          "guardrail",
          `Codex fixture coder guardrail: elapsed time exceeded ${guard.kind === "fixture-coder" ? guard.limits.maxElapsedMs : 0}ms`,
          { cause, context: { provider: "codex" } },
        ),
        resolved.authMode,
      )
    }
    throw toCodexLlmError(cause, resolved.authMode)
  } finally {
    turnSignal.cleanup()
    envOverride.restore()
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
  config: LlmProviderRuntimeConfig | undefined,
  threadOptions: ThreadOptions,
  prompt: string,
  guard: CodexTurnGuard = { kind: "none" },
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
  const eventGuard =
    guard.kind === "fixture-coder"
      ? createCodexFixtureCoderEventGuard(guard.limits, start)
      : null

  const envOverride = applyEnvOverrides(resolved)
  const turnSignal = createTurnSignal(
    options.signal,
    guard.kind === "fixture-coder" ? guard.limits.maxElapsedMs : undefined,
  )
  try {
    yield { kind: "activity", label: "Contacting Codex." }
    const codex = (options.factory ?? defaultCodexFactory)({
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
    })
    const thread = codex.startThread(threadOptions)
    const streamed = await thread.runStreamed(prompt, {
      signal: turnSignal.signal,
    })

    const emittedTextLengthsByItemId = new Map<string, number>()
    let turnFailure: string | null = null
    let streamError: string | null = null
    for await (const event of streamed.events as AsyncIterable<ThreadEvent>) {
      if (turnSignal.signal?.aborted) {
        throw new Error("Operation cancelled.")
      }
      eventGuard?.record(event)
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
    if (turnFailure) {
      throw new Error(turnFailure)
    }
    if (streamError) {
      throw new Error(streamError)
    }
  } catch (cause) {
    if (turnSignal.timedOut()) {
      throw toCodexLlmError(
        new LlmError(
          "guardrail",
          `Codex fixture coder guardrail: elapsed time exceeded ${guard.kind === "fixture-coder" ? guard.limits.maxElapsedMs : 0}ms`,
          { cause, context: { provider: "codex" } },
        ),
        resolved.authMode,
      )
    }
    throw toCodexLlmError(cause, resolved.authMode)
  } finally {
    turnSignal.cleanup()
    envOverride.restore()
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

function createTurnSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): { signal?: AbortSignal; cleanup(): void; timedOut(): boolean } {
  if (timeoutMs === undefined) {
    return { signal, cleanup: () => {}, timedOut: () => false }
  }

  const controller = new AbortController()
  let timedOut = false
  let externallyAborted = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abort = () => {
    externallyAborted = true
    controller.abort()
  }
  signal?.addEventListener("abort", abort, { once: true })
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    },
    timedOut() {
      return timedOut && !externallyAborted
    },
  }
}

type CodexFixtureCoderEventGuard = {
  record(event: ThreadEvent): void
}

function createCodexFixtureCoderEventGuard(
  limits: CodexFixtureCoderLimits,
  start: number,
): CodexFixtureCoderEventGuard {
  const countedItems = new Set<string>()
  let anonymousItemCount = 0
  let reasoningItems = 0
  let fileChangeBatches = 0
  let readOnlyCommands = 0
  let mcpToolCalls = 0
  let webSearches = 0

  const assertWithin = (actual: number, max: number, label: string): void => {
    if (actual > max) {
      throwFixtureGuardrail(`${label} exceeded ${max}`)
    }
  }

  const countItemOnce = (item: ThreadItem): boolean => {
    const id = item.id ?? `anonymous-${anonymousItemCount++}`
    if (countedItems.has(id)) return false
    countedItems.add(id)
    return true
  }

  return {
    record(event) {
      if (Date.now() - start > limits.maxElapsedMs) {
        throwFixtureGuardrail(`elapsed time exceeded ${limits.maxElapsedMs}ms`)
      }
      if (event.type !== "item.started" && event.type !== "item.completed") {
        return
      }

      const { item } = event
      if (!countItemOnce(item)) return

      if (item.type === "agent_message") return
      if (item.type === "reasoning") {
        reasoningItems++
        assertWithin(
          reasoningItems,
          limits.maxReasoningItems,
          "reasoning items",
        )
        return
      }

      if (item.type === "file_change") {
        fileChangeBatches++
        assertWithin(
          fileChangeBatches,
          limits.maxFileChangeBatches,
          "file-change batches",
        )
        return
      }
      if (item.type === "command_execution") {
        const command = item.command
        if (!isAllowedReadOnlyCommand(command)) {
          throwFixtureGuardrail(
            `command execution is limited to read-only inspection commands, got: ${command}`,
          )
        }
        readOnlyCommands++
        assertWithin(
          readOnlyCommands,
          limits.maxReadOnlyCommands,
          "read-only commands",
        )
        return
      }
      if (item.type === "mcp_tool_call") {
        mcpToolCalls++
        assertWithin(mcpToolCalls, limits.maxMcpToolCalls, "MCP tool calls")
        return
      }
      if (item.type === "web_search") {
        webSearches++
        assertWithin(webSearches, limits.maxWebSearches, "web searches")
      }
    },
  }
}

function throwFixtureGuardrail(message: string): never {
  throw new LlmError("guardrail", `Codex fixture coder guardrail: ${message}`, {
    context: { provider: "codex" },
  })
}

function isAllowedReadOnlyCommand(command: string): boolean {
  const normalized = unwrapShellCommand(command).trim()
  if (hasUnquotedShellOperator(normalized)) return false
  return /^(?:pwd|ls(?:\s|$)|find\s+|rg(?:\s|$)|sed\s+-n\s+|nl\s+-ba\s+|wc\s+-l\s+|cat\s+[^>]+$)/.test(
    normalized,
  )
}

function hasUnquotedShellOperator(command: string): boolean {
  let quote: "'" | '"' | null = null
  let escaped = false
  for (const char of command) {
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (quote !== null) {
      if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === ";" || char === "&" || char === "|" || char === "`") {
      return true
    }
    if (char === "$" || char === "<" || char === ">") {
      return true
    }
  }
  return quote !== null
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

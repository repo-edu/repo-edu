import { isAbsolute } from "node:path"
import {
  Codex,
  type CodexOptions,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
  type TurnOptions,
} from "@openai/codex-sdk"
import { buildCodingPrompt } from "./coding-prompt.js"
import { codingResultJsonSchema, parseCodingOutput } from "./coding-result.js"
import type { CodingEvent, CodingRequest, CodingResult } from "./contracts.js"

type CodingSdkThread = {
  runStreamed(
    input: string,
    options: TurnOptions,
  ): Promise<{ readonly events: AsyncIterable<ThreadEvent> }>
}

type CodingSdkClient = {
  startThread(options: ThreadOptions): CodingSdkThread
}

export type CodingSdkFactory = (options: CodexOptions) => CodingSdkClient

export type CodingSdkRunOptions = {
  readonly signal: AbortSignal
  readonly emit: (event: CodingEvent) => void | Promise<void>
  readonly factory?: CodingSdkFactory
}

export function buildCodingThreadOptions(repoEduRoot: string): ThreadOptions {
  if (!isAbsolute(repoEduRoot)) {
    throw new Error("The Repo Edu checkout path must be absolute.")
  }
  return {
    workingDirectory: repoEduRoot,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: true,
    webSearchMode: "disabled",
  }
}

function abortedError(): DOMException {
  return new DOMException("The Codex coding turn was aborted.", "AbortError")
}

function shortText(value: string): string {
  const singleLine = value.replaceAll(/\s+/g, " ").trim()
  return singleLine.length <= 96 ? singleLine : `${singleLine.slice(0, 93)}...`
}

function itemActivity(item: ThreadItem): string | null {
  switch (item.type) {
    case "reasoning":
      return "Codex is reasoning."
    case "agent_message":
      return "Codex is preparing the structured coding result."
    case "command_execution":
      return `Codex command ${item.status}: ${shortText(item.command)}`
    case "file_change":
      return `Codex file change ${item.status}: ${item.changes.length} path(s).`
    case "mcp_tool_call":
      return `Codex tool ${item.status}: ${item.server}.${item.tool}.`
    case "web_search":
      return `Codex web search: ${shortText(item.query)}`
    case "todo_list": {
      const current = item.items.find((todo) => !todo.completed)
      return current
        ? `Codex plan: ${shortText(current.text)}`
        : "Codex completed its task list."
    }
    case "error":
      return `Codex error: ${shortText(item.message)}`
  }
}

async function emitItemActivity(
  item: ThreadItem,
  emit: CodingSdkRunOptions["emit"],
): Promise<void> {
  const label = itemActivity(item)
  if (label !== null) {
    await emit({ kind: "activity", label })
  }
}

function defaultCodingSdkFactory(options: CodexOptions): CodingSdkClient {
  return new Codex(options)
}

export async function runCodexCodingStep(
  request: CodingRequest,
  options: CodingSdkRunOptions,
): Promise<CodingResult> {
  if (options.signal.aborted) {
    throw abortedError()
  }

  const codex = (options.factory ?? defaultCodingSdkFactory)({})
  const thread = codex.startThread(
    buildCodingThreadOptions(request.repoEduRoot),
  )
  const streamed = await thread.runStreamed(buildCodingPrompt(request), {
    outputSchema: codingResultJsonSchema,
    signal: options.signal,
  })

  let finalResponse: string | null = null
  let terminal: "completed" | "failed" | null = null
  let failureMessage = ""

  for await (const event of streamed.events) {
    if (options.signal.aborted) {
      throw abortedError()
    }
    switch (event.type) {
      case "thread.started":
        await options.emit({
          kind: "thread-started",
          threadId: event.thread_id,
        })
        break
      case "turn.started":
        await options.emit({
          kind: "activity",
          label: "Codex started working.",
        })
        break
      case "item.started":
      case "item.updated":
        await emitItemActivity(event.item, options.emit)
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text
        }
        break
      case "item.completed":
        await emitItemActivity(event.item, options.emit)
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text
        }
        break
      case "turn.completed":
        terminal = "completed"
        break
      case "turn.failed":
        terminal = "failed"
        failureMessage = event.error.message
        break
      case "error":
        terminal = "failed"
        failureMessage = event.message
        break
    }
  }

  if (options.signal.aborted) {
    throw abortedError()
  }
  if (terminal === "failed") {
    throw new Error(`The Codex coding turn failed: ${failureMessage}`)
  }
  if (terminal !== "completed") {
    throw new Error("The Codex coding stream ended without a terminal event.")
  }
  if (finalResponse === null) {
    throw new Error("The Codex coding turn returned no structured result.")
  }
  return parseCodingOutput(finalResponse)
}

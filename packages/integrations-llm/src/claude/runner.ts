import type {
  ClaudeLlmProviderRuntimeConfig,
  LlmModelSpec,
  LlmResult,
  LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { type ClaudeApiClientFactory, runClaudeApiStream } from "./api-runner"
import { resolveClaudeAuth } from "./auth"
import { type ClaudeCliSpawn, runClaudeCliStream } from "./cli-runner"
import type { TraceSink } from "./trace"

export type ClaudeRunOptions = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
  trace?: TraceSink
  apiFactory?: ClaudeApiClientFactory
  cliSpawn?: ClaudeCliSpawn
  cliExecutable?: string
}

export async function runClaudeGenerate(
  options: ClaudeRunOptions,
  config: ClaudeLlmProviderRuntimeConfig | undefined,
): Promise<LlmResult> {
  let reply = ""
  let usage: LlmResult["usage"] | null = null
  for await (const event of runClaudeStream(options, config)) {
    if (event.kind === "text-delta") {
      reply += event.text
    } else if (event.kind === "done") {
      usage = event.usage
    }
  }
  if (usage === null) {
    throw new Error("Claude stream ended without a terminal usage event.")
  }
  return { reply, usage }
}

export async function* runClaudeStream(
  options: ClaudeRunOptions,
  config: ClaudeLlmProviderRuntimeConfig | undefined,
): AsyncIterable<LlmStreamEvent> {
  const resolved = resolveClaudeAuth(config)
  if (resolved.authMode === "api") {
    yield* runClaudeApiStream(
      {
        spec: options.spec,
        prompt: options.prompt,
        signal: options.signal,
        factory: options.apiFactory,
      },
      config,
      resolved,
    )
    return
  }
  yield* runClaudeCliStream(
    {
      spec: options.spec,
      prompt: options.prompt,
      signal: options.signal,
      trace: options.trace,
      spawn: options.cliSpawn,
      executable: options.cliExecutable,
    },
    resolved,
  )
}

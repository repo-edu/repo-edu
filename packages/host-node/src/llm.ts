import type {
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
  LlmStreamEvent,
} from "@repo-edu/host-runtime-contract"
import {
  type ClaudeCliLaunch,
  type CreateLlmTextClientOptions,
  createLlmTextClient,
} from "@repo-edu/integrations-llm"
import type {
  LlmRuntimeConfig,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import type { ChildProcessLifetimeAdapter } from "./child-process-lifetime.js"
import { mergeLlmRuntimeConfig } from "./llm-runtime-config.js"

export type CreateNodeLlmTextClientOptions = Pick<
  CreateLlmTextClientOptions,
  "trace"
> & {
  readonly claudeCliExecutable?: string
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

function createClaudeCliLaunch(
  childProcessLifetime: ChildProcessLifetimeAdapter,
): ClaudeCliLaunch {
  return async (request) => {
    return await childProcessLifetime.launch({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      env: request.env,
      route: "direct-adapter",
      shell: request.shell,
      signal: request.signal,
    })
  }
}

export function createNodeLlmTextClient(
  childProcessLifetime: ChildProcessLifetimeAdapter,
  config?: LlmRuntimeConfig,
  options?: CreateNodeLlmTextClientOptions,
): LlmTextClient {
  return createLlmTextClient(config, {
    claudeCli: {
      launch: createClaudeCliLaunch(childProcessLifetime),
      executable: options?.claudeCliExecutable,
    },
    trace: options?.trace,
  })
}

export function createNodeLlmPort(
  childProcessLifetime: ChildProcessLifetimeAdapter,
  config?: LlmRuntimeConfig,
): LlmPort {
  const client = createNodeLlmTextClient(childProcessLifetime, config)
  const clientForRequest = (request: LlmRunRequest) =>
    request.runtimeConfig === undefined
      ? client
      : createNodeLlmTextClient(
          childProcessLifetime,
          mergeLlmRuntimeConfig(
            config,
            request.runtimeConfig as LlmRuntimeConfig,
          ),
        )

  return {
    async run(request: LlmRunRequest): Promise<LlmRunResult> {
      throwIfAborted(request.signal)
      const result = await clientForRequest(request).generateText({
        spec: request.spec,
        prompt: request.prompt,
        signal: request.signal,
      })
      return {
        reply: result.reply,
        usage: result.usage,
      }
    },
    async *stream(request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
      throwIfAborted(request.signal)
      yield* clientForRequest(request).streamText({
        spec: request.spec,
        prompt: request.prompt,
        signal: request.signal,
      })
    },
  }
}

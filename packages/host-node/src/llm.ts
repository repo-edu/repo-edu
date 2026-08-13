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
import type {
  ChildProcessLifetimeAdapter,
  OwnedChildProcess,
} from "./child-process-lifetime.js"
import { mergeLlmRuntimeConfig } from "./llm-runtime-config.js"

export type CreateNodeLlmTextClientOptions = Pick<
  CreateLlmTextClientOptions,
  "trace"
> & {
  readonly claudeCliExecutable?: string
  readonly codexHelper?: NodeCodexHelperCommand
}

export type NodeCodexHelperCommand = {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly runAsNode: boolean
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

function buildCodexHelperEnvironment(
  command: NodeCodexHelperCommand,
): NodeJS.ProcessEnv {
  const environment = { ...process.env, ...command.env }
  if (command.runAsNode) {
    environment.ELECTRON_RUN_AS_NODE = "1"
  } else {
    delete environment.ELECTRON_RUN_AS_NODE
  }
  return environment
}

export async function launchNodeCodexHelper(
  childProcessLifetime: ChildProcessLifetimeAdapter,
  command: NodeCodexHelperCommand,
): Promise<OwnedChildProcess> {
  return await childProcessLifetime.launch({
    command: command.command,
    args: command.args,
    cwd: command.cwd,
    env: buildCodexHelperEnvironment(command),
    route: "managed-helper",
  })
}

function createCodexHelperLaunch(
  childProcessLifetime: ChildProcessLifetimeAdapter,
  command: NodeCodexHelperCommand,
): NonNullable<CreateLlmTextClientOptions["codexHelper"]>["launch"] {
  return async () => await launchNodeCodexHelper(childProcessLifetime, command)
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
    codexHelper:
      options?.codexHelper === undefined
        ? undefined
        : {
            launch: createCodexHelperLaunch(
              childProcessLifetime,
              options.codexHelper,
            ),
          },
    trace: options?.trace,
  })
}

export function createNodeLlmPort(
  childProcessLifetime: ChildProcessLifetimeAdapter,
  config?: LlmRuntimeConfig,
  options?: CreateNodeLlmTextClientOptions,
): LlmPort {
  const client = createNodeLlmTextClient(childProcessLifetime, config, options)
  const clientForRequest = (request: LlmRunRequest) =>
    request.runtimeConfig === undefined
      ? client
      : createNodeLlmTextClient(
          childProcessLifetime,
          mergeLlmRuntimeConfig(
            config,
            request.runtimeConfig as LlmRuntimeConfig,
          ),
          options,
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

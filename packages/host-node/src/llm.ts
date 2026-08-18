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
  ChildProcessLifetimeController,
  OwnedChildProcessTree,
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
  childProcessLifetimeController: ChildProcessLifetimeController,
): ClaudeCliLaunch {
  return async (request) => {
    return await childProcessLifetimeController.launch({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      env: request.env,
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
  childProcessLifetimeController: ChildProcessLifetimeController,
  command: NodeCodexHelperCommand,
  startupSignal: AbortSignal,
): Promise<OwnedChildProcessTree> {
  return await childProcessLifetimeController.launch({
    command: command.command,
    args: command.args,
    cwd: command.cwd,
    env: buildCodexHelperEnvironment(command),
    signal: startupSignal,
  })
}

function createCodexHelperLaunch(
  childProcessLifetimeController: ChildProcessLifetimeController,
  command: NodeCodexHelperCommand,
): NonNullable<CreateLlmTextClientOptions["codexHelper"]>["launch"] {
  return async (startupSignal) =>
    await launchNodeCodexHelper(
      childProcessLifetimeController,
      command,
      startupSignal,
    )
}

export function createNodeLlmTextClient(
  childProcessLifetimeController: ChildProcessLifetimeController,
  config?: LlmRuntimeConfig,
  options?: CreateNodeLlmTextClientOptions,
): LlmTextClient {
  return createLlmTextClient(config, {
    claudeCli: {
      launch: createClaudeCliLaunch(childProcessLifetimeController),
      executable: options?.claudeCliExecutable,
    },
    codexHelper:
      options?.codexHelper === undefined
        ? undefined
        : {
            launch: createCodexHelperLaunch(
              childProcessLifetimeController,
              options.codexHelper,
            ),
          },
    trace: options?.trace,
  })
}

export function createNodeLlmPort(
  childProcessLifetimeController: ChildProcessLifetimeController,
  config?: LlmRuntimeConfig,
  options?: CreateNodeLlmTextClientOptions,
): LlmPort {
  const client = createNodeLlmTextClient(
    childProcessLifetimeController,
    config,
    options,
  )
  const clientForRequest = (request: LlmRunRequest) =>
    request.runtimeConfig === undefined
      ? client
      : createNodeLlmTextClient(
          childProcessLifetimeController,
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

import { afterEach, beforeEach } from "node:test"
import type {
  Codex,
  Input as CodexInput,
  CodexOptions,
  ThreadEvent,
  ThreadOptions,
  TurnOptions,
} from "@openai/codex-sdk"
import type {
  GenerateTextRequest,
  LlmModelSpec,
} from "@repo-edu/integrations-llm-contract"

export const CODEX = "CODEX_API_KEY"

export const codexSpec: LlmModelSpec = {
  provider: "codex",
  family: "gpt-5.4",
  modelId: "gpt-5.4",
  effort: "medium",
}

export const codexMaxSpec: LlmModelSpec = {
  provider: "codex",
  family: "gpt-5.5",
  modelId: "gpt-5.5",
  effort: "max",
}

export const claudeSpec: LlmModelSpec = {
  provider: "claude",
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "medium",
}

export type FakeCall = {
  constructorOptions: CodexOptions
  threadOptions: ThreadOptions
  promptInput: string
  observedEnvKey: string | undefined
}

export type FakeOutcome = {
  events?: ThreadEvent[]
  throwOnRun?: unknown
  delayBeforeEventsMs?: number
}

export function installCodexEnvHooks(): void {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env[CODEX]
    delete process.env[CODEX]
  })

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[CODEX]
    } else {
      process.env[CODEX] = saved
    }
  })
}

export function createFakeCodex(outcome: FakeOutcome): {
  factory: (options: CodexOptions) => Codex
  calls: FakeCall[]
} {
  const calls: FakeCall[] = []
  const factory = (constructorOptions: CodexOptions): Codex => {
    return {
      startThread(threadOptions: ThreadOptions = {}) {
        return {
          get id() {
            return null
          },
          async runStreamed(input: CodexInput, _turnOptions?: TurnOptions) {
            calls.push({
              constructorOptions,
              threadOptions,
              promptInput: typeof input === "string" ? input : "",
              observedEnvKey: process.env[CODEX],
            })
            const events = outcome.events ?? []
            const throwOnRun = outcome.throwOnRun
            return {
              events: (async function* () {
                if (throwOnRun) throw throwOnRun
                if (outcome.delayBeforeEventsMs !== undefined) {
                  await new Promise((resolve) =>
                    setTimeout(resolve, outcome.delayBeforeEventsMs),
                  )
                }
                for (const event of events) yield event
              })(),
            }
          },
          async run() {
            throw new Error("fake.run() not used; runStreamed is the path")
          },
        } as unknown as ReturnType<Codex["startThread"]>
      },
      resumeThread() {
        throw new Error("fake.resumeThread() not used in tests")
      },
    } as unknown as Codex
  }
  return { factory, calls }
}

export function request(
  spec: LlmModelSpec,
  prompt = "ping",
): GenerateTextRequest {
  return { spec, prompt }
}

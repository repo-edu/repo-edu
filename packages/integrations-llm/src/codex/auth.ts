import type { CodexOptions } from "@openai/codex-sdk"
import {
  type CodexLlmProviderRuntimeConfig,
  type LlmAuthMode,
  LlmError,
} from "@repo-edu/integrations-llm-contract"

const CODEX_API_KEY_VAR = "CODEX_API_KEY"

export type ResolvedCodexAuth = {
  readonly authMode: LlmAuthMode
  readonly clientOptions: CodexOptions
}

function buildChildEnvironment(
  overrides: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const childEnvironment: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      childEnvironment[key] = value
    }
  }
  Object.assign(childEnvironment, overrides)
  return childEnvironment
}

export function resolveCodexAuth(
  config: CodexLlmProviderRuntimeConfig | undefined,
): ResolvedCodexAuth {
  const childEnvironment = buildChildEnvironment(config?.env)
  const envApiKey = childEnvironment[CODEX_API_KEY_VAR]
  const explicitKey = config?.apiKey
  const effectiveKey = explicitKey ?? envApiKey
  const explicitMode = config?.authMode

  const authMode: LlmAuthMode =
    explicitMode ??
    (effectiveKey && effectiveKey.length > 0 ? "api" : "subscription")

  let apiKey: string | undefined

  if (authMode === "api") {
    if (!effectiveKey || effectiveKey.length === 0) {
      throw new LlmError(
        "auth",
        `Codex auth mode "api" requires ${CODEX_API_KEY_VAR} via config.apiKey or the environment.`,
        { context: { provider: "codex", authMode: "api" } },
      )
    }
    apiKey = effectiveKey
    childEnvironment[CODEX_API_KEY_VAR] = effectiveKey
  } else {
    apiKey = undefined
    delete childEnvironment[CODEX_API_KEY_VAR]
  }

  const clientOptions: CodexOptions = {
    apiKey,
    baseUrl: config?.baseUrl,
    codexPathOverride: config?.binaryPath,
    env: childEnvironment,
  }
  Object.freeze(childEnvironment)
  Object.freeze(clientOptions)

  return Object.freeze({
    authMode,
    clientOptions,
  })
}

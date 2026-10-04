import {
  type ClaudeLlmProviderRuntimeConfig,
  type LlmAuthMode,
  LlmError,
} from "@repo-edu/integrations-llm-contract"

const ANTHROPIC_API_KEY_VAR = "ANTHROPIC_API_KEY"

export type ResolvedClaudeApiAuth = {
  authMode: "api"
  apiKey: string
  baseUrl: string | undefined
}

export type ResolvedClaudeSubscriptionAuth = {
  authMode: "subscription"
  childEnv: NodeJS.ProcessEnv
}

export type ResolvedClaudeAuth =
  | ResolvedClaudeApiAuth
  | ResolvedClaudeSubscriptionAuth

function resolveBaseEnv(
  config: ClaudeLlmProviderRuntimeConfig | undefined,
): Record<string, string | undefined> {
  return { ...process.env, ...(config?.env ?? {}) }
}

function childEnvWithoutApiKey(
  baseEnv: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined) {
      childEnv[key] = value
    }
  }
  delete childEnv[ANTHROPIC_API_KEY_VAR]
  return childEnv
}

export function resolveClaudeAuth(
  config: ClaudeLlmProviderRuntimeConfig | undefined,
): ResolvedClaudeAuth {
  const baseEnv = resolveBaseEnv(config)
  const envApiKey = baseEnv[ANTHROPIC_API_KEY_VAR]
  const explicitKey = config?.apiKey
  const effectiveKey = explicitKey ?? envApiKey
  const explicitMode = config?.authMode

  const authMode: LlmAuthMode =
    explicitMode ??
    (effectiveKey && effectiveKey.length > 0 ? "api" : "subscription")

  if (authMode === "api") {
    if (!effectiveKey || effectiveKey.length === 0) {
      throw new LlmError(
        "auth",
        `Claude auth mode "api" requires ${ANTHROPIC_API_KEY_VAR} via config.apiKey or the environment.`,
        {
          context: { provider: "claude", authMode: "api", outcome: "refused" },
        },
      )
    }
    return {
      authMode: "api",
      apiKey: effectiveKey,
      baseUrl: config?.baseUrl,
    }
  }

  return {
    authMode: "subscription",
    childEnv: childEnvWithoutApiKey(baseEnv),
  }
}

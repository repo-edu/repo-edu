import {
  type LlmAuthMode,
  LlmError,
  type LlmProviderRuntimeConfig,
} from "@repo-edu/integrations-llm-contract"
import { applyEnvOverrides as applyEnvOverridesShared } from "../env"

const ANTHROPIC_API_KEY_VAR = "ANTHROPIC_API_KEY"

export type ResolvedClaudeAuth = {
  authMode: LlmAuthMode
  envOverrides: Record<string, string>
  unsetVars: string[]
}

function resolveBaseEnv(
  config: LlmProviderRuntimeConfig | undefined,
): Record<string, string | undefined> {
  return { ...process.env, ...(config?.env ?? {}) }
}

export function resolveClaudeAuth(
  config: LlmProviderRuntimeConfig | undefined,
): ResolvedClaudeAuth {
  const baseEnv = resolveBaseEnv(config)
  const envApiKey = baseEnv[ANTHROPIC_API_KEY_VAR]
  const explicitKey = config?.apiKey
  const effectiveKey = explicitKey ?? envApiKey
  const explicitMode = config?.authMode

  const authMode: LlmAuthMode =
    explicitMode ??
    (effectiveKey && effectiveKey.length > 0 ? "api" : "subscription")

  const envOverrides: Record<string, string> = {}
  const unsetVars: string[] = []

  if (authMode === "api") {
    if (!effectiveKey || effectiveKey.length === 0) {
      throw new LlmError(
        "auth",
        `Claude auth mode "api" requires ${ANTHROPIC_API_KEY_VAR} via config.apiKey or the environment.`,
        { context: { provider: "claude", authMode: "api" } },
      )
    }
    if (effectiveKey !== envApiKey) {
      envOverrides[ANTHROPIC_API_KEY_VAR] = effectiveKey
    }
  } else if (envApiKey || config?.env?.[ANTHROPIC_API_KEY_VAR]) {
    unsetVars.push(ANTHROPIC_API_KEY_VAR)
  }

  return { authMode, envOverrides, unsetVars }
}

export function applyEnvOverrides(resolved: ResolvedClaudeAuth): {
  restore: () => void
} {
  return applyEnvOverridesShared(resolved)
}

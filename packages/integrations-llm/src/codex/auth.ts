import {
  type LlmAuthMode,
  LlmError,
  type LlmProviderRuntimeConfig,
} from "@repo-edu/integrations-llm-contract"
import { applyEnvOverrides as applyEnvOverridesShared } from "../env"

const CODEX_API_KEY_VAR = "CODEX_API_KEY"

export type ResolvedCodexAuth = {
  authMode: LlmAuthMode
  apiKey: string | undefined
  baseUrl: string | undefined
  envOverrides: Record<string, string>
  unsetVars: string[]
}

function resolveBaseEnv(
  config: LlmProviderRuntimeConfig | undefined,
): Record<string, string | undefined> {
  return { ...process.env, ...(config?.env ?? {}) }
}

export function resolveCodexAuth(
  config: LlmProviderRuntimeConfig | undefined,
): ResolvedCodexAuth {
  const baseEnv = resolveBaseEnv(config)
  const envApiKey = baseEnv[CODEX_API_KEY_VAR]
  const explicitKey = config?.apiKey
  const effectiveKey = explicitKey ?? envApiKey
  const explicitMode = config?.authMode

  const authMode: LlmAuthMode =
    explicitMode ??
    (effectiveKey && effectiveKey.length > 0 ? "api" : "subscription")

  const envOverrides: Record<string, string> = {}
  const unsetVars: string[] = []
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
  } else {
    apiKey = undefined
    if (envApiKey || config?.env?.[CODEX_API_KEY_VAR]) {
      unsetVars.push(CODEX_API_KEY_VAR)
    }
  }

  // Forward additional config.env overrides (excluding the API-key var, which
  // is handled separately above so the auth mode stays authoritative).
  for (const [key, value] of Object.entries(config?.env ?? {})) {
    if (key === CODEX_API_KEY_VAR) continue
    envOverrides[key] = value
  }

  return {
    authMode,
    apiKey,
    baseUrl: config?.baseUrl,
    envOverrides,
    unsetVars,
  }
}

export function applyEnvOverrides(resolved: ResolvedCodexAuth): {
  restore: () => void
} {
  return applyEnvOverridesShared(resolved)
}

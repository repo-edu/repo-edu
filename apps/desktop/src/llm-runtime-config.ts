import type { PersistedAppCredentials } from "@repo-edu/domain/settings"
import {
  type PersistedLlmConnection,
  resolveActiveLlmConnection,
} from "@repo-edu/domain/settings"
import type { LlmRuntimeConfig } from "@repo-edu/integrations-llm-contract"

type DesktopLlmRuntimeConfigOptions = {
  codexBinaryPath?: string
}

function hostCarrierConfig(
  options: DesktopLlmRuntimeConfigOptions,
): LlmRuntimeConfig {
  return options.codexBinaryPath === undefined
    ? {}
    : { codex: { binaryPath: options.codexBinaryPath } }
}

function connectionRuntimeConfig(
  connection: PersistedLlmConnection,
  options: DesktopLlmRuntimeConfigOptions,
): LlmRuntimeConfig {
  if (connection.provider === "claude") {
    return connection.authMode === "subscription"
      ? { claude: { authMode: "subscription" } }
      : {
          claude: {
            authMode: "api",
            apiKey: connection.apiKey,
            maxTokens: connection.maxTokens,
          },
        }
  }
  return connection.authMode === "subscription"
    ? {
        codex: {
          authMode: "subscription",
          ...(options.codexBinaryPath === undefined
            ? {}
            : { binaryPath: options.codexBinaryPath }),
        },
      }
    : {
        codex: {
          authMode: "api",
          apiKey: connection.apiKey,
          ...(options.codexBinaryPath === undefined
            ? {}
            : { binaryPath: options.codexBinaryPath }),
        },
      }
}

function mergeRuntimeConfig(
  carrier: LlmRuntimeConfig,
  credentials: LlmRuntimeConfig,
): LlmRuntimeConfig {
  const codex = {
    ...(carrier.codex ?? {}),
    ...(credentials.codex ?? {}),
  }
  return {
    ...(credentials.claude === undefined ? {} : { claude: credentials.claude }),
    ...(Object.keys(codex).length === 0 ? {} : { codex }),
  }
}

export function desktopLlmRuntimeConfigFromSettings(
  settings: PersistedAppCredentials,
  options: DesktopLlmRuntimeConfigOptions,
): LlmRuntimeConfig {
  const carrier = hostCarrierConfig(options)
  const active = resolveActiveLlmConnection(settings)
  if (active === null) return carrier
  return mergeRuntimeConfig(carrier, connectionRuntimeConfig(active, options))
}

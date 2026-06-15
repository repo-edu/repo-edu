import type {
  ClaudeLlmProviderRuntimeConfig,
  CodexLlmProviderRuntimeConfig,
  LlmProviderRuntimeConfig,
  LlmRuntimeConfig,
} from "@repo-edu/integrations-llm-contract"

function providerCarrierConfig(
  base: LlmProviderRuntimeConfig | undefined,
): LlmProviderRuntimeConfig {
  return {
    ...(base?.env === undefined ? {} : { env: base.env }),
    ...(base?.baseUrl === undefined ? {} : { baseUrl: base.baseUrl }),
  }
}

function mergeClaudeRuntimeConfig(
  base: ClaudeLlmProviderRuntimeConfig | undefined,
  override: ClaudeLlmProviderRuntimeConfig | undefined,
): ClaudeLlmProviderRuntimeConfig | undefined {
  if (override === undefined) {
    return base
  }

  return {
    ...providerCarrierConfig(base),
    ...override,
  }
}

function mergeCodexRuntimeConfig(
  base: CodexLlmProviderRuntimeConfig | undefined,
  override: CodexLlmProviderRuntimeConfig | undefined,
): CodexLlmProviderRuntimeConfig | undefined {
  if (override === undefined) {
    return base
  }

  return {
    ...providerCarrierConfig(base),
    ...(base?.binaryPath === undefined ? {} : { binaryPath: base.binaryPath }),
    ...override,
  }
}

export function mergeLlmRuntimeConfig(
  base: LlmRuntimeConfig | undefined,
  override: LlmRuntimeConfig | undefined,
): LlmRuntimeConfig | undefined {
  if (override === undefined) {
    return base
  }

  return {
    claude: mergeClaudeRuntimeConfig(base?.claude, override.claude),
    codex: mergeCodexRuntimeConfig(base?.codex, override.codex),
  }
}

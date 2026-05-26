import type { LlmProviderKind } from "@repo-edu/domain/settings"
import {
  getExaminationDefaultSpec,
  getSpecByCode,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"

export const PROVIDER_LABEL: Record<LlmProviderKind, string> = {
  claude: "Claude",
  codex: "Codex",
}

export function formatSpecLabel(spec: {
  provider: LlmProviderKind
  family: string
  effort: string
}): string {
  const provider = PROVIDER_LABEL[spec.provider]
  return spec.effort === "none"
    ? `${provider} ${spec.family}`
    : `${provider} ${spec.family} (${spec.effort})`
}

export function resolveExaminationModelCode(
  provider: LlmProviderKind,
  byProvider: Partial<Record<LlmProviderKind, string>>,
): string | null {
  const persisted = byProvider[provider]
  if (typeof persisted === "string" && persisted.length > 0) {
    const spec = getSpecByCode(persisted)
    if (spec !== undefined && spec.provider === provider) {
      return persisted
    }
  }
  const fallback = getExaminationDefaultSpec(provider)
  return fallback === undefined ? null : modelCode(fallback)
}

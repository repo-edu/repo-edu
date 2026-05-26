import type { ExaminationLlmSettings } from "@repo-edu/application-contract"
import {
  type PersistedLlmConnection,
  resolveActiveLlmConnection,
} from "@repo-edu/domain/settings"
import {
  type FixtureModelSpec,
  getExaminationDefaultSpec,
  getSpecByCode,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"
import type { LlmProvider } from "@repo-edu/integrations-llm-contract"
import { createValidationAppError } from "../core.js"

export type ExaminationModelResolution = {
  spec: FixtureModelSpec
  code: string
  connection: PersistedLlmConnection
}

export function resolveExaminationModel(
  settings: ExaminationLlmSettings,
): ExaminationModelResolution {
  const connection = resolveActiveLlmConnection(settings)
  if (connection === null) {
    throw createValidationAppError("No LLM connection is configured.", [
      {
        path: "llmSettings.activeLlmConnectionId",
        message:
          "Add an LLM connection in Settings -> LLM Connections before generating questions.",
      },
    ])
  }
  const provider = connection.provider as LlmProvider
  const explicit = lookupExplicitProviderCode(provider, connection, settings)
  if (explicit !== null) {
    return { connection, ...explicit }
  }
  const fallback = getExaminationDefaultSpec(provider)
  if (fallback === undefined) {
    throw createValidationAppError(
      `No default examination model is registered for provider '${provider}'.`,
      [
        {
          path: "llmSettings.examinationModelsByProvider",
          message: `Catalog is missing an examinationDefault entry for ${provider}.`,
        },
      ],
    )
  }
  return { connection, spec: fallback, code: modelCode(fallback) }
}

function lookupExplicitProviderCode(
  provider: LlmProvider,
  connection: PersistedLlmConnection,
  settings: ExaminationLlmSettings,
): { spec: FixtureModelSpec; code: string } | null {
  const value = settings.examinationModelsByProvider[provider]
  const codeFromSettings =
    typeof value === "string" && value.length > 0 ? value : null
  if (codeFromSettings === null) return null
  const spec = getSpecByCode(codeFromSettings)
  if (spec === undefined) {
    throw createValidationAppError(
      `Unknown model code '${codeFromSettings}' for provider '${provider}'.`,
      [
        {
          path: `llmSettings.examinationModelsByProvider.${provider}`,
          message: `Code '${codeFromSettings}' is not in the catalog.`,
        },
      ],
    )
  }
  if (spec.provider !== connection.provider) {
    throw createValidationAppError(
      "Selected model does not match the active LLM connection's provider.",
      [
        {
          path: `llmSettings.examinationModelsByProvider.${provider}`,
          message: `Code '${codeFromSettings}' is for provider ${spec.provider} but the active LLM connection is provider ${connection.provider}.`,
        },
      ],
    )
  }
  return { spec, code: codeFromSettings }
}

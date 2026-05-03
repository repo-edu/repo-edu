import type {
  LlmAuthMode,
  LlmEffort,
  LlmModelSpec,
  LlmProvider,
  LlmUsage,
} from "@repo-edu/integrations-llm-contract"

export type PriceCard = {
  input: number
  cachedInput: number
  output: number
}

export type FixtureModelSpec = LlmModelSpec & {
  displayName: string
  versionTag: string
  priceUsdPerMTok: PriceCard | undefined
  verifyDefault?: true
  examinationDefault?: true
}

export type Phase = "mp" | "mc"

export type SupportedEfforts = ReadonlyArray<LlmEffort>

export type { LlmAuthMode, LlmEffort, LlmModelSpec, LlmProvider, LlmUsage }

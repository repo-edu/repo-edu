import type {
  LlmEffort,
  LlmProvider,
} from "@repo-edu/integrations-llm-contract"
import { getPriceCard } from "./pricing"
import type { FixtureModelSpec } from "./types"

// ---------------------------------------------------------------------------
// Tier metadata
//
// Adding a model: declare its tier here, list the efforts it supports, and add
// a code-table block below. Pricing lives in pricing.ts.
// ---------------------------------------------------------------------------

type Tier = {
  provider: LlmProvider
  family: string
  modelId: string
  versionTag: string
  stem: string
  codes: ReadonlyArray<{ code: string; effort: LlmEffort }>
  /** Effort whose spec is the per-provider draft-verification default. */
  verifyDefaultEffort?: LlmEffort
  /** Effort whose spec is the per-provider examination-workflow default. */
  examinationDefaultEffort?: LlmEffort
}

const TIERS: Tier[] = [
  {
    provider: "claude",
    family: "haiku",
    modelId: "claude-haiku-4-5",
    versionTag: "45",
    stem: "1",
    codes: [{ code: "1", effort: "none" }],
    verifyDefaultEffort: "none",
  },
  {
    provider: "claude",
    family: "sonnet",
    modelId: "claude-sonnet-4-6",
    versionTag: "46",
    stem: "2",
    codes: [
      { code: "21", effort: "low" },
      { code: "22", effort: "medium" },
      { code: "23", effort: "high" },
    ],
    examinationDefaultEffort: "medium",
  },
  {
    provider: "claude",
    family: "opus",
    modelId: "claude-opus-4-7",
    versionTag: "47",
    stem: "3",
    codes: [
      { code: "31", effort: "low" },
      { code: "32", effort: "medium" },
      { code: "33", effort: "high" },
      { code: "34", effort: "xhigh" },
      { code: "35", effort: "max" },
    ],
  },
  {
    provider: "codex",
    family: "gpt-5.4-mini",
    modelId: "gpt-5.4-mini",
    versionTag: "54m",
    stem: "c54m",
    codes: [{ code: "c54m", effort: "none" }],
    verifyDefaultEffort: "none",
  },
  {
    provider: "codex",
    family: "gpt-5.4",
    modelId: "gpt-5.4",
    versionTag: "54",
    stem: "c54",
    codes: [
      { code: "c541", effort: "low" },
      { code: "c542", effort: "medium" },
      { code: "c543", effort: "high" },
      { code: "c544", effort: "xhigh" },
    ],
    examinationDefaultEffort: "medium",
  },
  {
    provider: "codex",
    family: "gpt-5.5",
    modelId: "gpt-5.5",
    versionTag: "55",
    stem: "c55",
    codes: [
      { code: "c551", effort: "low" },
      { code: "c552", effort: "medium" },
      { code: "c553", effort: "high" },
      { code: "c554", effort: "xhigh" },
    ],
  },
]

// Providers whose models are usable from the coder phase (`mc`).
export const codingAgentProviders: ReadonlySet<LlmProvider> = new Set([
  "claude",
  "codex",
])

function buildSpec(tier: Tier, effort: LlmEffort): FixtureModelSpec {
  const displayName =
    effort === "none" ? tier.family : `${tier.family}-${effort}`
  const spec: FixtureModelSpec = {
    provider: tier.provider,
    family: tier.family,
    modelId: tier.modelId,
    effort,
    displayName,
    versionTag: tier.versionTag,
    priceUsdPerMTok: getPriceCard(tier.modelId),
  }
  if (tier.verifyDefaultEffort === effort) {
    spec.verifyDefault = true
  }
  if (tier.examinationDefaultEffort === effort) {
    spec.examinationDefault = true
  }
  return spec
}

const codeTable = new Map<string, FixtureModelSpec>()
const codeBySpec = new Map<FixtureModelSpec, string>()
const codesByTier = new Map<Tier, string[]>()
const tierByFamilyProvider = new Map<string, Tier>()

for (const tier of TIERS) {
  tierByFamilyProvider.set(`${tier.provider}::${tier.family}`, tier)
  const tierCodes: string[] = []
  for (const { code, effort } of tier.codes) {
    const spec = buildSpec(tier, effort)
    codeTable.set(code, spec)
    codeBySpec.set(spec, code)
    tierCodes.push(code)
  }
  codesByTier.set(tier, tierCodes)
}

export function listCodes(): string[] {
  return [...codeTable.keys()].sort()
}

export function getSpecByCode(code: string): FixtureModelSpec | undefined {
  return codeTable.get(code)
}

export function listCodesForTierStem(stem: string): string[] {
  const tier = TIERS.find((candidate) => candidate.stem === stem)
  return tier ? [...(codesByTier.get(tier) ?? [])].sort() : []
}

export function tierOf(spec: {
  provider: LlmProvider
  family: string
}): Tier | undefined {
  return tierByFamilyProvider.get(`${spec.provider}::${spec.family}`)
}

export function allCatalogSpecs(): FixtureModelSpec[] {
  return [...codeTable.values()]
}

export function listCatalogSpecsForProvider(
  provider: LlmProvider,
): FixtureModelSpec[] {
  return allCatalogSpecs().filter((spec) => spec.provider === provider)
}

export function getVerifyDefaultSpec(
  provider: LlmProvider,
): FixtureModelSpec | undefined {
  return allCatalogSpecs().find(
    (spec) => spec.provider === provider && spec.verifyDefault === true,
  )
}

export function getExaminationDefaultSpec(
  provider: LlmProvider,
): FixtureModelSpec | undefined {
  return allCatalogSpecs().find(
    (spec) => spec.provider === provider && spec.examinationDefault === true,
  )
}

export function codeForSpec(spec: FixtureModelSpec): string | undefined {
  const direct = codeBySpec.get(spec)
  if (direct) return direct
  for (const [code, candidate] of codeTable) {
    if (
      candidate.provider === spec.provider &&
      candidate.family === spec.family &&
      candidate.modelId === spec.modelId &&
      candidate.effort === spec.effort
    ) {
      return code
    }
  }
  return undefined
}

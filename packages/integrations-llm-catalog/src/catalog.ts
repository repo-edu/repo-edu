import type {
  LlmEffort,
  LlmProvider,
} from "@repo-edu/integrations-llm-contract"
import { getPriceCard } from "./pricing"
import type { FixtureModelSpec, SupportedEfforts } from "./types"

// ---------------------------------------------------------------------------
// Tier metadata
//
// Adding a model: declare its tier here, list the efforts it supports, and add
// a code-table block below. Pricing lives in pricing.ts. Codex tiers land
// with the Codex provider plan.
// ---------------------------------------------------------------------------

type Tier = {
  provider: LlmProvider
  family: string
  modelId: string
  versionTag: string
  /** Short-code stem before the optional effort digit, e.g. "2" or "c3". */
  codeStem: string
  supportedEfforts: SupportedEfforts
}

const TIERS: Tier[] = [
  {
    provider: "claude",
    family: "haiku",
    modelId: "claude-haiku-4-5",
    versionTag: "45",
    codeStem: "1",
    supportedEfforts: ["none"],
  },
  {
    provider: "claude",
    family: "sonnet",
    modelId: "claude-sonnet-4-6",
    versionTag: "46",
    codeStem: "2",
    supportedEfforts: ["low", "medium", "high"],
  },
  {
    provider: "claude",
    family: "opus",
    modelId: "claude-opus-4-7",
    versionTag: "47",
    codeStem: "3",
    supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
]

// Providers whose models are usable from the coder phase (`mc`). The coder
// surface is Claude-internal; Codex models cannot be used as coders.
export const codingAgentProviders: ReadonlySet<LlmProvider> = new Set([
  "claude",
])

// Effort digit used in short codes. "none" omits the digit (haiku → "1", not
// "10"). The high-effort variant doubles as the tier-only alias (`2` ≡ `23`,
// `3` ≡ `33`).
const EFFORT_DIGIT: Record<LlmEffort, string> = {
  none: "",
  minimal: "0",
  low: "1",
  medium: "2",
  high: "3",
  xhigh: "4",
  max: "5",
}

function buildSpec(tier: Tier, effort: LlmEffort): FixtureModelSpec {
  const displayName =
    effort === "none" ? tier.family : `${tier.family}-${effort}`
  return {
    provider: tier.provider,
    family: tier.family,
    modelId: tier.modelId,
    effort,
    displayName,
    versionTag: tier.versionTag,
    priceUsdPerMTok: getPriceCard(tier.modelId),
  }
}

function canonicalCode(tier: Tier, effort: LlmEffort): string {
  return `${tier.codeStem}${EFFORT_DIGIT[effort]}`
}

const codeTable = new Map<string, FixtureModelSpec>()
const tierByFamilyProvider = new Map<string, Tier>()

for (const tier of TIERS) {
  tierByFamilyProvider.set(`${tier.provider}::${tier.family}`, tier)
  for (const effort of tier.supportedEfforts) {
    const spec = buildSpec(tier, effort)
    codeTable.set(canonicalCode(tier, effort), spec)
    // Tier-only alias collapses to high (or to the sole supported effort for
    // effort-less families like haiku).
    const aliasEffort: LlmEffort = tier.supportedEfforts.includes("high")
      ? "high"
      : tier.supportedEfforts[0]
    if (effort === aliasEffort) {
      codeTable.set(tier.codeStem, spec)
    }
  }
}

export function listCodes(): string[] {
  return [...codeTable.keys()].sort()
}

export function getSpecByCode(code: string): FixtureModelSpec | undefined {
  return codeTable.get(code)
}

export function listCodesForTierStem(stem: string): string[] {
  return [...codeTable.keys()].filter((code) => code.startsWith(stem)).sort()
}

export function tierOf(spec: {
  provider: LlmProvider
  family: string
}): Tier | undefined {
  return tierByFamilyProvider.get(`${spec.provider}::${spec.family}`)
}

export function allCatalogSpecs(): FixtureModelSpec[] {
  // Deduplicate: tier-only alias reuses the high-effort spec instance.
  const seen = new Set<FixtureModelSpec>()
  for (const spec of codeTable.values()) seen.add(spec)
  return [...seen]
}

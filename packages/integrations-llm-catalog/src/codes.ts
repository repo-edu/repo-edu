import {
  codingAgentProviders,
  getSpecByCode,
  listCodesForTierStem,
  tierOf,
} from "./catalog"
import type { FixtureModelSpec, Phase } from "./types"

export class ModelCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelCodeError"
  }
}

export function parseShortCode(code: string, phase: Phase): FixtureModelSpec {
  const spec = getSpecByCode(code)
  if (!spec) {
    const stem = code.match(/^([a-z]*\d)/)?.[1]
    const tierCodes = stem ? listCodesForTierStem(stem) : []
    const hint =
      tierCodes.length > 0
        ? ` supported codes for tier ${stem}: ${tierCodes.join(", ")}`
        : ""
    throw new ModelCodeError(`unknown model code "${code}";${hint}`)
  }
  if (phase === "mc" && !codingAgentProviders.has(spec.provider)) {
    const allowed = [...codingAgentProviders].join(", ")
    throw new ModelCodeError(
      `${spec.provider} models are not supported for the coder phase (mc); use one of: ${allowed} (e.g. 22 / 33 / 35)`,
    )
  }
  return spec
}

const EFFORT_DIGIT: Record<FixtureModelSpec["effort"], string> = {
  none: "",
  minimal: "0",
  low: "1",
  medium: "2",
  high: "3",
  xhigh: "4",
  max: "5",
}

export function modelCode(spec: FixtureModelSpec): string {
  const tier = tierOf(spec)
  if (!tier) {
    throw new ModelCodeError(
      `no catalog tier for provider="${spec.provider}", family="${spec.family}"`,
    )
  }
  return `${tier.codeStem}${EFFORT_DIGIT[spec.effort]}`
}

export function archivalModelCode(spec: FixtureModelSpec): string {
  return `${modelCode(spec)}-${spec.versionTag}`
}

export function formatModelSpec(spec: FixtureModelSpec): string {
  return spec.displayName
}

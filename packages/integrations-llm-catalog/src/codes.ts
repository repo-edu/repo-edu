import {
  codeForSpec,
  codingAgentProviders,
  getSpecByCode,
  listCodesForTierStem,
} from "./catalog"
import type { FixtureModelSpec, Phase } from "./types"

export class ModelCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelCodeError"
  }
}

function tierStemForUnknownCode(code: string): string | undefined {
  if (code.startsWith("c54m")) return "c54m"
  const codex = code.match(/^c\d{2}/)
  if (codex) return codex[0]
  const claude = code.match(/^\d/)
  return claude?.[0]
}

export function parseShortCode(code: string, phase: Phase): FixtureModelSpec {
  const spec = getSpecByCode(code)
  if (!spec) {
    const stem = tierStemForUnknownCode(code)
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

export function modelCode(spec: FixtureModelSpec): string {
  const code = codeForSpec(spec)
  if (!code) {
    throw new ModelCodeError(
      `no catalog tier for provider="${spec.provider}", family="${spec.family}"`,
    )
  }
  return code
}

export function archivalModelCode(spec: FixtureModelSpec): string {
  return `${modelCode(spec)}-${spec.versionTag}`
}

export function formatModelSpec(spec: FixtureModelSpec): string {
  return spec.displayName
}
